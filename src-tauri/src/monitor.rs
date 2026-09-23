use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tokio::sync::broadcast;

use crate::reader::{fnv1a, snapshot};

const POLL: Duration = Duration::from_millis(800);
const DEBOUNCE: Duration = Duration::from_millis(140);
const HISTORY: usize = 60;

#[derive(Clone)]
pub enum WsMsg {
    Binary(Arc<Vec<u8>>),
    Text(Arc<String>),
}

#[derive(Serialize, Clone, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub path: Option<String>,
    pub watching: bool,
    pub error: Option<String>,
    pub error_code: Option<String>,
    pub size: Option<u64>,
    pub mtime: Option<u64>,
    pub last_read_at: Option<u64>,
    pub reads: u64,
}

enum Cmd {
    SetTarget(Option<PathBuf>),
    SetFollow(bool),
    Refresh,
}

enum Ev {
    Fs,
    Cmd(Cmd),
}

struct Shared {
    status: Status,
    history: VecDeque<Arc<Vec<u8>>>,
    last_hash: u64,
}

pub struct Monitor {
    tx: broadcast::Sender<WsMsg>,
    shared: Mutex<Shared>,
    cmd: Sender<Ev>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn stat_of(path: &Path) -> Option<(u64, u64)> {
    let meta = std::fs::metadata(path).ok()?;
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    Some((meta.len(), mtime))
}

fn slot_siblings(path: &Path) -> Vec<PathBuf> {
    let Some(stem) = path
        .file_name()
        .and_then(|name| name.to_str())
        .and_then(|name| name.strip_suffix(".dat"))
    else {
        return Vec::new();
    };
    let Some(slot) = stem.chars().last().filter(|c| matches!(c, '1'..='3')) else {
        return Vec::new();
    };
    let base = &stem[..stem.len() - 1];
    ['1', '2', '3']
        .into_iter()
        .filter(|&digit| digit != slot)
        .map(|digit| path.with_file_name(format!("{base}{digit}.dat")))
        .collect()
}

fn newer_slot(target: &Path, since: u64) -> Option<PathBuf> {
    let floor = stat_of(target).map(|(_, mtime)| mtime).unwrap_or(0).max(since);
    slot_siblings(target)
        .into_iter()
        .filter_map(|path| stat_of(&path).map(|(_, mtime)| (mtime, path)))
        .filter(|(mtime, _)| *mtime > floor)
        .max_by_key(|(mtime, _)| *mtime)
        .map(|(_, path)| path)
}

fn frame(header: String, body: &[u8]) -> Arc<Vec<u8>> {
    let head = header.as_bytes();
    let mut out = Vec::with_capacity(4 + head.len() + body.len());
    out.extend_from_slice(&(head.len() as u32).to_le_bytes());
    out.extend_from_slice(head);
    out.extend_from_slice(body);
    Arc::new(out)
}

impl Monitor {
    pub fn start(initial: Option<PathBuf>, follow: bool) -> Arc<Monitor> {
        let (tx, _) = broadcast::channel(16);
        let (cmd_tx, cmd_rx) = channel::<Ev>();
        let monitor = Arc::new(Monitor {
            tx,
            shared: Mutex::new(Shared {
                status: Status::default(),
                history: VecDeque::new(),
                last_hash: 0,
            }),
            cmd: cmd_tx.clone(),
        });
        let worker = Arc::clone(&monitor);
        std::thread::Builder::new()
            .name("save-monitor".into())
            .spawn(move || worker.run(cmd_rx, cmd_tx, initial, follow))
            .expect("spawn save monitor");
        monitor
    }

    pub fn subscribe(&self) -> broadcast::Receiver<WsMsg> {
        self.tx.subscribe()
    }

    pub fn status(&self) -> Status {
        self.shared.lock().unwrap().status.clone()
    }

    pub fn history(&self) -> Vec<Arc<Vec<u8>>> {
        self.shared.lock().unwrap().history.iter().cloned().collect()
    }

    pub fn set_target(&self, path: Option<PathBuf>) {
        let _ = self.cmd.send(Ev::Cmd(Cmd::SetTarget(path)));
    }

    pub fn refresh(&self) {
        let _ = self.cmd.send(Ev::Cmd(Cmd::Refresh));
    }

    pub fn set_follow(&self, follow: bool) {
        let _ = self.cmd.send(Ev::Cmd(Cmd::SetFollow(follow)));
    }

    pub fn broadcast(&self, json: String) {
        let _ = self.tx.send(WsMsg::Text(Arc::new(json)));
    }

