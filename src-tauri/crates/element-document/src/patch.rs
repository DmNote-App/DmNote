//! 창 사이 문서 전달 - 바뀐 장면·요소만 싣는다.
//! 구조(순서·그룹)가 바뀐 장면은 장면 전체를, 값만 바뀐 장면은 바뀐 요소만 보낸다.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::document::{walk, Document, Node, Scene};
use crate::ops::{diff, ChangeSet};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS))]
pub enum ScenePatch {
    Replace { scene: Scene },
    // 구조는 같고 값만 바뀐 노드 (요소·그룹)
    Nodes { nodes: Vec<Node> },
    Delete {},
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct DocumentPatch {
    pub kind_versions: BTreeMap<String, u32>,
    pub scenes: BTreeMap<String, ScenePatch>,
    pub changes: ChangeSet,
}

fn shallow(node: &Node) -> Node {
    match node {
        Node::Element(element) => Node::Element(element.clone()),
        // 그룹은 자기 정보만 - 자식은 각자 실린다
        Node::Group(group) => {
            let mut group = group.clone();
            group.children.clear();
            Node::Group(group)
        }
    }
}

pub fn make_patch(before: &Document, after: &Document) -> DocumentPatch {
    let changes = diff(before, after);
    let mut scenes = BTreeMap::new();
    for (scene_id, change) in &changes.scenes {
        let patch = match after.scenes.get(scene_id) {
            None => ScenePatch::Delete {},
            Some(scene) if change.structure || change.created => ScenePatch::Replace {
                scene: scene.clone(),
            },
            Some(scene) => {
                let mut nodes = Vec::new();
                walk(&scene.nodes, &mut |node, _| {
                    if change.changed.contains(node.id()) {
                        nodes.push(shallow(node));
                    }
                });
                ScenePatch::Nodes { nodes }
            }
        };
        scenes.insert(scene_id.clone(), patch);
    }
    DocumentPatch {
        kind_versions: after.kind_versions.clone(),
        scenes,
        changes,
    }
}

pub fn apply_patch(document: &mut Document, patch: &DocumentPatch) {
    document.kind_versions = patch.kind_versions.clone();
    for (scene_id, scene_patch) in &patch.scenes {
        match scene_patch {
            ScenePatch::Delete {} => {
                document.scenes.remove(scene_id);
            }
            ScenePatch::Replace { scene } => {
                document.scenes.insert(scene_id.clone(), scene.clone());
            }
            ScenePatch::Nodes { nodes } => {
                let Some(scene) = document.scenes.get_mut(scene_id) else {
                    continue;
                };
                for node in nodes {
                    let Some(path) = scene.find_path(node.id()) else {
                        continue;
                    };
                    let Some(target) = scene.node_at_mut(&path) else {
                        continue;
                    };
                    match (target, node) {
                        (Node::Element(target), Node::Element(next)) => *target = next.clone(),
                        (Node::Group(target), Node::Group(next)) => {
                            let children = std::mem::take(&mut target.children);
                            *target = next.clone();
                            target.children = children;
                        }
                        _ => {}
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::test_support::{dial_values, document, element, group};

    #[test]
    fn 패치를_적용하면_뒤_문서와_같아진다() {
        let before = document(vec![
            Node::Element(element("a", "pad", json!({}))),
            group(
                "g",
                vec![Node::Element(element("b", "dial", dial_values()))],
            ),
        ]);
        let mut values_changed = before.clone();
        values_changed
            .scenes
            .get_mut("tab")
            .unwrap()
            .element_mut("b")
            .unwrap()
            .frame
            .x = 9.0;
        let patch = make_patch(&before, &values_changed);
        assert!(matches!(patch.scenes["tab"], ScenePatch::Nodes { ref nodes } if nodes.len() == 1));
        let mut copy = before.clone();
        apply_patch(&mut copy, &patch);
        assert_eq!(copy, values_changed);

        let mut reordered = values_changed.clone();
        reordered.scenes.get_mut("tab").unwrap().nodes.reverse();
        reordered.scenes.insert("other".into(), Scene::default());
        let patch = make_patch(&values_changed, &reordered);
        assert!(matches!(patch.scenes["tab"], ScenePatch::Replace { .. }));
        apply_patch(&mut copy, &patch);
        assert_eq!(copy, reordered);

        let mut removed = reordered.clone();
        removed.scenes.remove("other");
        apply_patch(&mut copy, &make_patch(&reordered, &removed));
        assert_eq!(copy, removed);
    }
}
