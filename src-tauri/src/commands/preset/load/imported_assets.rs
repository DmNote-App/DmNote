use super::*;

pub(super) fn migrate_imported_font_weights(elements: &mut ElementCollections) {
    for_each_key_position_mut(elements, |_, position| {
        position.migrate_legacy_font_weight();
    });
}

#[cfg(test)]
pub(super) fn merge_tab_preset_fonts(
    existing_font_settings: &FontSettings,
    imported_font_settings: FontSettings,
    restore_fonts: impl FnOnce(&mut FontSettings) -> CmdResult<()>,
) -> CmdResult<Option<FontSettings>> {
    let Some(prepared) = prepare_tab_preset_fonts(
        existing_font_settings,
        imported_font_settings,
        restore_fonts,
    )?
    else {
        return Ok(None);
    };
    Ok(merge_prepared_tab_preset_fonts(
        existing_font_settings,
        prepared,
    ))
}

pub(super) fn prepare_tab_preset_fonts(
    existing_font_settings: &FontSettings,
    mut imported_font_settings: FontSettings,
    restore_fonts: impl FnOnce(&mut FontSettings) -> CmdResult<()>,
) -> CmdResult<Option<FontSettings>> {
    let existing_names: HashSet<String> = existing_font_settings
        .custom_fonts
        .iter()
        .map(|font| font.name.clone())
        .collect();

    // 같은 이름은 기존 정의 유지. 같은 family의 다른 페이스(파일)는 개별 자산이라
    // 이름으로 묶지 않고, 프리셋 내부 중복은 id 기준으로만 방어
    let mut seen_ids: HashSet<String> = HashSet::new();
    imported_font_settings.custom_fonts.retain(|font| {
        !existing_names.contains(&font.name)
            && (font.id.is_empty() || seen_ids.insert(font.id.clone()))
    });
    if imported_font_settings.custom_fonts.is_empty() {
        return Ok(None);
    }

    // 이름 필터 후 파일 복원 — 제외할 로컬 폰트의 고아 파일 생성 방지
    restore_fonts(&mut imported_font_settings)?;

    let mut existing_ids: HashSet<String> = existing_font_settings
        .custom_fonts
        .iter()
        .map(|font| font.id.clone())
        .collect();
    for font in imported_font_settings.custom_fonts.iter_mut() {
        if existing_ids.contains(&font.id) {
            font.id = Uuid::new_v4().to_string();
        }
        existing_ids.insert(font.id.clone());
    }

    Ok(Some(imported_font_settings))
}

pub(super) fn merge_prepared_tab_preset_fonts(
    existing_font_settings: &FontSettings,
    mut prepared: FontSettings,
) -> Option<FontSettings> {
    let existing_names = existing_font_settings
        .custom_fonts
        .iter()
        .map(|font| font.name.clone())
        .collect::<HashSet<_>>();
    let importable_names = prepared
        .custom_fonts
        .iter()
        .filter(|font| !existing_names.contains(&font.name))
        .map(|font| font.name.clone())
        .collect::<HashSet<_>>();
    prepared
        .custom_fonts
        .retain(|font| importable_names.contains(&font.name));
    if prepared.custom_fonts.is_empty() {
        return None;
    }

    let mut existing_ids = existing_font_settings
        .custom_fonts
        .iter()
        .map(|font| font.id.clone())
        .collect::<HashSet<_>>();
    for font in &mut prepared.custom_fonts {
        if existing_ids.contains(&font.id) {
            font.id = Uuid::new_v4().to_string();
        }
        existing_ids.insert(font.id.clone());
    }

    let mut merged = existing_font_settings.clone();
    merged.custom_fonts.extend(prepared.custom_fonts);
    Some(merged)
}

pub(super) fn restore_preset_local_fonts(
    app: &AppHandle,
    font_settings: &mut FontSettings,
    embedded_local_fonts: Option<&[EmbeddedLocalFont]>,
) -> CmdResult<()> {
    let has_local_fonts = font_settings
        .custom_fonts
        .iter()
        .any(|font| font.font_type == FontType::Local);
    if !has_local_fonts {
        return Ok(());
    }

    let app_data_dir = app.path().app_data_dir()?;
    let fonts_dir = app_data_dir.join("fonts");

    restore_preset_local_fonts_in_dir(&fonts_dir, font_settings, embedded_local_fonts)
}

