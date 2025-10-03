use tauri::{AppHandle, Manager, State};

use crate::app_state::AppState;

#[tauri::command(permission = "dmnote-allow-all")]
pub fn window_minimize(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.minimize().map_err(|err| err.to_string())?;
    }
    Ok(())
}

#[tauri::command(permission = "dmnote-allow-all")]
pub fn window_close(state: State<'_, AppState>, app: AppHandle) -> Result<(), String> {
    state.shutdown();
    if let Some(main) = app.get_webview_window("main") {
        main.close().map_err(|err| err.to_string())?;
    }
    if let Some(overlay) = app.get_webview_window("overlay") {
        overlay.close().map_err(|err| err.to_string())?;
    }
    app.exit(0);
    Ok(())
}

#[tauri::command(permission = "dmnote-allow-all")]
pub fn app_open_external(_app: AppHandle, url: String) -> Result<(), String> {
    if url.is_empty() {
        return Ok(());
    }
    open::that(url).map_err(|err| err.to_string())
}

#[tauri::command(permission = "dmnote-allow-all")]
pub fn app_restart(app: AppHandle) -> Result<(), String> {
    app.request_restart();
    Ok(())
}
