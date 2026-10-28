//! 요소 문서 - 탭(장면)마다 요소 트리 하나. 목록 순서가 곧 겹치는 순서(앞이 아래)다.
//! 그룹은 레이어 정리용 폴더이고 중첩할 수 있다.

use std::collections::{BTreeMap, HashMap, HashSet};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::value::ReferenceScope;

pub const DOCUMENT_FORMAT_VERSION: u32 = 1;
pub const MAX_SLOT_KEYS: usize = 8;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub format_version: u32,
    // 종류별 저장 버전 - 같은 종류의 요소는 모두 이 버전으로 저장돼 있다
    #[serde(default)]
    pub kind_versions: BTreeMap<String, u32>,
    #[serde(default)]
    pub scenes: BTreeMap<String, Scene>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

impl Default for Document {
    fn default() -> Self {
        Self {
            format_version: DOCUMENT_FORMAT_VERSION,
            kind_versions: BTreeMap::new(),
            scenes: BTreeMap::new(),
            extra: Map::new(),
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Scene {
    #[serde(default)]
    pub nodes: Vec<Node>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Node {
    Group(Group),
    Element(Element),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Group {
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub hidden: bool,
    #[serde(default)]
    pub children: Vec<Node>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Frame {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    #[serde(default)]
    pub rotation: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Element {
    pub id: String,
    pub kind: String,
    pub frame: Frame,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub hidden: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub class_name: Option<String>,
    // 기능 묶음 - 종류가 쓰는 것만 붙는다
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub bundles: BTreeMap<String, Value>,
    // 종류 고유 값 - 규칙표로 검사
    #[serde(default, skip_serializing_if = "Map::is_empty")]
    pub values: Map<String, Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub input: Option<InputBinding>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum InputBinding {
    // 키 슬롯 - 키 이름 하나 또는 {keys, match}
    Key {
        slot: Value,
    },
    #[serde(rename_all = "camelCase")]
    Axis {
        axis_id: String,
    },
    // 마우스 포인터 (이동량·화면 위치는 종류 값으로 고른다)
    Pointer {},
}

impl InputBinding {
    pub fn type_name(&self) -> &'static str {
        match self {
            InputBinding::Key { .. } => "keySlot",
            InputBinding::Axis { .. } => "axis",
            InputBinding::Pointer {} => "pointer",
        }
    }

    pub fn is_valid(&self) -> bool {
        match self {
            InputBinding::Key { slot } => is_valid_key_slot(slot),
            InputBinding::Axis { .. } | InputBinding::Pointer {} => true,
        }
    }
}

pub fn is_valid_key_slot(slot: &Value) -> bool {
    match slot {
        Value::String(_) => true,
        Value::Object(object) => {
            let Some(keys) = object.get("keys").and_then(Value::as_array) else {
                return false;
            };
            let match_ok = object
                .get("match")
                .and_then(Value::as_str)
                .is_some_and(|mode| mode == "any" || mode == "all");
            let mut seen = HashSet::new();
            match_ok
                && object.len() == 2
                && (2..=MAX_SLOT_KEYS).contains(&keys.len())
                && keys.iter().all(|key| {
                    key.as_str().is_some_and(|key| {
                        !key.is_empty()
                            && !key.contains('+')
                            && !key.contains('|')
                            && seen.insert(key)
                    })
                })
        }
        _ => false,
    }
}

impl Node {
    pub fn id(&self) -> &str {
        match self {
            Node::Group(group) => &group.id,
            Node::Element(element) => &element.id,
        }
    }

    pub fn as_element(&self) -> Option<&Element> {
        match self {
            Node::Element(element) => Some(element),
            Node::Group(_) => None,
        }
    }
}

/// 트리 안 위치 - 장면의 nodes에서 시작해 children으로 내려가는 index 목록
pub type NodePath = Vec<usize>;

pub fn walk<'a>(nodes: &'a [Node], visitor: &mut dyn FnMut(&'a Node, &[usize])) {
    fn inner<'a>(
        nodes: &'a [Node],
        path: &mut Vec<usize>,
        visitor: &mut dyn FnMut(&'a Node, &[usize]),
    ) {
        for (index, node) in nodes.iter().enumerate() {
            path.push(index);
            visitor(node, path);
            if let Node::Group(group) = node {
                inner(&group.children, path, visitor);
            }
            path.pop();
        }
    }
    inner(nodes, &mut Vec::new(), visitor);
}

pub fn walk_mut(nodes: &mut [Node], visitor: &mut dyn FnMut(&mut Node)) {
    for node in nodes {
        visitor(node);
        if let Node::Group(group) = node {
            walk_mut(&mut group.children, visitor);
        }
    }
}

impl Scene {
    /// 겹치는 순서(아래→위)대로 요소만
    pub fn elements(&self) -> Vec<&Element> {
        let mut out = Vec::new();
        walk(&self.nodes, &mut |node, _| {
            if let Node::Element(element) = node {
                out.push(element);
            }
        });
        out
    }

    pub fn find_path(&self, id: &str) -> Option<NodePath> {
        let mut found = None;
        walk(&self.nodes, &mut |node, path| {
            if found.is_none() && node.id() == id {
                found = Some(path.to_vec());
            }
        });
        found
    }

    pub fn node_at(&self, path: &[usize]) -> Option<&Node> {
        let (first, rest) = path.split_first()?;
        let mut node = self.nodes.get(*first)?;
        for index in rest {
            let Node::Group(group) = node else {
                return None;
            };
            node = group.children.get(*index)?;
        }
        Some(node)
    }

    pub fn node_at_mut(&mut self, path: &[usize]) -> Option<&mut Node> {
        let (first, rest) = path.split_first()?;
        let mut node = self.nodes.get_mut(*first)?;
        for index in rest {
            let Node::Group(group) = node else {
                return None;
            };
            node = group.children.get_mut(*index)?;
        }
        Some(node)
    }

    /// 그룹 id(없으면 장면 맨 위)의 자식 목록
    pub fn children_mut(&mut self, parent: Option<&str>) -> Option<&mut Vec<Node>> {
        match parent {
            None => Some(&mut self.nodes),
            Some(id) => {
                let path = self.find_path(id)?;
                match self.node_at_mut(&path)? {
                    Node::Group(group) => Some(&mut group.children),
                    Node::Element(_) => None,
                }
            }
        }
    }

    pub fn element(&self, id: &str) -> Option<&Element> {
        self.find_path(id)
            .and_then(|path| self.node_at(&path))
            .and_then(Node::as_element)
    }

    pub fn element_mut(&mut self, id: &str) -> Option<&mut Element> {
        let path = self.find_path(id)?;
        match self.node_at_mut(&path)? {
            Node::Element(element) => Some(element),
            Node::Group(_) => None,
        }
    }

    /// 경로에서 노드를 떼어 낸다
    pub fn take_at(&mut self, path: &[usize]) -> Option<Node> {
        let (last, parent) = path.split_last()?;
        let siblings = if parent.is_empty() {
            &mut self.nodes
        } else {
            match self.node_at_mut(parent)? {
                Node::Group(group) => &mut group.children,
                Node::Element(_) => return None,
            }
        };
        (*last < siblings.len()).then(|| siblings.remove(*last))
    }

    pub fn kind_index(&self) -> SceneKinds {
        let mut kinds = HashMap::new();
        walk(&self.nodes, &mut |node, _| {
            if let Node::Element(element) = node {
                kinds.insert(element.id.clone(), element.kind.clone());
            }
        });
        SceneKinds(kinds)
    }

    /// 그룹 id → 바로 위 그룹 id
    pub fn parent_of(&self, id: &str) -> Option<Option<String>> {
        let path = self.find_path(id)?;
        if path.len() == 1 {
            return Some(None);
        }
        let parent = self.node_at(&path[..path.len() - 1])?;
        Some(Some(parent.id().to_string()))
    }
}

/// 장면 안 요소 id → 종류. 참조 검사에 쓴다
pub struct SceneKinds(HashMap<String, String>);

impl ReferenceScope for SceneKinds {
    fn kind_of(&self, element_id: &str) -> Option<&str> {
        self.0.get(element_id).map(String::as_str)
    }
}

impl Document {
    /// 문서 전체 노드 id (중복 검사용)
    pub fn all_ids(&self) -> HashSet<String> {
        let mut ids = HashSet::new();
        for scene in self.scenes.values() {
            walk(&scene.nodes, &mut |node, _| {
                ids.insert(node.id().to_string());
            });
        }
        ids
    }
}

#[cfg(test)]
mod tests;
