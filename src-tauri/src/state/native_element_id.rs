use std::{
    collections::{HashMap, HashSet},
    convert::Infallible,
};

use uuid::Uuid;

use crate::{
    errors::EditorCommitError,
    models::{
        visit_collections, visit_collections_in, AppStoreData, CollectionVisitor, EditorDocumentV1,
        EditorElementTypeV1, EditorField, EditorPatchV1, ElementCollection, ElementItem,
        ElementKindSet, KeyMappings, KeyPosition, KeySlot, ReactiveSpritePosition, SpritePose,
        EDITOR_COMMIT_SCHEMA_VERSION_V2, EDITOR_SCHEMA_VERSION,
    },
};

mod v1_adapter;

use v1_adapter::collect_collection_ids_outside_target;
pub(crate) use v1_adapter::{prepare_commit_patch_element_ids, validate_document_element_ids};

pub(crate) const INVALID_ELEMENT_ID: &str = "INVALID_ELEMENT_ID";
pub(crate) const MISSING_ELEMENT_ID: &str = "MISSING_ELEMENT_ID";
pub(crate) const DUPLICATE_ELEMENT_ID: &str = "DUPLICATE_ELEMENT_ID";

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub(crate) struct BackfillOutcome {
    pub(crate) changed: bool,
    pub(crate) repaired: bool,
}

// id 승계 비교에 값 동등성과 복제가 필요한 요소
trait NativeElement: ElementItem + Clone + PartialEq {}

impl<T: ElementItem + Clone + PartialEq> NativeElement for T {}

/// 파서가 하이픈형·무하이픈형·`{...}`·`urn:uuid:`·대소문자 혼용을 모두 받는다.
/// 파싱 결과를 버리고 raw를 그대로 두는 것이 계약이다 - store.rs의
/// `alternate_uuid_spellings_remain_raw_distinct_through_load_bootstrap_and_event`가
/// 로드·bootstrap·이벤트 전 구간에서 raw 보존을 고정한다.
///
/// **element id에 `Uuid::parse_str(..).to_string()` 같은 정규화를 적용하지 말 것.**
/// 유일성 판정이 문자열 기준이라, 어디선가 정규화가 끼면 같은 UUID의 다른 표기를
/// 쓰던 두 요소가 하나로 붕괴한다
pub(crate) fn is_valid_element_id(id: &str) -> bool {
    Uuid::parse_str(id).is_ok_and(|id| !id.is_nil())
}

pub(crate) fn new_unique_id(reserved: &mut HashSet<String>) -> String {
    loop {
        let id = Uuid::new_v4().to_string();
        if reserved.insert(id.clone()) {
            return id;
        }
    }
}

fn sorted_modes<T>(collection: &HashMap<String, Vec<T>>) -> Vec<String> {
    let mut modes = collection.keys().cloned().collect::<Vec<_>>();
    modes.sort_unstable();
    modes
}

// mode가 None이면 전체 모드
fn backfill_collection<T: NativeElement>(
    collection: &mut HashMap<String, Vec<T>>,
    mode: Option<&str>,
    seen: &mut HashSet<String>,
    reserved: &mut HashSet<String>,
    outcome: &mut BackfillOutcome,
) {
    for collection_mode in sorted_modes(collection) {
        if mode.is_some_and(|mode| mode != collection_mode) {
            continue;
        }
        let Some(elements) = collection.get_mut(&collection_mode) else {
            continue;
        };
        for element in elements {
            let id = element.id();
            if is_valid_element_id(id) && seen.insert(id.to_string()) {
                continue;
            }

            // valid는 non-empty를 함의하므로 `|| valid`는 죽은 절이었다
            if !id.is_empty() {
                outcome.repaired = true;
            }
            let id = new_unique_id(reserved);
            seen.insert(id.clone());
            *element.id_mut() = id;
            outcome.changed = true;
        }
    }
}

fn backfill_sprite_pose_ids(
    collection: &mut HashMap<String, Vec<ReactiveSpritePosition>>,
    mode: Option<&str>,
    seen: &mut HashSet<String>,
    reserved: &mut HashSet<String>,
    outcome: &mut BackfillOutcome,
) {
    for collection_mode in sorted_modes(collection) {
        if mode.is_some_and(|mode| mode != collection_mode) {
            continue;
        }
        let Some(sprites) = collection.get_mut(&collection_mode) else {
            continue;
        };
        for sprite in sprites {
            for pose in &mut sprite.poses {
                if is_valid_element_id(&pose.pose_id) && seen.insert(pose.pose_id.clone()) {
                    continue;
                }
                if !pose.pose_id.is_empty() {
                    outcome.repaired = true;
                }
                let id = new_unique_id(reserved);
                seen.insert(id.clone());
                pose.pose_id = id;
                outcome.changed = true;
            }
        }
    }
}

