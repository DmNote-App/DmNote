use serde::{Deserialize, Serialize, Serializer, Deserializer};
use serde::ser::SerializeMap;
use serde::de::Error as DeError;
use std::collections::HashMap;
use std::path::Path;
use uuid::Uuid;

pub type KeyMappings = HashMap<String, Vec<String>>;
pub type KeyPositions = HashMap<String, Vec<KeyPosition>>;
pub type KeyCounters = HashMap<String, HashMap<String, u32>>;

#[derive(Debug, Clone, PartialEq)]
pub enum NoteColor {
    Solid(String),
    Gradient { top: String, bottom: String },
}

// Serialize as:
// - Solid: JSON string (e.g., "#FF00FF")
// - Gradient: object with explicit type { type: "gradient", top, bottom }
impl Serialize for NoteColor {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match self {
            NoteColor::Solid(s) => serializer.serialize_str(s),
            NoteColor::Gradient { top, bottom } => {
                let mut map = serializer.serialize_map(Some(3))?;
                map.serialize_entry("type", "gradient")?;
                map.serialize_entry("top", top)?;
                map.serialize_entry("bottom", bottom)?;
                map.end()
            }
        }
    }
}

// Deserialize accepts both shapes:
// - string => Solid
// - object with { type: "gradient", top, bottom } => Gradient
// - object with { top, bottom } (no type) => Gradient (backward compatibility)
impl<'de> Deserialize<'de> for NoteColor {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        use serde_json::Value;
        let value = Value::deserialize(deserializer)?;
        match value {
            Value::String(s) => Ok(NoteColor::Solid(s)),
            Value::Object(map) => {
                let ty = map.get("type").and_then(|v| v.as_str()).unwrap_or("");
                let top = map.get("top").and_then(|v| v.as_str());
                let bottom = map.get("bottom").and_then(|v| v.as_str());
                match (top, bottom) {
                    (Some(top), Some(bottom)) => Ok(NoteColor::Gradient {
                        top: top.to_string(),
                        bottom: bottom.to_string(),
                    }),
                    _ => Err(DeError::custom(format!(
                        "invalid noteColor object (type={})",
                        ty
                    ))),
                }
            }
            _ => Err(DeError::custom("invalid noteColor value")),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KeyPosition {
    pub dx: f64,
    pub dy: f64,
    pub width: f64,
    pub height: f64,
    #[serde(default)]
    pub active_image: Option<String>,
    #[serde(default)]
    pub inactive_image: Option<String>,
    #[serde(default)]
    pub active_transparent: bool,
    #[serde(default)]
    pub idle_transparent: bool,
    pub count: u32,
    pub note_color: NoteColor,
    pub note_opacity: u32,
    #[serde(default)]
    pub class_name: Option<String>,
    #[serde(default)]
    pub counter: KeyCounterSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum KeyCounterPlacement {
    Inside,
    Outside,
}

impl Default for KeyCounterPlacement {
    fn default() -> Self {
        KeyCounterPlacement::Outside
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum KeyCounterAlign {
    Top,
    Bottom,
    Left,
    Right,
}

impl Default for KeyCounterAlign {
    fn default() -> Self {
        KeyCounterAlign::Top
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KeyCounterColor {
    pub idle: String,
    pub active: String,
}

impl Default for KeyCounterColor {
    fn default() -> Self {
        Self {
            idle: "#FFFFFF".to_string(),
            active: "#000000".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KeyCounterSettings {
    #[serde(default)]
    pub placement: KeyCounterPlacement,
    #[serde(default)]
    pub align: KeyCounterAlign,
    #[serde(default)]
    pub fill: KeyCounterColor,
    #[serde(default = "default_stroke_color")]
    pub stroke: KeyCounterColor,
    #[serde(default = "default_gap")]
    pub gap: u32,
}

fn default_stroke_color() -> KeyCounterColor {
    KeyCounterColor {
        idle: "#000000".to_string(),
        active: "#FFFFFF".to_string(),
    }
}

impl Default for KeyCounterSettings {
    fn default() -> Self {
        Self {
            placement: KeyCounterPlacement::Outside,
            align: KeyCounterAlign::Top,
            fill: KeyCounterColor::default(),
            stroke: default_stroke_color(),
            gap: default_gap(),
        }
    }
}

fn default_gap() -> u32 { 6 }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NoteSettings {
    pub border_radius: u32,
    pub speed: u32,
    pub track_height: u32,
    pub reverse: bool,
    pub fade_position: FadePosition,
    pub delayed_note_enabled: bool,
    pub short_note_threshold_ms: u32,
    pub short_note_min_length_px: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum FadePosition {
    Auto,
    Top,
    Bottom,
}

impl Default for NoteSettings {
    fn default() -> Self {
        Self {
            border_radius: 2,
            speed: 180,
            track_height: 150,
            reverse: false,
            fade_position: FadePosition::Auto,
            delayed_note_enabled: false,
            short_note_threshold_ms: 50,
            short_note_min_length_px: 30,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CustomCss {
    pub path: Option<String>,
    pub content: String,
}

impl Default for CustomCss {
    fn default() -> Self {
        Self {
            path: None,
            content: String::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct JsPlugin {
    pub id: String,
    pub name: String,
    pub path: Option<String>,
    pub content: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CustomJs {
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub plugins: Vec<JsPlugin>,
}

impl Default for CustomJs {
    fn default() -> Self {
        Self {
            path: None,
            content: String::new(),
            plugins: Vec::new(),
        }
    }
}

impl CustomJs {
    pub fn normalize(&mut self) -> bool {
        let mut mutated = false;

        for plugin in self.plugins.iter_mut() {
            if plugin.id.trim().is_empty() {
                plugin.id = Uuid::new_v4().to_string();
                mutated = true;
            }
            if plugin.name.trim().is_empty() {
                plugin.name = plugin
                    .path
                    .as_deref()
                    .and_then(|value| Path::new(value).file_name())
                    .and_then(|value| value.to_str())
                    .map(|value| value.to_string())
                    .unwrap_or_else(|| "plugin.js".to_string());
                mutated = true;
            }
        }

        if self.plugins.is_empty() && (self.path.is_some() || !self.content.is_empty()) {
            let name = self
                .path
                .as_deref()
                .and_then(|value| Path::new(value).file_name())
                .and_then(|value| value.to_str())
                .map(|value| value.to_string())
                .unwrap_or_else(|| "custom.js".to_string());
            let plugin = JsPlugin {
                id: Uuid::new_v4().to_string(),
                name,
                path: self.path.clone(),
                content: self.content.clone(),
                enabled: true,
            };
            self.plugins.push(plugin);
            self.path = None;
            self.content.clear();
            mutated = true;
        }

        mutated
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum OverlayResizeAnchor {
    TopLeft,
    TopRight,
    BottomLeft,
    BottomRight,
    Center,
}

impl Default for OverlayResizeAnchor {
    fn default() -> Self {
        OverlayResizeAnchor::TopLeft
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OverlayBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}
impl OverlayResizeAnchor {
    pub fn as_str(&self) -> &'static str {
        match self {
            OverlayResizeAnchor::TopLeft => "top-left",
            OverlayResizeAnchor::TopRight => "top-right",
            OverlayResizeAnchor::BottomLeft => "bottom-left",
            OverlayResizeAnchor::BottomRight => "bottom-right",
            OverlayResizeAnchor::Center => "center",
        }
    }
}

pub fn overlay_resize_anchor_from_str(value: &str) -> Option<OverlayResizeAnchor> {
    match value {
        "top-left" => Some(OverlayResizeAnchor::TopLeft),
        "top-right" => Some(OverlayResizeAnchor::TopRight),
        "bottom-left" => Some(OverlayResizeAnchor::BottomLeft),
        "bottom-right" => Some(OverlayResizeAnchor::BottomRight),
        "center" => Some(OverlayResizeAnchor::Center),
        _ => None,
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CustomTab {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AppStoreData {
    pub hardware_acceleration: bool,
    pub always_on_top: bool,
    pub overlay_locked: bool,
    pub note_effect: bool,
    #[serde(default)]
    pub note_settings: NoteSettings,
    pub selected_key_type: String,
    #[serde(default)]
    pub custom_tabs: Vec<CustomTab>,
    pub angle_mode: String,
    pub language: String,
    pub laboratory_enabled: bool,
    #[serde(default)]
    pub developer_mode_enabled: bool,
    #[serde(default)]
    pub keys: KeyMappings,
    #[serde(default)]
    pub key_positions: KeyPositions,
    #[serde(default)]
    pub key_counters: KeyCounters,
    pub background_color: String,
    pub use_custom_css: bool,
    #[serde(default)]
    pub custom_css: CustomCss,
    #[serde(default)]
    pub use_custom_js: bool,
    #[serde(default)]
    pub custom_js: CustomJs,
    pub overlay_resize_anchor: OverlayResizeAnchor,
    pub overlay_bounds: Option<OverlayBounds>,
    pub overlay_last_content_top_offset: Option<f64>,
    #[serde(default)]
    pub overlay_bounds_are_logical: bool,
    #[serde(default)]
    pub key_counter_enabled: bool,
    /// 플러그인 데이터 저장소 (plugin_data_* 키로 저장)
    #[serde(default, flatten)]
    pub plugin_data: HashMap<String, serde_json::Value>,
}

impl Default for AppStoreData {
    fn default() -> Self {
        Self {
            hardware_acceleration: true,
            always_on_top: true,
            overlay_locked: false,
            note_effect: false,
            note_settings: NoteSettings::default(),
            selected_key_type: "4key".to_string(),
            custom_tabs: Vec::new(),
            angle_mode: "d3d11".to_string(),
            language: "ko".to_string(),
            laboratory_enabled: false,
            developer_mode_enabled: false,
            keys: KeyMappings::new(),
            key_positions: KeyPositions::new(),
            key_counters: KeyCounters::new(),
            background_color: "transparent".to_string(),
            use_custom_css: false,
            custom_css: CustomCss::default(),
            use_custom_js: false,
            custom_js: CustomJs::default(),
            overlay_resize_anchor: OverlayResizeAnchor::TopLeft,
            overlay_bounds: None,
            overlay_last_content_top_offset: None,
            overlay_bounds_are_logical: false,
            key_counter_enabled: false,
            plugin_data: HashMap::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapOverlayState {
    pub visible: bool,
    pub locked: bool,
    pub anchor: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapPayload {
    pub settings: SettingsState,
    pub keys: KeyMappings,
    pub positions: KeyPositions,
    pub custom_tabs: Vec<CustomTab>,
    pub selected_key_type: String,
    pub current_mode: String,
    pub overlay: BootstrapOverlayState,
    pub key_counters: KeyCounters,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SettingsState {
    pub hardware_acceleration: bool,
    pub always_on_top: bool,
    pub overlay_locked: bool,
    pub note_effect: bool,
    #[serde(default)]
    pub note_settings: NoteSettings,
    pub angle_mode: String,
    pub language: String,
    pub laboratory_enabled: bool,
    #[serde(default)]
    pub developer_mode_enabled: bool,
    pub background_color: String,
    #[serde(rename = "useCustomCSS")]
    pub use_custom_css: bool,
    #[serde(rename = "customCSS")]
    #[serde(default)]
    pub custom_css: CustomCss,
    #[serde(rename = "useCustomJS")]
    pub use_custom_js: bool,
    #[serde(rename = "customJS")]
    #[serde(default)]
    pub custom_js: CustomJs,
    pub overlay_resize_anchor: OverlayResizeAnchor,
    #[serde(default)]
    pub key_counter_enabled: bool,
}

impl Default for SettingsState {
    fn default() -> Self {
        Self {
            hardware_acceleration: true,
            always_on_top: true,
            overlay_locked: false,
            note_effect: false,
            note_settings: NoteSettings::default(),
            angle_mode: "d3d11".to_string(),
            language: "ko".to_string(),
            laboratory_enabled: false,
            developer_mode_enabled: false,
            background_color: "transparent".to_string(),
            use_custom_css: false,
            custom_css: CustomCss::default(),
            use_custom_js: false,
            custom_js: CustomJs::default(),
            overlay_resize_anchor: OverlayResizeAnchor::TopLeft,
            key_counter_enabled: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct NoteSettingsPatch {
    pub border_radius: Option<u32>,
    pub speed: Option<u32>,
    pub track_height: Option<u32>,
    pub reverse: Option<bool>,
    pub fade_position: Option<FadePosition>,
    pub delayed_note_enabled: Option<bool>,
    pub short_note_threshold_ms: Option<u32>,
    pub short_note_min_length_px: Option<u32>,
}

impl Default for NoteSettingsPatch {
    fn default() -> Self {
        Self {
            border_radius: None,
            speed: None,
            track_height: None,
            reverse: None,
            fade_position: None,
            delayed_note_enabled: None,
            short_note_threshold_ms: None,
            short_note_min_length_px: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPatchInput {
    pub hardware_acceleration: Option<bool>,
    pub always_on_top: Option<bool>,
    pub overlay_locked: Option<bool>,
    pub note_effect: Option<bool>,
    pub note_settings: Option<NoteSettingsPatch>,
    pub angle_mode: Option<String>,
    pub language: Option<String>,
    pub laboratory_enabled: Option<bool>,
    pub developer_mode_enabled: Option<bool>,
    pub background_color: Option<String>,
    #[serde(rename = "useCustomCSS")]
    pub use_custom_css: Option<bool>,
    #[serde(rename = "customCSS")]
    pub custom_css: Option<CustomCssPatch>,
    #[serde(rename = "useCustomJS")]
    pub use_custom_js: Option<bool>,
    #[serde(rename = "customJS")]
    pub custom_js: Option<CustomJsPatch>,
    pub overlay_resize_anchor: Option<OverlayResizeAnchor>,
    pub key_counter_enabled: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CustomCssPatch {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<Option<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CustomJsPatch {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<Option<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plugins: Option<Vec<JsPlugin>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsDiff {
    pub changed: SettingsPatch,
    pub full: SettingsState,
}

impl SettingsDiff {
    pub fn changed_count(&self) -> usize {
        let p = &self.changed;
        [
            p.hardware_acceleration.is_some(),
            p.always_on_top.is_some(),
            p.overlay_locked.is_some(),
            p.note_effect.is_some(),
            p.note_settings.is_some(),
            p.angle_mode.is_some(),
            p.language.is_some(),
            p.laboratory_enabled.is_some(),
            p.developer_mode_enabled.is_some(),
            p.background_color.is_some(),
            p.use_custom_css.is_some(),
            p.custom_css.is_some(),
            p.use_custom_js.is_some(),
            p.custom_js.is_some(),
            p.overlay_resize_anchor.is_some(),
            p.key_counter_enabled.is_some(),
        ]
        .iter()
        .filter(|&&x| x)
        .count()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPatch {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hardware_acceleration: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub always_on_top: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub overlay_locked: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note_effect: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note_settings: Option<NoteSettings>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub angle_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub laboratory_enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub developer_mode_enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub background_color: Option<String>,
    #[serde(rename = "useCustomCSS")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub use_custom_css: Option<bool>,
    #[serde(rename = "customCSS")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_css: Option<CustomCss>,
    #[serde(rename = "useCustomJS")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub use_custom_js: Option<bool>,
    #[serde(rename = "customJS")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_js: Option<CustomJs>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub overlay_resize_anchor: Option<OverlayResizeAnchor>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key_counter_enabled: Option<bool>,
}
