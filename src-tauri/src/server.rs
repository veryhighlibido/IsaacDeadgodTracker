use std::net::{Ipv4Addr, SocketAddr};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::http::Uri;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use rust_embed::RustEmbed;
use serde::Deserialize;
use serde_json::json;
use tokio::net::TcpListener;
use tokio::sync::broadcast::error::RecvError;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::services::{ServeDir, ServeFile};

use crate::monitor::{Monitor, WsMsg};
use crate::paths;
use crate::reader;
use crate::settings::{self, Settings};

#[derive(RustEmbed)]
#[folder = "../dist"]
struct Bundled;

fn hex_nibble(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

pub fn percent_decode(raw: &str) -> String {
    let bytes = raw.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(high), Some(low)) = (hex_nibble(bytes[i + 1]), hex_nibble(bytes[i + 2])) {
                out.push((high << 4) | low);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

async fn bundled(uri: Uri) -> Response {
    let decoded = percent_decode(uri.path().trim_start_matches('/'));
    let candidate = if decoded.is_empty() { "index.html" } else { decoded.as_str() };
    if let Some(asset) = Bundled::get(candidate) {
        let mime = mime_guess::from_path(candidate).first_or_octet_stream();
        return ([(axum::http::header::CONTENT_TYPE, mime.as_ref())], asset.data.into_owned()).into_response();
    }
    if std::path::Path::new(candidate).extension().is_some() {
        return (StatusCode::NOT_FOUND, "no such asset").into_response();
    }
    match Bundled::get("index.html") {
        Some(asset) => ([(axum::http::header::CONTENT_TYPE, "text/html")], asset.data.into_owned()).into_response(),
        None => (StatusCode::NOT_FOUND, "not built").into_response(),
    }
}

#[derive(Clone)]
pub struct AppState {
    pub monitor: Arc<Monitor>,
    pub settings: Arc<Mutex<Settings>>,
    pub app: tauri::AppHandle,
    pub port: u16,
    pub dist: Option<PathBuf>,
}

pub async fn bind(port_hint: u16) -> std::io::Result<(TcpListener, u16)> {
    let mut last_err: Option<std::io::Error> = None;
    for offset in 0..24u16 {
        let port = port_hint.saturating_add(offset);
        let addr = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
        match TcpListener::bind(addr).await {
            Ok(listener) => {
                let actual = listener.local_addr()?.port();
                return Ok((listener, actual));
            }
            Err(err) => last_err = Some(err),
        }
    }
    let addr = SocketAddr::from((Ipv4Addr::LOCALHOST, 0));
    match TcpListener::bind(addr).await {
        Ok(listener) => {
            let actual = listener.local_addr()?.port();
            Ok((listener, actual))
        }
        Err(err) => Err(last_err.unwrap_or(err)),
    }
}

pub fn router(state: AppState) -> Router {
    let mut app: Router = Router::new()
        .route("/ws", get(ws_upgrade))
        .route("/api/status", get(status))
        .route("/api/sources", get(sources))
        .route("/api/preview", get(preview))
        .route("/api/select", post(select))
        .route("/api/pick", post(pick))
        .route("/api/refresh", post(refresh))
        .route("/api/settings", post(put_settings))
        .route("/api/reveal", post(reveal))
        .with_state(state.clone());

    app = match state.dist.as_ref() {
        Some(dist) => {
            let index = dist.join("index.html");
            app.fallback_service(ServeDir::new(dist).not_found_service(ServeFile::new(index)))
        }
        None => app.fallback(bundled),
    };
    app.layer(local_cors())
}

fn local_cors() -> CorsLayer {
    CorsLayer::new()
        .allow_origin(AllowOrigin::predicate(|origin, _| {
            origin
                .to_str()
                .map(|value| value.starts_with("http://localhost:") || value.starts_with("http://127.0.0.1:"))
                .unwrap_or(false)
        }))
        .allow_methods(tower_http::cors::Any)
        .allow_headers(tower_http::cors::Any)
}

async fn status(State(state): State<AppState>) -> Json<serde_json::Value> {
    let settings = state.settings.lock().unwrap().clone();
    Json(json!({
        "status": state.monitor.status(),
        "port": state.port,
        "sources": paths::discover(),
        "settings": settings,
        "version": env!("CARGO_PKG_VERSION"),
    }))
}

async fn sources() -> Json<serde_json::Value> {
    Json(json!({ "sources": paths::discover() }))
}

#[derive(Deserialize)]
struct PathQuery {
    path: String,
}

fn known_path(state: &AppState, path: &str) -> bool {
    if state
        .settings
        .lock()
        .unwrap()
        .save_path
        .as_deref()
        .is_some_and(|p| p == path)
    {
        return true;
    }
    paths::discover()
        .iter()
        .any(|src| src.slots.iter().any(|slot| slot.path == path))
}

async fn preview(State(state): State<AppState>, Query(q): Query<PathQuery>) -> Response {
    if !known_path(&state, &q.path) {
        return (StatusCode::FORBIDDEN, "unknown path").into_response();
    }
    match reader::snapshot(std::path::Path::new(&q.path)) {
        Ok(bytes) => ([("content-type", "application/octet-stream")], bytes).into_response(),
        Err(err) => (StatusCode::UNPROCESSABLE_ENTITY, err.to_string()).into_response(),
    }
}

#[derive(Deserialize)]
struct SelectBody {
    path: Option<String>,
}

#[derive(Deserialize)]
struct LangQuery {
    lang: Option<String>,
}

fn dialog_title(lang: Option<&str>) -> &'static str {
    match lang {
        Some("ru") => "Выбери файл сохранения Isaac",
        _ => "Choose an Isaac save file",
    }
}

fn dialog_filter(lang: Option<&str>) -> &'static str {
    match lang {
        Some("ru") => "Сейв Isaac",
        _ => "Isaac save",
    }
}

