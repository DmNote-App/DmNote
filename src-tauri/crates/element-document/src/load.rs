//! 문서 읽기 - 너그럽게 고치고 최신 버전으로 맞춘다.
//! 모르는 종류와 앱보다 새 버전은 그대로 보존한다.

use std::collections::{BTreeMap, BTreeSet, HashSet};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::bundles::BundleCatalog;
use crate::document::{walk_mut, Document, Element, Frame, Node};
use crate::schema::{KindRegistry, KindSchema, MigrationStep};
use crate::value::{normalize_fields, ReferenceScope};

/// 새 id 발급 - 백엔드는 UUID, 테스트는 순번
pub trait IdSource {
    fn next_id(&mut self) -> String;
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct LoadReport {
    // 값을 고친 요소 (장면, id)
    pub repaired: Vec<(String, String)>,
    // 겹친 id를 새로 발급한 노드 (장면, 옛 id, 새 id)
    pub reissued: Vec<(String, String, String)>,
    // 최신 버전으로 옮긴 종류 (종류, 옛 버전, 새 버전)
    pub migrated: Vec<(String, u32, u32)>,
    // 코드 훅을 기다리는 종류 (종류, 훅 이름) - 편집 창이 훅을 돌릴 때까지 옛 버전 보존
    pub pending_hooks: Vec<(String, String)>,
    // 앱보다 새 버전이라 잠근 종류
    pub locked_kinds: Vec<String>,
    pub unknown_kinds: Vec<String>,
}

impl LoadReport {
    pub fn changed(&self) -> bool {
        !self.repaired.is_empty() || !self.reissued.is_empty() || !self.migrated.is_empty()
    }
}

pub struct Loader<'a> {
    pub kinds: &'a KindRegistry,
    pub bundles: &'a dyn BundleCatalog,
    // 다른 곳(옛 저장 모양)에서 검증·정리하는 종류 - 값을 건드리지 않고 id도 다시 발급하지 않는다
    pub managed_elsewhere: &'a dyn Fn(&str) -> bool,
}

