use std::fs;

use rfd::FileDialog;
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::{app_state::AppState, models::CustomJs};

#[derive(Serialize)]
pub struct JsToggleResponse {
    pub enabled: bool,
}

#[derive(Serialize)]
pub struct JsSetContentResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Serialize)]
pub struct JsLoadResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

#[tauri::command(permission = "dmnote-allow-all")]
pub fn js_get(state: State<'_, AppState>) -> Result<CustomJs, String> {
    Ok(state.store.snapshot().custom_js)
}

#[tauri::command(permission = "dmnote-allow-all")]
pub fn js_get_use(state: State<'_, AppState>) -> Result<bool, String> {
    Ok(state.store.snapshot().use_custom_js)
}

#[tauri::command(permission = "dmnote-allow-all")]
pub fn js_toggle(
    state: State<'_, AppState>,
    app: AppHandle,
    enabled: bool,
) -> Result<JsToggleResponse, String> {
    state
        .store
        .update(|store| {
            store.use_custom_js = enabled;
        })
        .map_err(|err| err.to_string())?;

    app.emit("js:use", &JsToggleResponse { enabled })
        .map_err(|err| err.to_string())?;

    if enabled {
        let script = state.store.snapshot().custom_js;
        app.emit("js:content", &script)
            .map_err(|err| err.to_string())?;
    }

    Ok(JsToggleResponse { enabled })
}

#[tauri::command(permission = "dmnote-allow-all")]
pub fn js_reset(state: State<'_, AppState>, app: AppHandle) -> Result<(), String> {
    state
        .store
        .update(|store| {
            store.use_custom_js = false;
            store.custom_js = CustomJs::default();
        })
        .map_err(|err| err.to_string())?;

    app.emit("js:use", &JsToggleResponse { enabled: false })
        .map_err(|err| err.to_string())?;
    app.emit("js:content", &CustomJs::default())
        .map_err(|err| err.to_string())?;
    Ok(())
}

#[tauri::command(permission = "dmnote-allow-all")]
pub fn js_set_content(
    state: State<'_, AppState>,
    app: AppHandle,
    content: String,
) -> Result<JsSetContentResponse, String> {
    let mut current = state.store.snapshot().custom_js;
    current.content = content.clone();

    state
        .store
        .update(|store| {
            store.custom_js = current.clone();
        })
        .map_err(|err| err.to_string())?;

    app.emit("js:content", &current)
        .map_err(|err| err.to_string())?;

    Ok(JsSetContentResponse {
        success: true,
        error: None,
    })
}

#[tauri::command(permission = "dmnote-allow-all")]
pub fn js_load(state: State<'_, AppState>, app: AppHandle) -> Result<JsLoadResponse, String> {
    let picked = FileDialog::new()
        .add_filter("JavaScript", &["js", "mjs"])
        .pick_file();

    let Some(path) = picked else {
        return Ok(JsLoadResponse {
            success: false,
            error: None,
            content: None,
            path: None,
        });
    };

    let path_string = path.to_string_lossy().to_string();
    match fs::read_to_string(&path) {
        Ok(content) => {
            let script = CustomJs {
                path: Some(path_string.clone()),
                content: content.clone(),
            };
            state
                .store
                .update(|store| {
                    store.custom_js = script.clone();
                })
                .map_err(|err| err.to_string())?;

            app.emit("js:content", &script)
                .map_err(|err| err.to_string())?;

            Ok(JsLoadResponse {
                success: true,
                error: None,
                content: Some(content),
                path: Some(path_string),
            })
        }
        Err(err) => Ok(JsLoadResponse {
            success: false,
            error: Some(err.to_string()),
            content: None,
            path: Some(path_string),
        }),
    }
}
