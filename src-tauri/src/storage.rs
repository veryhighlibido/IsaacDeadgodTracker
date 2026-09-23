use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

use crate::paths::{self, SlotInfo};
use crate::settings;

const APP_ID: &str = "250900";
const STEAMID64_BASE: u64 = 76_561_197_960_265_728;
const REP_PLUS_FOLDER: &str = "Binding of Isaac Repentance+";
const CLOUD_PREFIX: &str = "rep+";
const OPTIONS_KEY: &str = "SteamCloud";
const GAME_EXE: &str = "isaac-ng.exe";

#[derive(Clone)]
pub struct CloudDir {
    pub dir: PathBuf,
    pub account: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Location {
    pub kind: &'static str,
    pub dir: String,
    pub exists: bool,
    pub account: Option<String>,
    pub active: bool,
    pub slots: Vec<SlotInfo>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    pub steam_cloud: Option<bool>,
    pub options_path: String,
    pub options_found: bool,
    pub game_running: bool,
    pub backups: String,
    pub locations: Vec<Location>,
}

pub fn steam_root() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        use winreg::enums::HKEY_CURRENT_USER;
        use winreg::RegKey;
        if let Ok(key) = RegKey::predef(HKEY_CURRENT_USER).open_subkey("Software\\Valve\\Steam") {
            if let Ok(path) = key.get_value::<String, _>("SteamPath") {
                let mut clean = path.replace('/', "\\");
                if clean.as_bytes().get(1) == Some(&b':') {
                    clean[..1].make_ascii_uppercase();
                }
                let root = PathBuf::from(clean);
                if root.is_dir() {
                    return Some(root);
                }
            }
        }
    }
    [r"C:\Program Files (x86)\Steam", r"C:\Program Files\Steam"]
        .iter()
        .map(PathBuf::from)
        .find(|path| path.is_dir())
}

struct LoginUser {
    account: u64,
    persona: Option<String>,
    most_recent: bool,
}

fn quoted(line: &str) -> Vec<String> {
    line.split('"')
        .enumerate()
        .filter(|(index, _)| index % 2 == 1)
        .map(|(_, part)| part.to_string())
        .collect()
}

fn login_users(root: &Path) -> Vec<LoginUser> {
    let Ok(raw) = std::fs::read_to_string(root.join("config").join("loginusers.vdf")) else {
        return Vec::new();
    };
    let mut users: Vec<LoginUser> = Vec::new();
    for line in raw.lines() {
        let parts = quoted(line);
        match parts.as_slice() {
            [id] => {
                if let Ok(steam_id) = id.parse::<u64>() {
                    if steam_id > STEAMID64_BASE {
                        users.push(LoginUser {
                            account: steam_id - STEAMID64_BASE,
                            persona: None,
                            most_recent: false,
                        });
                    }
                }
            }
            [key, value] => {
                if let Some(user) = users.last_mut() {
                    if key.eq_ignore_ascii_case("PersonaName") {
                        user.persona = Some(value.clone());
                    } else if key.eq_ignore_ascii_case("MostRecent") {
                        user.most_recent = value == "1";
                    }
                }
            }
            _ => {}
        }
    }
    users
}

fn newest_file(dir: &Path) -> u64 {
    std::fs::read_dir(dir)
        .map(|entries| {
            entries
                .filter_map(|entry| entry.ok()?.metadata().ok())
                .filter_map(|meta| paths::modified_ms(&meta))
                .max()
                .unwrap_or(0)
        })
        .unwrap_or(0)
}

