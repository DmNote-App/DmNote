use std::{
    collections::HashSet,
    path::{Path, PathBuf},
};

use serde_json::Value;

#[cfg(test)]
use crate::models::KeyPosition;
use crate::models::{
    builtin_kind_registry, for_each_element, for_each_key_position, AppStoreData, FontType,
};
use element_document::bundles::BuiltinBundles;
use element_document::document::walk;
use element_document::value::visit_values;
use element_document::{AssetKind, BundleCatalog, Node, ValueKind};

use super::super::{
    assets::local_asset_path::{
        file_url_to_path, path_identity_key, paths_have_same_identity, FileUrlPath,
    },
    migration::is_foreign_portable_asset_reference,
};

pub(super) struct AssetReferencePaths {
    pub(super) keys: HashSet<String>,
    pub(super) complete: bool,
    pub(super) unresolved_count: usize,
}

impl AssetReferencePaths {
    fn new() -> Self {
        Self {
            keys: HashSet::new(),
            complete: true,
            unresolved_count: 0,
        }
    }

    fn collect(&mut self, app_data_dir: &Path, value: Option<&String>) {
        let Some(path) = value else {
            return;
        };
        match resolve_local_asset_path(app_data_dir, path) {
            LocalAssetPathResolution::Path(path) => {
                self.keys.insert(path_identity_key(&path));
            }
            LocalAssetPathResolution::Unresolved => {
                self.complete = false;
                self.unresolved_count += 1;
            }
            LocalAssetPathResolution::Ignored => {}
        }
    }
}

fn collect_plugin_managed_asset_paths(
    app_data_dir: &Path,
    data: &AppStoreData,
    directory_name: &str,
    paths: &mut AssetReferencePaths,
) {
    let managed_dir = app_data_dir.join(directory_name);
    for value in data.plugin_data.values() {
        collect_plugin_managed_asset_value(app_data_dir, &managed_dir, value, paths);
    }
    // 트리에 둔 플러그인 인스턴스 버킷(설정 값 안의 경로)도 같은 규칙으로
    for plugin_id in crate::state::plugin::plugin_instance_bucket_ids(data) {
        if let Some(value) = crate::state::plugin::read_plugin_instance_bucket(data, &plugin_id) {
            collect_plugin_managed_asset_value(app_data_dir, &managed_dir, &value, paths);
        }
    }
}

fn collect_plugin_managed_asset_value(
    app_data_dir: &Path,
    managed_dir: &Path,
    value: &Value,
    paths: &mut AssetReferencePaths,
) {
    match value {
        Value::String(raw) => {
            let LocalAssetPathResolution::Path(path) = resolve_local_asset_path(app_data_dir, raw)
            else {
                return;
            };
            if path
                .parent()
                .is_some_and(|parent| paths_have_same_identity(parent, managed_dir))
            {
                paths.keys.insert(path_identity_key(&path));
            }
        }
        Value::Array(values) => {
            for value in values {
                collect_plugin_managed_asset_value(app_data_dir, managed_dir, value, paths);
            }
        }
        Value::Object(values) => {
            for value in values.values() {
                collect_plugin_managed_asset_value(app_data_dir, managed_dir, value, paths);
            }
        }
        Value::Null | Value::Bool(_) | Value::Number(_) => {}
    }
}

pub(super) fn warn_unresolved_asset_references(app_data_dir: &Path, data: &AppStoreData) {
    for (category, count) in [
        (
            "fonts",
            collect_local_font_paths(app_data_dir, data).unresolved_count,
        ),
        (
            "images",
            collect_local_image_paths(app_data_dir, data).unresolved_count,
        ),
        (
            "sounds",
            collect_local_sound_paths(app_data_dir, data).unresolved_count,
        ),
    ] {
        if count > 0 {
            log::warn!("[Assets] {category} sweep 보류: 해석 불가 참조 {count}건");
        }
    }
}

// 종류 정의의 파일 칸(값 종류 File)과 기능 묶음 안 파일 칸이 가리키는 자산 - 옛 모양 보기에 없는 트리 전용 종류의
// 파일도 정리에서 지킨다
fn for_each_tree_file_value(data: &AppStoreData, asset: AssetKind, f: &mut dyn FnMut(&String)) {
    let registry = builtin_kind_registry();
    for scene in data.element_document().scenes.values() {
        walk(&scene.nodes, &mut |node, _| {
            let Node::Element(element) = node else {
                return;
            };
            let mut files: Vec<(AssetKind, &str)> = Vec::new();
            if let Some(schema) = registry.get(&element.kind) {
                visit_values(&schema.fields, &element.values, &mut |kind, value| {
                    if let (ValueKind::File { asset }, Some(path)) = (kind, value.as_str()) {
                        files.push((*asset, path));
                    }
                });
            }
            for (name, value) in &element.bundles {
                BuiltinBundles.files(name, value, &mut files);
            }
            for (kind, path) in files {
                if kind == asset && !path.is_empty() {
                    f(&path.to_string());
                }
            }
        });
    }
}

pub(super) fn collect_local_font_paths(
    app_data_dir: &Path,
    data: &AppStoreData,
) -> AssetReferencePaths {
    let mut paths = AssetReferencePaths::new();

    for font in data
        .font_settings
        .custom_fonts
        .iter()
        .filter(|font| font.font_type == FontType::Local)
    {
        paths.collect(app_data_dir, font.local_path.as_ref());
    }

    for_each_tree_file_value(data, AssetKind::Font, &mut |path| {
        paths.collect(app_data_dir, Some(path));
    });
    collect_plugin_managed_asset_paths(app_data_dir, data, "fonts", &mut paths);

    paths
}