    fn publish_status(&self, status: Status) {
        let changed = {
            let mut shared = self.shared.lock().unwrap();
            if shared.status == status {
                false
            } else {
                shared.status = status.clone();
                true
            }
        };
        if changed {
            let json = serde_json::json!({ "type": "status", "status": status }).to_string();
            let _ = self.tx.send(WsMsg::Text(Arc::new(json)));
        }
    }

    fn run(self: Arc<Self>, rx: Receiver<Ev>, ev_tx: Sender<Ev>, initial: Option<PathBuf>, follow: bool) {
        let fs_tx = ev_tx.clone();
        let mut watcher: Option<RecommendedWatcher> = match notify::recommended_watcher(
            move |res: notify::Result<notify::Event>| {
                if res.is_ok() {
                    let _ = fs_tx.send(Ev::Fs);
                }
            },
        ) {
            Ok(w) => Some(w),
            Err(_) => None,
        };

        let mut target: Option<PathBuf> = None;
        let mut watched_dir: Option<PathBuf> = None;
        let mut last_stat: Option<(u64, u64)> = None;
        let mut follow = follow;
        let mut since: u64 = 0;

        if initial.is_some() {
            self.apply_target(&mut target, &mut watched_dir, &mut watcher, initial);
            self.follow_slot(follow, &mut since, &mut target, &mut watched_dir, &mut watcher);
            last_stat = None;
            self.check(&target, &mut last_stat, true);
        }

        loop {
            let event = rx.recv_timeout(POLL);
            match event {
                Ok(Ev::Cmd(Cmd::SetTarget(path))) => {
                    self.apply_target(&mut target, &mut watched_dir, &mut watcher, path);
                    since = now_ms();
                    last_stat = None;
                    self.check(&target, &mut last_stat, true);
                }
                Ok(Ev::Cmd(Cmd::SetFollow(next))) => {
                    follow = next;
                    since = 0;
                    if self.follow_slot(follow, &mut since, &mut target, &mut watched_dir, &mut watcher) {
                        last_stat = None;
                        self.check(&target, &mut last_stat, true);
                    }
                }
                Ok(Ev::Cmd(Cmd::Refresh)) => {
                    last_stat = None;
                    self.check(&target, &mut last_stat, true);
                }
                Ok(Ev::Fs) => {
                    let deadline = Instant::now() + DEBOUNCE;
                    while let Ok(extra) = rx.recv_timeout(deadline.saturating_duration_since(Instant::now())) {
                        match extra {
                            Ev::Cmd(Cmd::SetTarget(path)) => {
                                self.apply_target(&mut target, &mut watched_dir, &mut watcher, path);
                                since = now_ms();
                                last_stat = None;
                            }
                            Ev::Cmd(Cmd::SetFollow(next)) => {
                                follow = next;
                                since = 0;
                            }
                            Ev::Cmd(Cmd::Refresh) => last_stat = None,
                            Ev::Fs => {}
                        }
                        if Instant::now() >= deadline {
                            break;
                        }
                    }
                    if self.follow_slot(follow, &mut since, &mut target, &mut watched_dir, &mut watcher) {
                        last_stat = None;
                    }
                    self.check(&target, &mut last_stat, true);
                }
                Err(RecvTimeoutError::Timeout) => {
                    if self.follow_slot(follow, &mut since, &mut target, &mut watched_dir, &mut watcher) {
                        last_stat = None;
                    }
                    self.check(&target, &mut last_stat, false);
                }
                Err(RecvTimeoutError::Disconnected) => break,
            }
        }
    }

    fn follow_slot(
        &self,
        follow: bool,
        since: &mut u64,
        target: &mut Option<PathBuf>,
        watched_dir: &mut Option<PathBuf>,
        watcher: &mut Option<RecommendedWatcher>,
    ) -> bool {
        if !follow {
            return false;
        }
        let Some(next) = target.as_deref().and_then(|path| newer_slot(path, *since)) else {
            return false;
        };
        self.apply_target(target, watched_dir, watcher, Some(next));
        *since = 0;
        true
    }

