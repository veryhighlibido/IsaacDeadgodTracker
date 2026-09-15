use std::fs::{File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use tracker_lib::reader;

fn sample() -> Vec<u8> {
    let mut bytes = Vec::new();
    bytes.extend_from_slice(reader::SAVE_HEADER);
    bytes.resize(16 + 4 + 12 * 11 + 8 + 512, 7);
    bytes
}

fn temp_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("tracker-test-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn write_atomic(target: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let tmp = target.with_extension("tmp");
    {
        let mut file = File::create(&tmp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
    }
    std::fs::rename(&tmp, target)
}

#[test]
fn reader_never_blocks_the_game_from_replacing_the_save() {
    let dir = temp_dir("replace");
    let target = dir.join("persistentgamedata1.dat");
    let mut bytes = sample();
    write_atomic(&target, &bytes).unwrap();

    let stop = Arc::new(AtomicBool::new(false));
    let reader_stop = Arc::clone(&stop);
    let reader_path = target.clone();
    let reader_thread = std::thread::spawn(move || {
        let mut reads = 0u32;
        while !reader_stop.load(Ordering::Relaxed) {
            if reader::snapshot(&reader_path).is_ok() {
                reads += 1;
            }
        }
        reads
    });

    let deadline = Instant::now() + Duration::from_secs(3);
    let mut replaces = 0u32;
    while Instant::now() < deadline {
        bytes[64] = bytes[64].wrapping_add(1);
        write_atomic(&target, &bytes).expect("game must always be able to replace its save");
        replaces += 1;
        std::thread::sleep(Duration::from_millis(15));
    }
    stop.store(true, Ordering::Relaxed);
    let reads = reader_thread.join().unwrap();

    assert!(replaces > 50, "expected many replaces, got {replaces}");
    assert!(reads > 0, "reader never managed to read the file");
    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn reader_never_blocks_deletion() {
    let dir = temp_dir("delete");
    let target = dir.join("persistentgamedata1.dat");
    write_atomic(&target, &sample()).unwrap();

    let snapshot = reader::snapshot(&target).unwrap();
    assert_eq!(&snapshot[..16], reader::SAVE_HEADER);
    std::fs::remove_file(&target).expect("file must stay deletable after a snapshot");
    std::fs::remove_dir_all(&dir).ok();
}

#[cfg(windows)]
#[test]
fn a_held_handle_without_share_delete_is_what_breaks_saves() {
    use std::os::windows::fs::OpenOptionsExt;

    let dir = temp_dir("held");
    let target = dir.join("persistentgamedata1.dat");
    let bytes = sample();
    write_atomic(&target, &bytes).unwrap();

    let mut held = OpenOptions::new()
        .read(true)
        .share_mode(0x0000_0001)
        .open(&target)
        .unwrap();
    let mut sink = Vec::new();
    held.read_to_end(&mut sink).unwrap();

    let blocked = write_atomic(&target, &bytes).is_err();
    drop(held);
    let allowed = write_atomic(&target, &bytes).is_ok();

    assert!(blocked, "holding a handle without FILE_SHARE_DELETE should block the replace");
    assert!(allowed, "after releasing the handle the replace must succeed again");
    std::fs::remove_dir_all(&dir).ok();
}
