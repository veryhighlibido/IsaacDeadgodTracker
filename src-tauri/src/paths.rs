use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::Serialize;

use crate::reader::SAVE_HEADER;

const EDITIONS: &[(&str, &str, &str)] = &[
    ("Binding of Isaac Repentance+", "repentancePlus", "Repentance+"),
    ("Binding of Isaac Repentance", "repentance", "Repentance"),
    ("Binding of Isaac Afterbirth+", "afterbirthPlus", "Afterbirth+"),
];

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SlotInfo {
    pub slot: u8,
    pub path: String,
    pub size: u64,
    pub modified: Option<u64>,
    pub looks_like_save: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SourceInfo {
    pub edition: String,
    pub edition_label: String,
    pub dir: String,
    pub cloud: bool,
    pub account: Option<String>,
    pub slots: Vec<SlotInfo>,
}

pub const CLOUD_EDITIONS: &[(&str, &str, &str)] = &[
    ("rep+", "repentancePlus", "Repentance+"),
    ("rep_", "repentance", "Repentance"),
];

pub fn documents_roots() -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = Vec::new();
    if let Some(docs) = dirs::document_dir() {
        roots.push(docs);
    }
    if let Some(home) = dirs::home_dir() {
        roots.push(home.join("Documents"));
        roots.push(home.join("OneDrive").join("Documents"));
        roots.push(home.join("OneDrive").join("Документы"));
        roots.push(home.join("Документы"));
    }
    roots
}

pub fn modified_ms(meta: &std::fs::Metadata) -> Option<u64> {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
}

pub fn looks_like_save(path: &Path) -> bool {
    use std::io::Read;
    let Ok(mut file) = std::fs::File::open(path) else {
        return false;
    };
    let mut head = [0u8; 16];
    file.read_exact(&mut head).is_ok() && &head == SAVE_HEADER
}

pub fn scan_slots(dir: &Path, prefix: &str) -> Vec<SlotInfo> {
    let mut slots = Vec::new();
    if !dir.is_dir() {
        return slots;
    }
    for slot in 1u8..=3 {
        let path = dir.join(format!("{prefix}persistentgamedata{slot}.dat"));
        let Ok(meta) = std::fs::metadata(&path) else {
            continue;
        };
        if !meta.is_file() {
            continue;
        }
        slots.push(SlotInfo {
            slot,
            path: path.to_string_lossy().to_string(),
            size: meta.len(),
            modified: modified_ms(&meta),
            looks_like_save: looks_like_save(&path),
        });
    }
    slots
}

fn scan_dir(dir: &Path, prefix: &str, edition: &str, edition_label: &str, account: Option<String>) -> Option<SourceInfo> {
    let slots = scan_slots(dir, prefix);
    if slots.is_empty() {
        return None;
    }
    Some(SourceInfo {
        edition: edition.to_string(),
        edition_label: edition_label.to_string(),
        dir: dir.to_string_lossy().to_string(),
        cloud: !prefix.is_empty(),
        account,
        slots,
    })
}

pub fn discover() -> Vec<SourceInfo> {
    let mut seen: HashSet<PathBuf> = HashSet::new();
    let mut out = Vec::new();
    for root in documents_roots() {
        let my_games = root.join("My Games");
        for (folder, edition, label) in EDITIONS {
            let dir = my_games.join(folder);
            let key = dir.canonicalize().unwrap_or_else(|_| dir.clone());
            if !seen.insert(key) {
                continue;
            }
            if let Some(info) = scan_dir(&dir, "", edition, label, None) {
                out.push(info);
            }
        }
    }
    for cloud in crate::storage::cloud_dirs() {
        for (prefix, edition, label) in CLOUD_EDITIONS {
            if let Some(info) = scan_dir(&cloud.dir, prefix, edition, label, cloud.account.clone()) {
                out.push(info);
            }
        }
    }
    out
}