struct BackfillCollections<'a> {
    store: &'a mut AppStoreData,
    mode: Option<&'a str>,
    seen: &'a mut HashSet<String>,
    reserved: &'a mut HashSet<String>,
    outcome: &'a mut BackfillOutcome,
}

impl CollectionVisitor for BackfillCollections<'_> {
    type Error = Infallible;

    fn visit<C: ElementCollection>(&mut self) -> Result<(), Infallible> {
        backfill_collection(
            C::positions_mut(self.store),
            self.mode,
            self.seen,
            self.reserved,
            self.outcome,
        );
        Ok(())
    }
}

pub(crate) fn backfill_store_element_ids(store: &mut AppStoreData) -> BackfillOutcome {
    let mut seen = HashSet::new();
    let mut reserved = collect_store_ids(store);
    let mut outcome = BackfillOutcome::default();
    let Ok(()) = visit_collections(&mut BackfillCollections {
        store,
        mode: None,
        seen: &mut seen,
        reserved: &mut reserved,
        outcome: &mut outcome,
    });
    // 자세 id는 모든 요소 id 뒤에 채운다 - 요소와 겹치는 자세 id가 재발급 대상
    backfill_sprite_pose_ids(
        &mut store.sprite_positions,
        None,
        &mut seen,
        &mut reserved,
        &mut outcome,
    );
    outcome
}

fn collect_collection_ids<T: NativeElement>(
    collection: &HashMap<String, Vec<T>>,
    ids: &mut HashSet<String>,
) {
    for elements in collection.values() {
        for element in elements {
            if is_valid_element_id(element.id()) {
                ids.insert(element.id().to_string());
            }
        }
    }
}

fn collect_store_ids(store: &AppStoreData) -> HashSet<String> {
    struct CollectIds<'a> {
        store: &'a AppStoreData,
        ids: HashSet<String>,
    }

    impl CollectionVisitor for CollectIds<'_> {
        type Error = Infallible;

        fn visit<C: ElementCollection>(&mut self) -> Result<(), Infallible> {
            collect_collection_ids(C::positions(self.store), &mut self.ids);
            Ok(())
        }
    }

    let mut collect = CollectIds {
        store,
        ids: HashSet::new(),
    };
    let Ok(()) = visit_collections(&mut collect);
    let mut ids = collect.ids;
    for sprite in store.sprite_positions.values().flatten() {
        for pose in &sprite.poses {
            if is_valid_element_id(&pose.pose_id) {
                ids.insert(pose.pose_id.clone());
            }
        }
    }
    ids
}

// 이전 id → 새 id 대응을 돌려준다. mode가 None이면 전체 모드
fn rekey_collection<T: NativeElement>(
    collection: &mut HashMap<String, Vec<T>>,
    mode: Option<&str>,
    reserved: &mut HashSet<String>,
) -> HashMap<String, String> {
    let mut replacements = HashMap::new();
    for collection_mode in sorted_modes(collection) {
        if mode.is_some_and(|mode| mode != collection_mode) {
            continue;
        }
        let Some(elements) = collection.get_mut(&collection_mode) else {
            continue;
        };
        for element in elements {
            let old_id = element.id().to_string();
            let new_id = new_unique_id(reserved);
            if !old_id.is_empty() {
                replacements.insert(old_id, new_id.clone());
            }
            *element.id_mut() = new_id;
        }
    }
    replacements
}

fn rekey_sprite_pose_ids(
    collection: &mut HashMap<String, Vec<ReactiveSpritePosition>>,
    mode: Option<&str>,
    reserved: &mut HashSet<String>,
) {
    for collection_mode in sorted_modes(collection) {
        if mode.is_some_and(|mode| mode != collection_mode) {
            continue;
        }
        if let Some(sprites) = collection.get_mut(&collection_mode) {
            for sprite in sprites {
                for pose in &mut sprite.poses {
                    pose.pose_id = new_unique_id(reserved);
                }
            }
        }
    }
}