pub(super) fn restore_preset_local_fonts_in_dir(
    fonts_dir: &Path,
    font_settings: &mut FontSettings,
    embedded_local_fonts: Option<&[EmbeddedLocalFont]>,
) -> CmdResult<()> {
    let has_local_fonts = font_settings
        .custom_fonts
        .iter()
        .any(|font| font.font_type == FontType::Local);
    if !has_local_fonts {
        return Ok(());
    }

    let embedded_map: HashMap<&str, &EmbeddedLocalFont> = embedded_local_fonts
        .unwrap_or(&[])
        .iter()
        .map(|font| (font.font_id.as_str(), font))
        .collect();

    fs::create_dir_all(fonts_dir)?;

    for font in font_settings.custom_fonts.iter_mut() {
        if font.font_type != FontType::Local {
            continue;
        }

        // 로컬 폰트는 항상 복사된 파일 경로로 제공
        font.css_content = None;

        if let Some(embedded) = embedded_map.get(font.id.as_str()) {
            let bytes = match BASE64_STANDARD.decode(embedded.data_base64.as_bytes()) {
                Ok(bytes) => bytes,
                Err(err) => {
                    log::warn!(
                        "[Preset] Failed to decode embedded local font '{}': {err}",
                        font.display_name
                    );
                    font.local_path = None;
                    font.enabled = false;
                    continue;
                }
            };

            let extension = normalize_font_extension(embedded.extension.as_deref());
            let dest_path = fonts_dir.join(format!("{}.{}", Uuid::new_v4(), extension));
            if let Err(err) = fs::write(&dest_path, bytes) {
                log::warn!(
                    "[Preset] Failed to restore local font file for '{}': {err}",
                    font.display_name
                );
                font.local_path = None;
                font.enabled = false;
                continue;
            }
            font.local_path = Some(dest_path.to_string_lossy().to_string());
            continue;
        }

        // 하위 호환: 기존 절대 경로가 유효하면 유지
        let has_existing_valid_path = font
            .local_path
            .as_ref()
            .map(|path| !path.trim().is_empty() && Path::new(path).exists())
            .unwrap_or(false);

        if !has_existing_valid_path {
            log::warn!(
                "[Preset] Disabling font '{}' — no embedded payload and its file is missing on this machine",
                font.name
            );
            font.local_path = None;
            font.enabled = false;
        }
    }

    Ok(())
}

pub(super) fn restore_preset_local_images(
    app: &AppHandle,
    elements: &mut ElementCollections,
    embedded_local_images: Option<&[EmbeddedLocalImage]>,
) -> CmdResult<()> {
    let app_data_dir = app.path().app_data_dir()?;
    restore_preset_element_images_in_dir(
        &app_data_dir.join("images"),
        elements,
        embedded_local_images,
    )
}

#[cfg(test)]
pub(super) fn restore_preset_local_images_in_dir(
    images_dir: &Path,
    key_positions: &mut KeyPositions,
    stat_positions: &mut StatPositions,
    graph_positions: &mut GraphPositions,
    knob_positions: &mut KnobPositions,
    sprite_positions: &mut SpritePositions,
    embedded_local_images: Option<&[EmbeddedLocalImage]>,
) -> CmdResult<()> {
    let mut elements = ElementCollections {
        key_positions: std::mem::take(key_positions),
        stat_positions: std::mem::take(stat_positions),
        graph_positions: std::mem::take(graph_positions),
        knob_positions: std::mem::take(knob_positions),
        sprite_positions: std::mem::take(sprite_positions),
    };
    let result =
        restore_preset_element_images_in_dir(images_dir, &mut elements, embedded_local_images);
    *key_positions = elements.key_positions;
    *stat_positions = elements.stat_positions;
    *graph_positions = elements.graph_positions;
    *knob_positions = elements.knob_positions;
    *sprite_positions = elements.sprite_positions;
    result
}

fn restore_preset_element_images_in_dir(
    images_dir: &Path,
    elements: &mut ElementCollections,
    embedded_local_images: Option<&[EmbeddedLocalImage]>,
) -> CmdResult<()> {
    let mut has_any_images = false;
    for_each_element(&*elements, |_, _, _, element| {
        element.for_each_image_ref(&mut |image_ref| {
            has_any_images |= option_has_non_empty_text(image_ref);
        });
    });

    if !has_any_images {
        return Ok(());
    }

    let embedded_map: HashMap<&str, &EmbeddedLocalImage> = embedded_local_images
        .unwrap_or(&[])
        .iter()
        .map(|image| (image.image_id.as_str(), image))
        .collect();
    let mut restored_path_cache: HashMap<String, String> = HashMap::new();

    fs::create_dir_all(images_dir)?;

    let mut failure = None;
    for_each_element_mut(elements, |_, _, element| {
        element.for_each_image_ref_mut(&mut |image_ref| {
            if failure.is_some() {
                return;
            }
            if let Err(error) = restore_position_image_reference(
                images_dir,
                &embedded_map,
                &mut restored_path_cache,
                image_ref,
            ) {
                failure = Some(error);
            }
        });
    });
    if let Some(error) = failure {
        return Err(error);
    }

    fill_missing_sprite_image_metrics(&mut elements.sprite_positions);

    Ok(())
}