pub(super) fn collect_local_image_paths(
    app_data_dir: &Path,
    data: &AppStoreData,
) -> AssetReferencePaths {
    let mut paths = AssetReferencePaths::new();

    for_each_element(data, |_, _, _, element| {
        element.for_each_image_ref(&mut |image_ref| {
            paths.collect(app_data_dir, image_ref.as_ref());
        });
    });

    for_each_tree_file_value(data, AssetKind::Image, &mut |path| {
        paths.collect(app_data_dir, Some(path));
    });
    collect_plugin_managed_asset_paths(app_data_dir, data, "images", &mut paths);

    paths
}

#[cfg(test)]
pub(super) fn collect_local_image_path_keys(
    app_data_dir: &Path,
    data: &AppStoreData,
) -> HashSet<String> {
    collect_local_image_paths(app_data_dir, data).keys
}

pub(super) fn collect_local_sound_paths(
    app_data_dir: &Path,
    data: &AppStoreData,
) -> AssetReferencePaths {
    let mut paths = AssetReferencePaths::new();

    for_each_key_position(data, |kind, _, _, position| {
        if kind.has_sound() {
            paths.collect(app_data_dir, position.sound_path.as_ref());
        }
    });

    for_each_tree_file_value(data, AssetKind::Sound, &mut |path| {
        paths.collect(app_data_dir, Some(path));
    });

    // 사운드 라이브러리에 등록된 파일도 보호 (키에 할당 안 되어도 유지)
    for key in data.sound_library.keys() {
        paths.collect(app_data_dir, Some(key));
    }

    paths
}

#[cfg(test)]
pub(super) fn collect_local_sound_path_keys(
    app_data_dir: &Path,
    data: &AppStoreData,
) -> HashSet<String> {
    collect_local_sound_paths(app_data_dir, data).keys
}

#[cfg(test)]
pub(super) fn iter_all_positions(data: &AppStoreData) -> impl Iterator<Item = &KeyPosition> {
    let mut positions = Vec::new();
    for_each_key_position(data, |_, _, _, position| positions.push(position));
    positions.into_iter()
}

enum LocalAssetPathResolution {
    Path(PathBuf),
    Unresolved,
    Ignored,
}

fn resolve_local_asset_path(app_data_dir: &Path, path: &str) -> LocalAssetPathResolution {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return LocalAssetPathResolution::Ignored;
    }

    let lower = trimmed.to_ascii_lowercase();
    if lower.starts_with("http://")
        || lower.starts_with("https://")
        || lower.starts_with("data:")
        || lower.starts_with("blob:")
        || lower.starts_with("asset:")
        || lower.starts_with("tauri:")
    {
        return LocalAssetPathResolution::Ignored;
    }

    match file_url_to_path(trimmed) {
        FileUrlPath::Path(path) => classify_absolute_asset_path(app_data_dir, trimmed, path),
        FileUrlPath::Invalid => LocalAssetPathResolution::Unresolved,
        FileUrlPath::NotFileUrl => {
            let path = PathBuf::from(trimmed);
            if path.is_absolute() {
                classify_absolute_asset_path(app_data_dir, trimmed, path)
            } else if looks_like_unresolved_local_path(trimmed) {
                LocalAssetPathResolution::Unresolved
            } else {
                LocalAssetPathResolution::Ignored
            }
        }
    }
}

// 실존하지 않는 외래 참조는 해석 실패로 취급, sweep 보류 fail-safe 유도
fn classify_absolute_asset_path(
    app_data_dir: &Path,
    raw: &str,
    path: PathBuf,
) -> LocalAssetPathResolution {
    if !path.exists() && is_foreign_portable_asset_reference(app_data_dir, raw) {
        return LocalAssetPathResolution::Unresolved;
    }
    LocalAssetPathResolution::Path(path)
}

fn looks_like_unresolved_local_path(value: &str) -> bool {
    let bytes = value.as_bytes();
    let has_windows_drive = bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':';
    has_windows_drive
        || value.starts_with('\\')
        || value.contains('/')
        || value.contains('\\')
        || Path::new(value).extension().is_some()
}

#[cfg(test)]
mod tree_file_value_tests {
    use super::*;

    // 옛 모양 보기에 없는 값(트리 노드의 값만)도 종류 정의의 파일 칸이면 보호한다
    #[test]
    fn 종류_정의의_파일_칸이_가리키는_자산을_목록_안까지_모은다() {
        let mut data = AppStoreData::default();
        let element: element_document::Element = serde_json::from_value(serde_json::json!({
            "id": "s1", "kind": "sprite",
            "frame": { "x": 0, "y": 0, "width": 10, "height": 10, "rotation": 0 },
            "bundles": { "image": { "activeImage": "active.png" } },
            "values": {
                "baseImage": "base.png",
                "poses": [{ "id": "p1", "imageOverride": "pose.png" }, { "id": "p2", "imageOverride": "" }]
            }
        }))
        .unwrap();
        data.element_document_mut()
            .scenes
            .entry("tab".to_string())
            .or_default()
            .nodes
            .push(Node::Element(element));
        let mut images = Vec::new();
        for_each_tree_file_value(&data, AssetKind::Image, &mut |path| {
            images.push(path.clone())
        });
        assert_eq!(
            images,
            vec![
                "base.png".to_string(),
                "pose.png".to_string(),
                "active.png".to_string()
            ]
        );
        let mut sounds = Vec::new();
        for_each_tree_file_value(&data, AssetKind::Sound, &mut |path| {
            sounds.push(path.clone())
        });
        assert!(sounds.is_empty());
    }
}
