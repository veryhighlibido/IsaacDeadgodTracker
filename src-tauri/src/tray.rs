use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Wry};

use crate::server::AppState;
use crate::settings::{CloseAction, Settings};

const TRAY_ID: &str = "main";
const PRESET_PREFIX: &str = "preset:";
const SHOW: &str = "show";
const HIDE_ON_CLOSE: &str = "hide-on-close";
const QUIT: &str = "quit";

struct Labels {
    open: &'static str,
    presets: &'static str,
    hide_on_close: &'static str,
    quit: &'static str,
}

fn labels(russian: bool) -> Labels {
    if russian {
        Labels {
            open: "Открыть трекер",
            presets: "Пресет оверлея",
            hide_on_close: "Крестик скрывает в трей",
            quit: "Выход",
        }
    } else {
        Labels {
            open: "Open tracker",
            presets: "Overlay preset",
            hide_on_close: "Close button hides to tray",
            quit: "Quit",
        }
    }
}

fn menu_text(text: &str) -> String {
    text.replace('&', "&&")
}

pub fn signature(settings: &Settings) -> String {
    let mut out = format!(
        "{}|{:?}|{}",
        settings.russian(),
        settings.close_action.map(|action| action == CloseAction::Tray),
        settings.active().map(|preset| preset.id.as_str()).unwrap_or("")
    );
    for preset in &settings.presets {
        out.push_str(&format!("|{}:{}:{}", preset.id, preset.draft.is_some(), preset.name));
    }
    out
}

fn build_menu(app: &AppHandle, settings: &Settings) -> tauri::Result<Menu<Wry>> {
    let text = labels(settings.russian());
    let active = settings.active().map(|preset| preset.id.clone());
    let menu = Menu::new(app)?;
    menu.append(&MenuItem::with_id(app, SHOW, text.open, true, None::<&str>)?)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    if !settings.presets.is_empty() {
        menu.append(&MenuItem::with_id(app, "presets", text.presets, false, None::<&str>)?)?;
        for preset in &settings.presets {
            let name = menu_text(&preset.name);
            let label = if preset.draft.is_some() { format!("{name} •") } else { name };
            let checked = active.as_deref() == Some(preset.id.as_str());
            menu.append(&CheckMenuItem::with_id(
                app,
                format!("{PRESET_PREFIX}{}", preset.id),
                label,
                true,
                checked,
                None::<&str>,
            )?)?;
        }
        menu.append(&PredefinedMenuItem::separator(app)?)?;
    }
    menu.append(&CheckMenuItem::with_id(
        app,
        HIDE_ON_CLOSE,
        text.hide_on_close,
        true,
        settings.close_action == Some(CloseAction::Tray),
        None::<&str>,
    )?)?;
    menu.append(&MenuItem::with_id(app, QUIT, text.quit, true, None::<&str>)?)?;
    Ok(menu)
}

pub fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn on_menu(app: &AppHandle, id: &str) {
    let state = app.state::<AppState>();
    match id {
        SHOW => show_main(app),
        QUIT => app.exit(0),
        HIDE_ON_CLOSE => state.update(|settings| {
            settings.close_action = Some(if settings.close_action == Some(CloseAction::Tray) {
                CloseAction::Exit
            } else {
                CloseAction::Tray
            });
        }),
        _ => {
            if let Some(preset) = id.strip_prefix(PRESET_PREFIX) {
                let preset = preset.to_owned();
                state.update(|settings| {
                    if settings.presets.iter().any(|item| item.id == preset) {
                        settings.active_preset = Some(preset);
                    }
                });
            }
        }
    }
    let snapshot = state.settings.lock().unwrap().clone();
    refresh(app, &snapshot);
}

pub fn install(app: &AppHandle, settings: &Settings) -> tauri::Result<()> {
    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Isaac Deadgod Tracker")
        .menu(&build_menu(app, settings)?)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| on_menu(app, event.id().as_ref()))
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

pub fn refresh(app: &AppHandle, settings: &Settings) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };
    if let Ok(menu) = build_menu(app, settings) {
        let _ = tray.set_menu(Some(menu));
    }
}