pub(super) fn restore_position_image_reference(
    images_dir: &Path,
    embedded_map: &HashMap<&str, &EmbeddedLocalImage>,
    restored_path_cache: &mut HashMap<String, String>,
    image_ref: &mut Option<String>,
) -> CmdResult<()> {
    let Some(current_value) = image_ref.clone() else {
        return Ok(());
    };
    let trimmed = current_value.trim();
    if trimmed.is_empty() {
        return Ok(());
    }

    if let Some(image_id) = trimmed.strip_prefix(PRESET_LOCAL_IMAGE_PREFIX) {
        if let Some(restored_path) = restored_path_cache.get(image_id) {
            *image_ref = Some(restored_path.clone());
            return Ok(());
        }
        let Some(embedded) = embedded_map.get(image_id) else {
            log::warn!(
                "[Preset] Missing embedded image payload for id '{}'; clearing image reference",
                image_id
            );
            *image_ref = None;
            return Ok(());
        };

        let bytes = match BASE64_STANDARD.decode(embedded.data_base64.as_bytes()) {
            Ok(bytes) => bytes,
            Err(err) => {
                log::warn!(
                    "[Preset] Failed to decode embedded image '{}': {err}",
                    image_id
                );
                *image_ref = None;
                return Ok(());
            }
        };
        let extension = normalize_image_extension(embedded.extension.as_deref());
        let imported = match import_image_bytes(&bytes, images_dir, &extension) {
            Ok(imported) => imported,
            Err(err) => {
                log::warn!(
                    "[Preset] Failed to restore embedded image '{}': {err}",
                    image_id
                );
                *image_ref = None;
                return Ok(());
            }
        };
        let restored = imported.path.to_string_lossy().to_string();
        restored_path_cache.insert(image_id.to_string(), restored.clone());
        *image_ref = Some(restored);
        return Ok(());
    }

    // 레거시 Preset 호환: data URL 이미지를 appdata 파일 경로로 변환
    if let Some((bytes, extension)) = decode_image_data_url(trimmed) {
        let imported = import_image_bytes(&bytes, images_dir, &extension)?;
        *image_ref = Some(imported.path.to_string_lossy().to_string());
        return Ok(());
    }

    // 레거시 호환: 로컬 절대 경로를 appdata/images로 복사
    if let Some(source_path) = super::super::local_source_path_from_image_ref(trimmed) {
        if source_path.exists() {
            if source_path.starts_with(images_dir) {
                *image_ref = Some(source_path.to_string_lossy().to_string());
                return Ok(());
            }
            let extension =
                normalize_image_extension(source_path.extension().and_then(|ext| ext.to_str()));
            let imported = match import_image_file(&source_path, images_dir, &extension) {
                Ok(imported) => imported,
                Err(err) => {
                    log::warn!(
                        "[Preset] Failed to copy local image from '{}': {err}",
                        source_path.display()
                    );
                    *image_ref = None;
                    return Ok(());
                }
            };
            *image_ref = Some(imported.path.to_string_lossy().to_string());
            return Ok(());
        }

        // 다른 기기에서 import된 Preset: 해석 불가한 절대 경로는 정상 fallback 처리
        log::warn!(
            "[Preset] Clearing image reference to a file missing on this machine: {trimmed}"
        );
        *image_ref = None;
        return Ok(());
    }

    Ok(())
}

pub(super) fn restore_preset_local_sounds(
    app: &AppHandle,
    elements: &mut ElementCollections,
    embedded_local_sounds: Option<&[EmbeddedLocalSound]>,
) -> CmdResult<()> {
    let mut has_any_sounds = false;
    for_each_key_position(&*elements, |kind, _, _, position| {
        has_any_sounds |= kind.has_sound() && option_has_non_empty_text(&position.sound_path);
    });

    if !has_any_sounds {
        return Ok(());
    }

    let app_data_dir = app.path().app_data_dir()?;
    let sounds_dir = app_data_dir.join("sounds");

    restore_preset_element_sounds_in_dir(&sounds_dir, elements, embedded_local_sounds)
}

