use serde_json::{json, Map, Value};

use crate::document::{Document, Element, Frame, Group, Node, Scene};
use crate::load::IdSource;
use crate::schema::{KindRegistry, KindSchema};

pub struct Sequence(pub u32);

impl IdSource for Sequence {
    fn next_id(&mut self) -> String {
        self.0 += 1;
        format!("new-{}", self.0)
    }
}

// 시험용 종류 두 개 - 값 종류와 참조, 조건, 옮기기를 고루 쓴다
pub fn registry() -> KindRegistry {
    let pad: KindSchema = serde_json::from_value(json!({
        "kind": "pad",
        "version": 1,
        "fields": [],
        "inputs": ["keySlot"],
        "defaultSize": { "width": 60, "height": 60 },
        "fallbackSize": { "width": 60, "height": 60 }
    }))
    .unwrap();
    let dial: KindSchema = serde_json::from_value(json!({
        "kind": "dial",
        "version": 2,
        "fields": [
            { "name": "sensitivity", "value": { "type": "number", "min": 0.1, "max": 10 }, "default": 1 },
            { "name": "mode", "value": { "type": "enum", "options": ["spin", "slide"] }, "default": "spin" },
            { "name": "slideLength", "value": { "type": "number", "min": 1, "max": 500, "integer": true },
              "default": 100, "when": { "field": "mode", "equals": "slide" } },
            { "name": "color", "value": { "type": "color" }, "default": "#FFFFFF" },
            { "name": "target", "value": { "type": "elementRef", "kinds": ["pad"] }, "default": null, "nullable": true },
            { "name": "poses", "value": { "type": "list", "maxItems": 4, "item": { "type": "object", "fields": [
                { "name": "poseId", "value": { "type": "id" }, "default": "" },
                { "name": "triggers", "value": { "type": "list", "item": { "type": "elementRef" }, "unique": true }, "default": [] }
            ] } }, "default": [] }
        ],
        "inputs": ["axis"],
        "defaultSize": { "width": 60, "height": 60 },
        "fallbackSize": { "width": 80, "height": 80 },
        "migrations": [
            { "from": 1, "steps": [
                { "op": "rename", "from": "speed", "to": "sensitivity" },
                { "op": "mapValue", "field": "sensitivity", "from": 1.40625, "to": 1.0 },
                { "op": "setDefault", "field": "mode", "value": "spin" }
            ] }
        ]
    }))
    .unwrap();
    let mut registry = KindRegistry::new();
    registry.register(pad).unwrap();
    registry.register(dial).unwrap();
    registry
}

pub fn element(id: &str, kind: &str, values: Value) -> Element {
    Element {
        id: id.to_string(),
        kind: kind.to_string(),
        frame: Frame {
            x: 0.0,
            y: 0.0,
            width: 60.0,
            height: 60.0,
            rotation: 0.0,
        },
        name: None,
        hidden: false,
        class_name: None,
        bundles: Default::default(),
        values: values.as_object().cloned().unwrap_or_default(),
        input: None,
        extra: Map::new(),
    }
}

pub fn dial_values() -> Value {
    json!({
        "sensitivity": 1,
        "mode": "spin",
        "color": "#FFFFFF",
        "target": null,
        "poses": []
    })
}

pub fn group(id: &str, children: Vec<Node>) -> Node {
    Node::Group(Group {
        id: id.to_string(),
        name: id.to_string(),
        hidden: false,
        children,
        extra: Map::new(),
    })
}

pub fn document(nodes: Vec<Node>) -> Document {
    let mut document = Document::default();
    document.scenes.insert(
        "tab".to_string(),
        Scene {
            nodes,
            extra: Map::new(),
        },
    );
    document.kind_versions.insert("pad".into(), 1);
    document.kind_versions.insert("dial".into(), 2);
    document
}

pub fn ids(document: &Document) -> Vec<String> {
    let mut out = Vec::new();
    crate::document::walk(&document.scenes["tab"].nodes, &mut |node, path| {
        out.push(format!(
            "{}@{}",
            node.id(),
            path.iter()
                .map(usize::to_string)
                .collect::<Vec<_>>()
                .join(".")
        ));
    });
    out
}