async fn select(State(state): State<AppState>, Json(body): Json<SelectBody>) -> Response {
    match body.path {
        Some(path) => {
            let p = PathBuf::from(&path);
            if !p.is_file() {
                return (StatusCode::NOT_FOUND, "no such file").into_response();
            }
            if !paths::looks_like_save(&p) {
                return (StatusCode::UNPROCESSABLE_ENTITY, "not an Isaac save").into_response();
            }
            state.monitor.set_target(Some(p));
            let mut settings = state.settings.lock().unwrap();
            settings.save_path = Some(path);
            settings::store(&settings);
        }
        None => {
            state.monitor.set_target(None);
            let mut settings = state.settings.lock().unwrap();
            settings.save_path = None;
            settings::store(&settings);
        }
    }
    Json(json!({ "ok": true })).into_response()
}

async fn pick(State(state): State<AppState>, Query(q): Query<LangQuery>) -> Response {
    use tauri_plugin_dialog::DialogExt;

    let app = state.app.clone();
    let title = dialog_title(q.lang.as_deref());
    let filter = dialog_filter(q.lang.as_deref());
    let start = paths::discover()
        .first()
        .map(|src| PathBuf::from(&src.dir))
        .or_else(dirs::document_dir);

    let chosen = tokio::task::spawn_blocking(move || {
        let mut dialog = app.dialog().file().set_title(title).add_filter(filter, &["dat"]);
        if let Some(dir) = start {
            dialog = dialog.set_directory(dir);
        }
        dialog.blocking_pick_file()
    })
    .await;

    match chosen {
        Ok(Some(file)) => {
            let path = file.to_string();
            Json(json!({ "path": path })).into_response()
        }
        Ok(None) => Json(json!({ "path": serde_json::Value::Null })).into_response(),
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, "the dialog did not open").into_response(),
    }
}

async fn refresh(State(state): State<AppState>) -> Json<serde_json::Value> {
    state.monitor.refresh();
    Json(json!({ "ok": true }))
}

#[derive(Deserialize)]
struct SettingsBody {
    ui: Option<serde_json::Value>,
    overlay: Option<serde_json::Value>,
}

async fn put_settings(State(state): State<AppState>, Json(body): Json<SettingsBody>) -> Json<serde_json::Value> {
    let mut settings = state.settings.lock().unwrap();
    if let Some(ui) = body.ui {
        settings.ui = ui;
    }
    if let Some(overlay) = body.overlay {
        settings.overlay = overlay;
    }
    settings::store(&settings);
    Json(json!({ "ok": true }))
}

async fn reveal(State(state): State<AppState>, Json(q): Json<PathQuery>) -> Response {
    use tauri_plugin_opener::OpenerExt;

    if !known_path(&state, &q.path) {
        return (StatusCode::FORBIDDEN, "unknown path").into_response();
    }
    match state.app.opener().reveal_item_in_dir(&q.path) {
        Ok(()) => Json(json!({ "ok": true })).into_response(),
        Err(err) => (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()).into_response(),
    }
}

async fn ws_upgrade(ws: WebSocketUpgrade, State(state): State<AppState>) -> Response {
    ws.on_upgrade(move |socket| serve_socket(socket, state))
}

async fn serve_socket(mut socket: WebSocket, state: AppState) {
    let mut rx = state.monitor.subscribe();

    let hello = json!({
        "type": "status",
        "status": state.monitor.status(),
        "port": state.port,
    })
    .to_string();
    if socket.send(Message::Text(hello.into())).await.is_err() {
        return;
    }
    for frame in state.monitor.history() {
        if socket
            .send(Message::Binary(frame.as_ref().clone().into()))
            .await
            .is_err()
        {
            return;
        }
    }

    loop {
        tokio::select! {
            outgoing = rx.recv() => match outgoing {
                Ok(WsMsg::Text(text)) => {
                    if socket.send(Message::Text(text.as_str().to_owned().into())).await.is_err() {
                        break;
                    }
                }
                Ok(WsMsg::Binary(bytes)) => {
                    if socket.send(Message::Binary(bytes.as_ref().clone().into())).await.is_err() {
                        break;
                    }
                }
                Err(RecvError::Lagged(_)) => continue,
                Err(RecvError::Closed) => break,
            },
            incoming = socket.recv() => match incoming {
                Some(Ok(Message::Close(_))) | None => break,
                Some(Err(_)) => break,
                _ => {}
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::percent_decode;

    #[test]
    fn decodes_escaped_asset_paths() {
        assert_eq!(
            percent_decode("gfx/marks/hard/Mom's%20Heart.png"),
            "gfx/marks/hard/Mom's Heart.png"
        );
        assert_eq!(percent_decode("gfx/marks/hard/Isaac.png"), "gfx/marks/hard/Isaac.png");
        assert_eq!(percent_decode("%D0%9C%D0%B0%D1%80%D0%BA%D0%B8"), "Марки");
        assert_eq!(percent_decode("100%"), "100%");
        assert_eq!(percent_decode("%zz"), "%zz");
    }
}
