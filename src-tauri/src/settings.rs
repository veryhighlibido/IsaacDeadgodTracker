use std::path::PathBuf;

use serde::{Deserialize, Serialize};

pub const DEFAULT_PORT: u16 = 35455;

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub save_path: Option<String>,
    pub port: Option<u16>,
    pub ui: serde_json::Value,
    pub overlay: serde_json::Value,
}

pub fn config_dir() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("IsaacDeadgodTracker")
}

fn config_file() -> PathBuf {
    config_dir().join("settings.json")
}

pub fn load() -> Settings {
    let path = config_file();
    let Ok(raw) = std::fs::read_to_string(&path) else {
        return Settings::default();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

pub fn store(settings: &Settings) {
    let dir = config_dir();
    if std::fs::create_dir_all(&dir).is_err() {
        return;
    }
    let Ok(json) = serde_json::to_string_pretty(settings) else {
        return;
    };
    let tmp = dir.join("settings.json.tmp");
    if std::fs::write(&tmp, json).is_ok() {
        let _ = std::fs::rename(&tmp, config_file());
    }
}