pub fn cloud_dirs() -> Vec<CloudDir> {
    let Some(root) = steam_root() else {
        return Vec::new();
    };
    let users = login_users(&root);
    let persona = |account: u64| users.iter().find(|user| user.account == account).and_then(|user| user.persona.clone());
    let recent = users.iter().find(|user| user.most_recent).map(|user| user.account);
    let userdata = root.join("userdata");
    let mut found: Vec<(bool, u64, CloudDir)> = std::fs::read_dir(&userdata)
        .map(|entries| {
            entries
                .filter_map(|entry| entry.ok())
                .filter_map(|entry| {
                    let account = entry.file_name().to_str()?.parse::<u64>().ok()?;
                    let dir = entry.path().join(APP_ID).join("remote");
                    dir.is_dir().then(|| {
                        (
                            Some(account) == recent,
                            newest_file(&dir),
                            CloudDir { dir, account: persona(account) },
                        )
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    found.sort_by(|a, b| b.0.cmp(&a.0).then(b.1.cmp(&a.1)));
    if found.is_empty() {
        if let Some(account) = recent {
            return vec![CloudDir {
                dir: userdata.join(account.to_string()).join(APP_ID).join("remote"),
                account: persona(account),
            }];
        }
    }
    found.into_iter().map(|(_, _, dir)| dir).collect()
}

pub fn documents_dir() -> PathBuf {
    let candidates: Vec<PathBuf> = paths::documents_roots()
        .into_iter()
        .map(|root| root.join("My Games").join(REP_PLUS_FOLDER))
        .collect();
    candidates
        .iter()
        .find(|dir| dir.join("options.ini").is_file())
        .or_else(|| candidates.iter().find(|dir| dir.is_dir()))
        .or_else(|| candidates.first())
        .cloned()
        .unwrap_or_else(|| PathBuf::from("My Games").join(REP_PLUS_FOLDER))
}

fn options_path() -> PathBuf {
    documents_dir().join("options.ini")
}

fn read_flag(raw: &str) -> Option<bool> {
    raw.lines().find_map(|line| {
        let (key, value) = line.split_once('=')?;
        if !key.trim().eq_ignore_ascii_case(OPTIONS_KEY) {
            return None;
        }
        match value.trim() {
            "0" => Some(false),
            "" => None,
            _ => Some(true),
        }
    })
}

pub fn steam_cloud() -> Option<bool> {
    std::fs::read_to_string(options_path()).ok().and_then(|raw| read_flag(&raw))
}

fn write_flag(raw: &str, enabled: bool) -> String {
    let value = if enabled { "1" } else { "0" };
    let newline = if raw.contains("\r\n") { "\r\n" } else { "\n" };
    let mut replaced = false;
    let mut lines: Vec<String> = raw
        .split(newline)
        .map(|line| match line.split_once('=') {
            Some((key, _)) if key.trim().eq_ignore_ascii_case(OPTIONS_KEY) && !replaced => {
                replaced = true;
                format!("{OPTIONS_KEY}={value}")
            }
            _ => line.to_string(),
        })
        .collect();
    if !replaced {
        let at = lines
            .iter()
            .position(|line| line.trim().eq_ignore_ascii_case("[Options]"))
            .map(|index| index + 1)
            .unwrap_or(lines.len());
        lines.insert(at, format!("{OPTIONS_KEY}={value}"));
    }
    lines.join(newline)
}

#[cfg(windows)]
pub fn game_running() -> bool {
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
    };

    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot == INVALID_HANDLE_VALUE {
            return false;
        }
        let mut entry: PROCESSENTRY32W = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        let mut found = false;
        let mut ok = Process32FirstW(snapshot, &mut entry) != 0;
        while ok {
            let len = entry.szExeFile.iter().position(|&c| c == 0).unwrap_or(entry.szExeFile.len());
            if String::from_utf16_lossy(&entry.szExeFile[..len]).eq_ignore_ascii_case(GAME_EXE) {
                found = true;
                break;
            }
            ok = Process32NextW(snapshot, &mut entry) != 0;
        }
        CloseHandle(snapshot);
        found
    }
}

#[cfg(not(windows))]
pub fn game_running() -> bool {
    false
}

fn backups_dir() -> PathBuf {
    settings::config_dir().join("backups")
}

struct Place {
    kind: &'static str,
    dir: PathBuf,
    prefix: &'static str,
    account: Option<String>,
}

fn places() -> (Option<Place>, Place) {
    let cloud = cloud_dirs().into_iter().next().map(|cloud| Place {
        kind: "cloud",
        dir: cloud.dir,
        prefix: CLOUD_PREFIX,
        account: cloud.account,
    });
    let documents = Place {
        kind: "documents",
        dir: documents_dir(),
        prefix: "",
        account: None,
    };
    (cloud, documents)
}

pub fn report() -> Report {
    let flag = steam_cloud();
    let options = options_path();
    let (cloud, documents) = places();
    let locations = cloud
        .into_iter()
        .chain(std::iter::once(documents))
        .map(|place| Location {
            kind: place.kind,
            dir: place.dir.to_string_lossy().to_string(),
            exists: place.dir.is_dir(),
            account: place.account.clone(),
            active: flag == Some(place.kind == "cloud"),
            slots: paths::scan_slots(&place.dir, place.prefix),
        })
        .collect();
    Report {
        steam_cloud: flag,
        options_found: options.is_file(),
        options_path: options.to_string_lossy().to_string(),
        game_running: game_running(),
        backups: backups_dir().to_string_lossy().to_string(),
        locations,
    }
}

fn newest_slot(slots: &[SlotInfo]) -> Option<PathBuf> {
    slots
        .iter()
        .filter(|slot| slot.looks_like_save)
        .max_by_key(|slot| slot.modified.unwrap_or(0))
        .map(|slot| PathBuf::from(&slot.path))
}

pub fn default_save() -> Option<PathBuf> {
    let (cloud, documents) = places();
    let cloud_slots = cloud.as_ref().map(|place| paths::scan_slots(&place.dir, place.prefix)).unwrap_or_default();
    let document_slots = paths::scan_slots(&documents.dir, documents.prefix);
    match steam_cloud() {
        Some(true) => newest_slot(&cloud_slots),
        Some(false) => newest_slot(&document_slots),
        None => {
            let all: Vec<SlotInfo> = cloud_slots.into_iter().chain(document_slots).collect();
            newest_slot(&all)
        }
    }
}

fn slot_number(path: &Path) -> Option<u8> {
    let stem = path.file_stem()?.to_str()?;
    stem.chars().last()?.to_digit(10).filter(|n| (1..=3).contains(n)).map(|n| n as u8)
}

pub struct Switched {
    pub target: Option<PathBuf>,
    pub copied: usize,
    pub backup: Option<PathBuf>,
}

pub fn switch(enabled: bool, copy: bool, current: Option<&Path>) -> Result<Switched, &'static str> {
    if game_running() {
        return Err("gameRunning");
    }
    let options = options_path();
    let raw = std::fs::read_to_string(&options).map_err(|_| "optionsMissing")?;
    let (cloud, documents) = places();
    let cloud = cloud.ok_or("noSteam")?;
    let (from, to) = if enabled { (&documents, &cloud) } else { (&cloud, &documents) };

    let mut copied = 0;
    let mut backup = None;
    if copy {
        let sources = paths::scan_slots(&from.dir, from.prefix);
        if !sources.is_empty() {
            let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
            let existing = paths::scan_slots(&to.dir, to.prefix);
            if !existing.is_empty() {
                let folder = backups_dir().join(format!("{stamp}-{}", to.kind));
                std::fs::create_dir_all(&folder).map_err(|_| "backupFailed")?;
                for slot in &existing {
                    let source = PathBuf::from(&slot.path);
                    let name = source.file_name().ok_or("backupFailed")?;
                    std::fs::copy(&source, folder.join(name)).map_err(|_| "backupFailed")?;
                }
                backup = Some(folder);
            }
            std::fs::create_dir_all(&to.dir).map_err(|_| "copyFailed")?;
            for slot in &sources {
                let target = to.dir.join(format!("{}persistentgamedata{}.dat", to.prefix, slot.slot));
                std::fs::copy(&slot.path, &target).map_err(|_| "copyFailed")?;
                copied += 1;
            }
        }
    }

    std::fs::write(&options, write_flag(&raw, enabled)).map_err(|_| "optionsWrite")?;

    let slots = paths::scan_slots(&to.dir, to.prefix);
    let wanted = current.and_then(slot_number);
    let target = wanted
        .and_then(|n| slots.iter().find(|slot| slot.slot == n && slot.looks_like_save))
        .map(|slot| PathBuf::from(&slot.path))
        .or_else(|| newest_slot(&slots));
    Ok(Switched { target, copied, backup })
}

#[cfg(test)]
mod tests {
    use super::{read_flag, write_flag};

    #[test]
    fn flips_the_flag_in_place() {
        let raw = "[Options]\r\nLanguage=0\r\nSteamCloud=0\r\nFullscreen=1\r\n";
        assert_eq!(read_flag(raw), Some(false));
        let next = write_flag(raw, true);
        assert_eq!(next, "[Options]\r\nLanguage=0\r\nSteamCloud=1\r\nFullscreen=1\r\n");
        assert_eq!(read_flag(&next), Some(true));
    }

    #[test]
    fn adds_a_missing_flag_under_options() {
        let raw = "[Options]\nLanguage=0\n";
        assert_eq!(read_flag(raw), None);
        assert_eq!(write_flag(raw, false), "[Options]\nSteamCloud=0\nLanguage=0\n");
    }
}
