pub mod monitor;
pub mod paths;
pub mod reader;
pub mod server;
pub mod settings;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use tauri::{WebviewUrl, WebviewWindowBuilder};

const DEV_URL: &str = "http://localhost:5310";

fn resolve_dist(_app: &tauri::AppHandle) -> Option<PathBuf> {
    if !cfg!(debug_assertions) {
        return None;
    }
    let candidate = PathBuf::from("../dist");
    if candidate.join("index.html").is_file() {
        Some(candidate)
    } else {
        None
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let mut config = settings::load();
            let initial = config
                .save_path
                .as_ref()
                .map(PathBuf::from)
                .filter(|path| path.is_file());
            let monitor = monitor::Monitor::start(initial);

            let port_hint = config.port.unwrap_or(settings::DEFAULT_PORT);
            let (listener, port) = tauri::async_runtime::block_on(server::bind(port_hint))?;
            if config.port != Some(port) {
                config.port = Some(port);
                settings::store(&config);
            }

            let dist = resolve_dist(app.handle());
            let _ = &dist;
            let state = server::AppState {
                monitor,
                settings: Arc::new(Mutex::new(config)),
                app: app.handle().clone(),
                port,
                dist: dist.clone(),
            };
            let router = server::router(state);
            tauri::async_runtime::spawn(async move {
                let _ = axum::serve(listener, router).await;
            });

            let url = if cfg!(debug_assertions) {
                format!("{DEV_URL}/?api={port}")
            } else {
                format!("http://127.0.0.1:{port}/")
            };
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url.parse()?))
                .title("Isaac Deadgod Tracker")
                .inner_size(1280.0, 820.0)
                .min_inner_size(820.0, 560.0)
                .center()
                .build()?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
