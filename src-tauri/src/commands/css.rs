use std::fs;

use rfd::FileDialog;
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::{app_state::AppState, models::CustomCss};

#[derive(Serialize)]
pub struct CssToggleResponse {
    pub enabled: bool,
}

#[derive(Serialize)]
pub struct CssSetContentResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Serialize)]
pub struct CssLoadResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

#[tauri::command(permission = "dmnote-allow-all")]
pub fn css_get(state: State<'_, AppState>) -> Result<CustomCss, String> {
    Ok(state.store.snapshot().custom_css)
}

#[tauri::command(permission = "dmnote-allow-all")]
pub fn css_get_use(state: State<'_, AppState>) -> Result<bool, String> {
    Ok(state.store.snapshot().use_custom_css)
}

#[tauri::command(permission = "dmnote-allow-all")]
pub fn css_toggle(
    state: State<'_, AppState>,
    app: AppHandle,
    enabled: bool,
) -> Result<CssToggleResponse, String> {
    state
        .store
        .update(|store| {
            store.use_custom_css = enabled;
        })
        .map_err(|err| err.to_string())?;

    app.emit("css:use", &CssToggleResponse { enabled })
        .map_err(|err| err.to_string())?;

    if enabled {
        let css = state.store.snapshot().custom_css;
        app.emit("css:content", &css)
            .map_err(|err| err.to_string())?;
    }

    Ok(CssToggleResponse { enabled })
}

#[tauri::command(permission = "dmnote-allow-all")]
pub fn css_reset(state: State<'_, AppState>, app: AppHandle) -> Result<(), String> {
    state
        .store
        .update(|store| {
            store.use_custom_css = false;
            store.custom_css = CustomCss::default();
        })
        .map_err(|err| err.to_string())?;

    app.emit("css:use", &CssToggleResponse { enabled: false })
        .map_err(|err| err.to_string())?;
    app.emit("css:content", &CustomCss::default())
        .map_err(|err| err.to_string())?;
    Ok(())
}

#[tauri::command(permission = "dmnote-allow-all")]
pub fn css_set_content(
    state: State<'_, AppState>,
    app: AppHandle,
    content: String,
) -> Result<CssSetContentResponse, String> {
    let mut current = state.store.snapshot().custom_css;
    current.content = content.clone();

    state
        .store
        .update(|store| {
            store.custom_css = current.clone();
        })
        .map_err(|err| err.to_string())?;

    app.emit("css:content", &current)
        .map_err(|err| err.to_string())?;

    Ok(CssSetContentResponse {
        success: true,
        error: None,
    })
}

#[tauri::command(permission = "dmnote-allow-all")]
pub fn css_load(state: State<'_, AppState>, app: AppHandle) -> Result<CssLoadResponse, String> {
    let picked = FileDialog::new().add_filter("CSS", &["css"]).pick_file();

    let Some(path) = picked else {
        return Ok(CssLoadResponse {
            success: false,
            error: None,
            content: None,
            path: None,
        });
    };

    let path_string = path.to_string_lossy().to_string();
    match fs::read_to_string(&path) {
        Ok(content) => {
            let css = CustomCss {
                path: Some(path_string.clone()),
                content: content.clone(),
            };
            state
                .store
                .update(|store| {
                    store.custom_css = css.clone();
                })
                .map_err(|err| err.to_string())?;

            app.emit("css:content", &css)
                .map_err(|err| err.to_string())?;

            Ok(CssLoadResponse {
                success: true,
                error: None,
                content: Some(content),
                path: Some(path_string),
            })
        }
        Err(err) => Ok(CssLoadResponse {
            success: false,
            error: Some(err.to_string()),
            content: None,
            path: Some(path_string),
        }),
    }
}