fn remap_sprite_triggers(
    collection: &mut HashMap<String, Vec<ReactiveSpritePosition>>,
    mode: Option<&str>,
    replacements: &HashMap<String, String>,
) {
    for (collection_mode, sprites) in collection {
        if mode.is_some_and(|mode| mode != collection_mode) {
            continue;
        }
        for sprite in sprites {
            for pose in &mut sprite.poses {
                for trigger in &mut pose.triggers {
                    if let Some(replacement) = replacements.get(trigger) {
                        trigger.clone_from(replacement);
                    }
                }
            }
        }
    }
}

struct RekeyCollections<'a> {
    store: &'a mut AppStoreData,
    mode: Option<&'a str>,
    reserved: &'a mut HashSet<String>,
    key_replacements: HashMap<String, String>,
}

impl CollectionVisitor for RekeyCollections<'_> {
    type Error = Infallible;

    fn visit<C: ElementCollection>(&mut self) -> Result<(), Infallible> {
        let replacements = rekey_collection(C::positions_mut(self.store), self.mode, self.reserved);
        // 스프라이트 트리거는 키 id만 참조한다
        if C::KIND == EditorElementTypeV1::Key {
            self.key_replacements = replacements;
        }
        Ok(())
    }
}

fn rekey_element_ids(store: &mut AppStoreData, mode: Option<&str>, kinds: ElementKindSet) {
    let mut reserved = collect_store_ids(store);
    let mut rekey = RekeyCollections {
        store,
        mode,
        reserved: &mut reserved,
        key_replacements: HashMap::new(),
    };
    let Ok(()) = visit_collections_in(kinds, &mut rekey);
    let key_replacements = rekey.key_replacements;
    if kinds.contains(EditorElementTypeV1::Sprite) {
        rekey_sprite_pose_ids(&mut store.sprite_positions, mode, &mut reserved);
    }
    remap_sprite_triggers(&mut store.sprite_positions, mode, &key_replacements);
}

pub(crate) fn rekey_store_element_ids(store: &mut AppStoreData) {
    rekey_element_ids(store, None, ElementKindSet::ALL);
}

pub(crate) fn rekey_mode_element_ids(store: &mut AppStoreData, mode: &str) {
    rekey_mode_element_ids_for_collections(store, mode, ElementKindSet::ALL);
}

pub(crate) fn rekey_mode_element_ids_for_collections(
    store: &mut AppStoreData,
    mode: &str,
    kinds: ElementKindSet,
) {
    rekey_element_ids(store, Some(mode), kinds);
}

// 한 모드의 선택된 컬렉션만 채운다. 대상 밖 요소의 id를 seen에 먼저 담아
// 대상 안의 중복도 복구되고 새 id가 문서 전체에서 유일하도록 유지한다
pub(crate) fn backfill_mode_element_ids_for_collections(
    store: &mut AppStoreData,
    mode: &str,
    kinds: ElementKindSet,
) -> BackfillOutcome {
    struct CollectOutsideTarget<'a> {
        store: &'a AppStoreData,
        mode: &'a str,
        kinds: ElementKindSet,
        seen: HashSet<String>,
    }

    impl CollectionVisitor for CollectOutsideTarget<'_> {
        type Error = Infallible;

        fn visit<C: ElementCollection>(&mut self) -> Result<(), Infallible> {
            collect_collection_ids_outside_target(
                C::positions(self.store),
                self.mode,
                self.kinds.contains(C::KIND),
                &mut self.seen,
            );
            Ok(())
        }
    }

    let mut outside = CollectOutsideTarget {
        store,
        mode,
        kinds,
        seen: HashSet::new(),
    };
    let Ok(()) = visit_collections(&mut outside);
    let mut seen = outside.seen;
    let sprite_targeted = kinds.contains(EditorElementTypeV1::Sprite);
    for (collection_mode, sprites) in &store.sprite_positions {
        if sprite_targeted && collection_mode == mode {
            continue;
        }
        for sprite in sprites {
            for pose in &sprite.poses {
                if is_valid_element_id(&pose.pose_id) {
                    seen.insert(pose.pose_id.clone());
                }
            }
        }
    }
    let mut reserved = collect_store_ids(store);
    let mut outcome = BackfillOutcome::default();
    let Ok(()) = visit_collections_in(
        kinds,
        &mut BackfillCollections {
            store,
            mode: Some(mode),
            seen: &mut seen,
            reserved: &mut reserved,
            outcome: &mut outcome,
        },
    );
    if sprite_targeted {
        backfill_sprite_pose_ids(
            &mut store.sprite_positions,
            Some(mode),
            &mut seen,
            &mut reserved,
            &mut outcome,
        );
    }
    outcome
}

#[cfg(test)]
mod tests;
