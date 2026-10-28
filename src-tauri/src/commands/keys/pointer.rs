//! 커서 트래커 입력 - 포인터 묶음 구독과 모니터 목록

use serde::Serialize;
use tauri::{AppHandle, State};

use crate::{errors::CmdResult, state::AppState};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PointerInputSubscribeResponse {
    count: u32,
}

/// input:pointer 이벤트 구독 - 구독이 없으면 데몬 묶음을 버린다
#[tauri::command]
pub fn pointer_input_subscribe(
    state: State<'_, AppState>,
) -> CmdResult<PointerInputSubscribeResponse> {
    Ok(PointerInputSubscribeResponse {
        count: state.subscribe_pointer_input(),
    })
}

#[tauri::command]
pub fn pointer_input_unsubscribe(
    state: State<'_, AppState>,
) -> CmdResult<PointerInputSubscribeResponse> {
    Ok(PointerInputSubscribeResponse {
        count: state.unsubscribe_pointer_input(),
    })
}

/// 모니터 영역 - 좌표는 커서 좌표와 같은 공간이다
/// (macOS 포인트, Windows 물리 픽셀)
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PointerMonitor {
    pub id: String,
    pub name: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub primary: bool,
}

// 같은 이름 모니터가 여럿이면 순번을 붙여 구분한다
fn monitor_ids(names: &[String]) -> Vec<String> {
    names
        .iter()
        .enumerate()
        .map(|(index, name)| {
            let duplicated = names.iter().filter(|other| *other == name).count() > 1;
            if duplicated {
                format!(
                    "{name}#{}",
                    names[..index].iter().filter(|other| *other == name).count() + 1
                )
            } else {
                name.clone()
            }
        })
        .collect()
}

#[tauri::command]
pub fn pointer_monitors_list(app: AppHandle) -> CmdResult<Vec<PointerMonitor>> {
    let monitors = app.available_monitors().unwrap_or_default();
    let primary = app.primary_monitor().ok().flatten();
    let names: Vec<String> = monitors
        .iter()
        .enumerate()
        .map(|(index, monitor)| {
            monitor
                .name()
                .cloned()
                .unwrap_or_else(|| format!("Display {}", index + 1))
        })
        .collect();
    let ids = monitor_ids(&names);
    Ok(monitors
        .iter()
        .zip(names)
        .zip(ids)
        .map(|((monitor, name), id)| {
            let position = monitor.position();
            let size = monitor.size();
            // macOS 커서 좌표는 포인트라 물리 픽셀을 배율로 나눈다
            let scale = if cfg!(target_os = "macos") {
                monitor.scale_factor()
            } else {
                1.0
            };
            let is_primary = primary
                .as_ref()
                .is_some_and(|primary| primary.position() == position && primary.size() == size);
            PointerMonitor {
                id,
                name,
                x: position.x as f64 / scale,
                y: position.y as f64 / scale,
                width: size.width as f64 / scale,
                height: size.height as f64 / scale,
                primary: is_primary,
            }
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 같은_이름_모니터는_순번으로_구분한다() {
        let names = ["LG".to_string(), "Built-in".to_string(), "LG".to_string()];
        assert_eq!(monitor_ids(&names), vec!["LG#1", "Built-in", "LG#2"]);
    }
}