#[cfg(test)]
pub(super) fn restore_preset_local_sounds_in_dir(
    sounds_dir: &Path,
    key_positions: &mut KeyPositions,
    stat_positions: &mut StatPositions,
    graph_positions: &mut GraphPositions,
    knob_positions: &mut KnobPositions,
    embedded_local_sounds: Option<&[EmbeddedLocalSound]>,
) -> CmdResult<()> {
    let mut elements = ElementCollections {
        key_positions: std::mem::take(key_positions),
        stat_positions: std::mem::take(stat_positions),
        graph_positions: std::mem::take(graph_positions),
        knob_positions: std::mem::take(knob_positions),
        sprite_positions: SpritePositions::new(),
    };
    let result =
        restore_preset_element_sounds_in_dir(sounds_dir, &mut elements, embedded_local_sounds);
    *key_positions = elements.key_positions;
    *stat_positions = elements.stat_positions;
    *graph_positions = elements.graph_positions;
    *knob_positions = elements.knob_positions;
    result
}

fn restore_preset_element_sounds_in_dir(
    sounds_dir: &Path,
    elements: &mut ElementCollections,
    embedded_local_sounds: Option<&[EmbeddedLocalSound]>,
) -> CmdResult<()> {
    fs::create_dir_all(sounds_dir)?;

    let embedded_map: HashMap<&str, &EmbeddedLocalSound> = embedded_local_sounds
        .unwrap_or(&[])
        .iter()
        .map(|sound| (sound.sound_id.as_str(), sound))
        .collect();

    let mut restored_path_cache: HashMap<String, String> = HashMap::new();

    let mut failure = None;
    for_each_key_position_mut(elements, |kind, position| {
        if !kind.has_sound() || failure.is_some() {
            return;
        }
        if let Err(error) = restore_position_sound_reference(
            sounds_dir,
            &embedded_map,
            &mut restored_path_cache,
            &mut position.sound_path,
        ) {
            failure = Some(error);
        }
    });

    match failure {
        Some(error) => Err(error),
        None => Ok(()),
    }
}

pub(super) fn restore_position_sound_reference(
    sounds_dir: &Path,
    embedded_map: &HashMap<&str, &EmbeddedLocalSound>,
    restored_path_cache: &mut HashMap<String, String>,
    sound_ref: &mut Option<String>,
) -> CmdResult<()> {
    let Some(current_value) = sound_ref.clone() else {
        return Ok(());
    };
    let trimmed = current_value.trim();
    if trimmed.is_empty() {
        return Ok(());
    }

    if let Some(sound_id) = trimmed.strip_prefix(PRESET_LOCAL_SOUND_PREFIX) {
        if let Some(restored_path) = restored_path_cache.get(sound_id) {
            *sound_ref = Some(restored_path.clone());
            return Ok(());
        }
        let Some(embedded) = embedded_map.get(sound_id) else {
            log::warn!(
                "[Preset] Missing embedded sound payload for id '{}'; clearing sound reference",
                sound_id
            );
            *sound_ref = None;
            return Ok(());
        };

        let bytes = match BASE64_STANDARD.decode(embedded.data_base64.as_bytes()) {
            Ok(bytes) => bytes,
            Err(err) => {
                log::warn!(
                    "[Preset] Failed to decode embedded sound '{}': {err}",
                    sound_id
                );
                *sound_ref = None;
                return Ok(());
            }
        };

        let extension = normalize_sound_extension(embedded.extension.as_deref());
        let dest_path = sounds_dir.join(format!("{}.{}", Uuid::new_v4(), extension));
        if let Err(err) = fs::write(&dest_path, bytes) {
            log::warn!(
                "[Preset] Failed to restore embedded sound '{}': {err}",
                sound_id
            );
            *sound_ref = None;
            return Ok(());
        }
        let restored = dest_path.to_string_lossy().to_string();
        restored_path_cache.insert(sound_id.to_string(), restored.clone());
        *sound_ref = Some(restored);
        return Ok(());
    }

    // 레거시 호환: 절대 경로가 현재 기기에서 유효하면 그대로 유지.
    let path = std::path::PathBuf::from(trimmed);
    if path.is_absolute() && path.exists() {
        return Ok(());
    }

    // 다른 기기에서 임포트된 프리셋: 경로를 해석할 수 없으면 초기화.
    log::warn!("[Preset] Clearing sound reference to a file missing on this machine: {trimmed}");
    *sound_ref = None;
    Ok(())
}
