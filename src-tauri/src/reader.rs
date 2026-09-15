use std::fs::OpenOptions;
use std::io::Read;
use std::path::Path;
use std::thread::sleep;
use std::time::Duration;

pub const SAVE_HEADER: &[u8; 16] = b"ISAACNGSAVE09R  ";
const MIN_SIZE: usize = 16 + 4 + 12 * 11 + 8;
const MAX_SIZE: u64 = 8 * 1024 * 1024;

#[derive(Debug)]
pub enum ReadError {
    Io(std::io::Error),
    TooSmall,
    TooLarge,
    Header,
    Unstable,
}

impl ReadError {
    pub fn code(&self) -> &'static str {
        match self {
            ReadError::Io(_) => "io",
            ReadError::TooSmall => "tooSmall",
            ReadError::TooLarge => "tooLarge",
            ReadError::Header => "header",
            ReadError::Unstable => "unstable",
        }
    }
}

impl std::fmt::Display for ReadError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ReadError::Io(e) => write!(f, "{e}"),
            ReadError::TooSmall => write!(f, "file shorter than a save header"),
            ReadError::TooLarge => write!(f, "file too large for a save"),
            ReadError::Header => write!(f, "not an Isaac save (bad magic)"),
            ReadError::Unstable => write!(f, "file kept changing while reading"),
        }
    }
}

#[cfg(windows)]
fn open_shared(path: &Path) -> std::io::Result<std::fs::File> {
    use std::os::windows::fs::OpenOptionsExt;

    const FILE_SHARE_READ: u32 = 0x0000_0001;
    const FILE_SHARE_WRITE: u32 = 0x0000_0002;
    const FILE_SHARE_DELETE: u32 = 0x0000_0004;
    const FILE_FLAG_SEQUENTIAL_SCAN: u32 = 0x0800_0000;

    OpenOptions::new()
        .read(true)
        .write(false)
        .create(false)
        .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE)
        .custom_flags(FILE_FLAG_SEQUENTIAL_SCAN)
        .open(path)
}

#[cfg(not(windows))]
fn open_shared(path: &Path) -> std::io::Result<std::fs::File> {
    OpenOptions::new().read(true).write(false).create(false).open(path)
}

fn read_once(path: &Path) -> Result<Vec<u8>, ReadError> {
    let mut file = open_shared(path).map_err(ReadError::Io)?;
    let len = file.metadata().map_err(ReadError::Io)?.len();
    if len > MAX_SIZE {
        return Err(ReadError::TooLarge);
    }
    let mut buf = Vec::with_capacity(len as usize + 64);
    file.read_to_end(&mut buf).map_err(ReadError::Io)?;
    if buf.len() < MIN_SIZE {
        return Err(ReadError::TooSmall);
    }
    if &buf[..16] != SAVE_HEADER {
        return Err(ReadError::Header);
    }
    Ok(buf)
}

pub fn snapshot(path: &Path) -> Result<Vec<u8>, ReadError> {
    let mut last_err = ReadError::Unstable;
    for attempt in 0..8u32 {
        match read_once(path) {
            Ok(first) => {
                sleep(Duration::from_millis(45));
                match read_once(path) {
                    Ok(second) if second == first => return Ok(first),
                    Ok(_) => last_err = ReadError::Unstable,
                    Err(e) => last_err = e,
                }
            }
            Err(e) => last_err = e,
        }
        sleep(Duration::from_millis(60 + attempt as u64 * 70));
    }
    Err(last_err)
}

pub fn fnv1a(bytes: &[u8]) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for b in bytes {
        hash ^= *b as u64;
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}