impl Loader<'_> {
    pub fn load(&self, document: &mut Document, ids: &mut dyn IdSource) -> LoadReport {
        let mut report = LoadReport::default();
        self.reissue_duplicate_ids(document, ids, &mut report);
        self.migrate(document, &mut report);
        self.normalize(document, &mut report);
        report
    }

    // 문서 전체에서 겹치는 id는 뒤에 나온 쪽을 새로 발급한다
    fn reissue_duplicate_ids(
        &self,
        document: &mut Document,
        ids: &mut dyn IdSource,
        report: &mut LoadReport,
    ) {
        let mut seen = HashSet::new();
        for scene in document.scenes.values() {
            for element in scene.elements() {
                if (self.managed_elsewhere)(&element.kind) {
                    seen.insert(element.id.clone());
                }
            }
        }
        let managed = self.managed_elsewhere;
        for (scene_id, scene) in &mut document.scenes {
            walk_mut(&mut scene.nodes, &mut |node| {
                let id = match node {
                    Node::Group(group) => &mut group.id,
                    Node::Element(element) => {
                        if managed(&element.kind) {
                            return;
                        }
                        &mut element.id
                    }
                };
                if id.is_empty() || !seen.insert(id.clone()) {
                    let fresh = loop {
                        let candidate = ids.next_id();
                        if seen.insert(candidate.clone()) {
                            break candidate;
                        }
                    };
                    report
                        .reissued
                        .push((scene_id.clone(), id.clone(), fresh.clone()));
                    *id = fresh;
                }
            });
        }
        // 다른 장면의 요소와 겹쳐 새로 받은 id - 그 장면 안 참조도 새 id로 옮긴다.
        // 같은 장면에 옛 id가 남아 있으면 참조는 그대로 남은 쪽을 가리킨다
        for (scene_id, scene) in &mut document.scenes {
            let remaining = scene.kind_index();
            let mapping: BTreeMap<String, String> = report
                .reissued
                .iter()
                .filter(|(owner, old, _)| {
                    owner == scene_id && !old.is_empty() && remaining.kind_of(old).is_none()
                })
                .map(|(_, old, fresh)| (old.clone(), fresh.clone()))
                .collect();
            if !mapping.is_empty() {
                crate::ops::remap_references(self.kinds, &mut scene.nodes, &mapping);
            }
        }
    }

    fn migrate(&self, document: &mut Document, report: &mut LoadReport) {
        let present: BTreeSet<String> = document
            .scenes
            .values()
            .flat_map(|scene| {
                scene
                    .elements()
                    .into_iter()
                    .map(|element| element.kind.clone())
            })
            .collect();
        for kind in &present {
            let Some(schema) = self.kinds.get(kind) else {
                report.unknown_kinds.push(kind.clone());
                continue;
            };
            let stored = document
                .kind_versions
                .get(kind)
                .copied()
                .unwrap_or(schema.version);
            if stored > schema.version {
                report.locked_kinds.push(kind.clone());
                continue;
            }
            let mut version = stored;
            while version < schema.version {
                let migration = &schema.migrations[(version - 1) as usize];
                if let Some(MigrationStep::Hook { name }) = migration
                    .steps
                    .iter()
                    .find(|step| matches!(step, MigrationStep::Hook { .. }))
                {
                    report.pending_hooks.push((kind.clone(), name.clone()));
                    break;
                }
                for scene in document.scenes.values_mut() {
                    walk_mut(&mut scene.nodes, &mut |node| {
                        if let Node::Element(element) = node {
                            if &element.kind == kind {
                                apply_steps(&migration.steps, &mut element.values);
                            }
                        }
                    });
                }
                version += 1;
            }
            if version != stored {
                report.migrated.push((kind.clone(), stored, version));
            }
            document.kind_versions.insert(kind.clone(), version);
        }
        // 문서에 없는 종류는 최신 버전으로 적어 둔다
        for schema in self.kinds.kinds() {
            document
                .kind_versions
                .entry(schema.kind.clone())
                .or_insert(schema.version);
        }
    }

    fn normalize(&self, document: &mut Document, report: &mut LoadReport) {
        let versions = document.kind_versions.clone();
        for (scene_id, scene) in &mut document.scenes {
            let scope = scene.kind_index();
            let mut repaired: Vec<String> = Vec::new();
            walk_mut(&mut scene.nodes, &mut |node| {
                let Node::Element(element) = node else {
                    return;
                };
                if (self.managed_elsewhere)(&element.kind) {
                    return;
                }
                let schema = self.kinds.get(&element.kind);
                // 잠근 종류와 훅을 기다리는 종류는 값을 건드리지 않는다
                let current =
                    schema.filter(|schema| versions.get(&schema.kind) == Some(&schema.version));
                if self.normalize_element(element, schema, current, &scope) {
                    repaired.push(element.id.clone());
                }
            });
            report
                .repaired
                .extend(repaired.into_iter().map(|id| (scene_id.clone(), id)));
        }
    }

    fn normalize_element(
        &self,
        element: &mut Element,
        schema: Option<&KindSchema>,
        current: Option<&KindSchema>,
        scope: &crate::document::SceneKinds,
    ) -> bool {
        let mut changed = normalize_frame(&mut element.frame, schema);
        let Some(schema) = current else {
            return changed;
        };
        let (values, repaired) = normalize_fields(&schema.fields, &element.values, scope);
        if !repaired.is_empty() || values != element.values {
            element.values = values;
            changed = true;
        }
        let mut bundles = BTreeMap::new();
        for name in &schema.bundles {
            if !self.bundles.knows(name) {
                continue;
            }
            let value = match element.bundles.get(name) {
                Some(value) => self
                    .bundles
                    .normalize(name, value)
                    .unwrap_or_else(|| self.bundles.default_value(name)),
                None => self.bundles.default_value(name),
            };
            bundles.insert(name.clone(), value);
        }
        // 정의에 없는 묶음은 보존한다 (다른 버전 앱이 붙인 묶음)
        for (name, value) in &element.bundles {
            if !bundles.contains_key(name) {
                bundles.insert(name.clone(), value.clone());
            }
        }
        if bundles != element.bundles {
            element.bundles = bundles;
            changed = true;
        }
        if let Some(input) = &element.input {
            if !schema.accepts_input(input.type_name()) || !input.is_valid() {
                element.input = None;
                changed = true;
            }
        }
        changed
    }
}