    fn apply_target(
        &self,
        target: &mut Option<PathBuf>,
        watched_dir: &mut Option<PathBuf>,
        watcher: &mut Option<RecommendedWatcher>,
        next: Option<PathBuf>,
    ) {
        if let (Some(w), Some(dir)) = (watcher.as_mut(), watched_dir.as_ref()) {
            let _ = w.unwatch(dir);
        }
        *watched_dir = None;
        *target = next;
        let mut watching = false;
        if let Some(path) = target.as_ref() {
            if let Some(dir) = path.parent() {
                if let Some(w) = watcher.as_mut() {
                    if w.watch(dir, RecursiveMode::NonRecursive).is_ok() {
                        *watched_dir = Some(dir.to_path_buf());
                        watching = true;
                    }
                }
            }
        }
        let mut shared = self.shared.lock().unwrap();
        shared.history.clear();
        shared.last_hash = 0;
        let status = Status {
            path: target.as_ref().map(|p| p.to_string_lossy().to_string()),
            watching,
            ..Status::default()
        };
        drop(shared);
        self.publish_status(status);
    }

    fn check(&self, target: &Option<PathBuf>, last_stat: &mut Option<(u64, u64)>, force: bool) {
        let Some(path) = target.as_ref() else {
            return;
        };
        let mut status = self.status();
        let stat = stat_of(path);
        match stat {
            None => {
                *last_stat = None;
                status.error = Some("file is unavailable".into());
                status.error_code = Some("missing".into());
                self.publish_status(status);
                return;
            }
            Some(current) => {
                if !force && Some(current) == *last_stat {
                    return;
                }
                *last_stat = Some(current);
                status.size = Some(current.0);
                status.mtime = Some(current.1);
            }
        }

        match snapshot(path) {
            Ok(bytes) => {
                let hash = fnv1a(&bytes);
                let mut shared = self.shared.lock().unwrap();
                let same = shared.last_hash == hash && !shared.history.is_empty();
                if same {
                    drop(shared);
                    status.error = None;
                    status.error_code = None;
                    self.publish_status(status);
                    return;
                }
                let read_at = now_ms();
                let header = serde_json::json!({
                    "type": "save",
                    "path": path.to_string_lossy(),
                    "size": bytes.len(),
                    "mtime": status.mtime,
                    "hash": format!("{hash:016x}"),
                    "readAt": read_at,
                })
                .to_string();
                let data = frame(header, &bytes);
                shared.last_hash = hash;
                shared.history.push_back(Arc::clone(&data));
                while shared.history.len() > HISTORY {
                    shared.history.pop_front();
                }
                let reads = shared.status.reads + 1;
                drop(shared);
                let _ = self.tx.send(WsMsg::Binary(data));
                status.error = None;
                status.error_code = None;
                status.last_read_at = Some(read_at);
                status.reads = reads;
                self.publish_status(status);
            }
            Err(err) => {
                status.error = Some(err.to_string());
                status.error_code = Some(err.code().to_string());
                self.publish_status(status);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{newer_slot, slot_siblings};
    use std::path::{Path, PathBuf};
    use std::time::{Duration, SystemTime};

    #[test]
    fn finds_sibling_slots_with_any_prefix() {
        assert_eq!(
            slot_siblings(Path::new("C:/remote/rep+persistentgamedata1.dat")),
            vec![
                PathBuf::from("C:/remote/rep+persistentgamedata2.dat"),
                PathBuf::from("C:/remote/rep+persistentgamedata3.dat"),
            ]
        );
        assert_eq!(
            slot_siblings(Path::new("C:/docs/persistentgamedata3.dat")),
            vec![
                PathBuf::from("C:/docs/persistentgamedata1.dat"),
                PathBuf::from("C:/docs/persistentgamedata2.dat"),
            ]
        );
        assert!(slot_siblings(Path::new("C:/docs/persistentgamedata4.dat")).is_empty());
        assert!(slot_siblings(Path::new("C:/docs/notes.txt")).is_empty());
    }

    #[test]
    fn switches_only_to_a_slot_written_later() {
        let dir = std::env::temp_dir().join(format!("tracker-slots-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let base = SystemTime::now() - Duration::from_secs(600);
        let touch = |slot: u8, age: u64| {
            let path = dir.join(format!("rep+persistentgamedata{slot}.dat"));
            let file = std::fs::File::create(&path).unwrap();
            file.set_modified(base + Duration::from_secs(age)).unwrap();
            path
        };
        let one = touch(1, 100);
        touch(2, 50);
        assert_eq!(newer_slot(&one, 0), None);
        let three = touch(3, 200);
        assert_eq!(newer_slot(&one, 0), Some(three.clone()));
        let pick_time = (base + Duration::from_secs(300))
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;
        assert_eq!(newer_slot(&one, pick_time), None);
        let two = touch(2, 400);
        assert_eq!(newer_slot(&one, pick_time), Some(two));
        assert_eq!(newer_slot(&three, 0), Some(dir.join("rep+persistentgamedata2.dat")));
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