fn normalize_frame(frame: &mut Frame, schema: Option<&KindSchema>) -> bool {
    let before = *frame;
    let fallback = schema.map(|schema| schema.fallback_size);
    for value in [&mut frame.x, &mut frame.y] {
        if !value.is_finite() {
            *value = 0.0;
        }
    }
    if !frame.width.is_finite() || frame.width <= 0.0 {
        frame.width = fallback.map_or(1.0, |size| size.width);
    }
    if !frame.height.is_finite() || frame.height <= 0.0 {
        frame.height = fallback.map_or(1.0, |size| size.height);
    }
    if !frame.rotation.is_finite() {
        frame.rotation = 0.0;
    }
    frame.rotation = frame
        .rotation
        .clamp(crate::ops::ROTATION_MIN, crate::ops::ROTATION_MAX);
    *frame != before
}

pub(crate) fn apply_steps(steps: &[MigrationStep], values: &mut Map<String, Value>) {
    for step in steps {
        match step {
            MigrationStep::Rename { from, to } => {
                if let Some(value) = values.remove(from) {
                    values.insert(to.clone(), value);
                }
            }
            MigrationStep::MapValue { field, from, to } => {
                if values.get(field) == Some(from) {
                    values.insert(field.clone(), to.clone());
                }
            }
            MigrationStep::SetDefault { field, value } => {
                values.entry(field.clone()).or_insert_with(|| value.clone());
            }
            MigrationStep::Remove { field } => {
                values.remove(field);
            }
            MigrationStep::Hook { .. } => {}
        }
    }
}

/// 편집 창이 돌린 코드 훅 결과 적용 - 백엔드는 결과가 새 규칙표에 맞는지만 본다.
/// `elements`는 (장면, id, 옮긴 고유 값). 편집 창이 저장 버전부터 최신까지의 선언 단계와
/// 훅을 모두 돌린 결과여야 한다 (여기서는 단계를 다시 적용하지 않는다)
pub fn apply_hook_result(
    kinds: &KindRegistry,
    document: &mut Document,
    kind: &str,
    elements: &[(String, String, Map<String, Value>)],
) -> Result<u32, Vec<crate::value::Violation>> {
    use crate::value::{validate_fields, Violation, ViolationCode};
    let Some(schema) = kinds.get(kind) else {
        return Err(vec![Violation::new(ViolationCode::UnknownKind, "kind")]);
    };
    let stored = document
        .kind_versions
        .get(kind)
        .copied()
        .unwrap_or(schema.version);
    if stored >= schema.version {
        return Err(vec![Violation::new(
            ViolationCode::KindVersionLocked,
            "kind",
        )]);
    }
    let mut next = document.clone();
    let mut violations = Vec::new();
    for scene in next.scenes.values_mut() {
        let scope = scene.kind_index();
        walk_mut(&mut scene.nodes, &mut |node| {
            let Node::Element(element) = node else {
                return;
            };
            if element.kind != kind {
                return;
            }
            let Some((_, _, values)) = elements.iter().find(|(_, id, _)| id == &element.id) else {
                violations.push(Violation::new(
                    ViolationCode::ElementNotFound,
                    element.id.clone(),
                ));
                return;
            };
            let mut out = Vec::new();
            validate_fields(&schema.fields, values, None, &element.id, &scope, &mut out);
            violations.extend(out);
            element.values = values.clone();
        });
    }
    if !violations.is_empty() {
        return Err(violations);
    }
    next.kind_versions.insert(kind.to_string(), schema.version);
    *document = next;
    Ok(schema.version)
}

#[cfg(test)]
mod tests;
