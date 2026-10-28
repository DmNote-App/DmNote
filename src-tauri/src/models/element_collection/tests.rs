use super::*;
use crate::models::{GraphStatType, GraphType, StatType, POSITION_COLLECTION_FIELDS};

const ELEMENT_KIND_FIXTURE: &str = include_str!("../../../../tests/fixtures/element-kinds.json");

#[derive(Debug, PartialEq)]
struct CollectionMeta {
    kind: EditorElementTypeV1,
    field: EditorField,
    store_key: &'static str,
    changed_event: &'static str,
}

#[derive(Default)]
struct RecordMeta(Vec<CollectionMeta>);

impl CollectionVisitor for RecordMeta {
    type Error = Infallible;

    fn visit<C: ElementCollection>(&mut self) -> Result<(), Infallible> {
        self.0.push(CollectionMeta {
            kind: C::KIND,
            field: C::FIELD,
            store_key: C::STORE_KEY,
            changed_event: C::CHANGED_EVENT,
        });
        Ok(())
    }
}

fn visited_meta() -> Vec<CollectionMeta> {
    let mut record = RecordMeta::default();
    let Ok(()) = visit_collections(&mut record);
    record.0
}

fn serde_name<T: Serialize>(value: T) -> String {
    serde_json::to_value(value)
        .unwrap()
        .as_str()
        .expect("unit variant serializes as string")
        .to_string()
}

#[test]
fn visit_order_matches_kind_declaration_and_shared_fixture() {
    let meta = visited_meta();
    let kinds = meta.iter().map(|meta| meta.kind).collect::<Vec<_>>();
    assert_eq!(kinds, EditorElementTypeV1::ALL);

    let fixture: Vec<serde_json::Value> = serde_json::from_str(ELEMENT_KIND_FIXTURE).unwrap();
    assert_eq!(fixture.len(), meta.len());
    for (entry, meta) in fixture.iter().zip(&meta) {
        assert_eq!(entry["type"], serde_name(meta.kind));
        assert_eq!(entry["positionField"], meta.store_key);
    }
}

#[test]
fn collection_metadata_matches_document_serde_names() {
    let document =
        serde_json::to_value(EditorDocumentV1::from_store(&AppStoreData::default())).unwrap();
    let store = serde_json::to_value(AppStoreData::default()).unwrap();
    let mut patch = EditorPatchV1::default();
    ElementCollections::default().into_optional(&mut patch);
    let patch = serde_json::to_value(patch).unwrap();

    let mut events = std::collections::HashSet::new();
    for meta in visited_meta() {
        assert_eq!(meta.field, meta.kind.editor_field());
        assert_eq!(
            EditorElementTypeV1::from_editor_field(meta.field),
            Some(meta.kind)
        );
        assert_eq!(serde_name(meta.field), meta.store_key);
        assert_eq!(meta.field.target(), EditorFieldTarget::Elements(meta.kind));
        assert!(document.get(meta.store_key).is_some(), "{}", meta.store_key);
        assert!(store.get(meta.store_key).is_some(), "{}", meta.store_key);
        assert!(patch.get(meta.store_key).is_some(), "{}", meta.store_key);
        assert!(meta.changed_event.ends_with(":changed"));
        assert!(events.insert(meta.changed_event));
    }
    // 키 컬렉션 이벤트는 역사적 이름 유지
    assert_eq!(
        EditorElementTypeV1::Key.changed_event(),
        "positions:changed"
    );
}

#[test]
fn editor_field_lists_follow_declaration_order() {
    assert_eq!(
        EditorField::ALL,
        [
            EditorField::Keys,
            EditorField::KeyPositions,
            EditorField::StatPositions,
            EditorField::GraphPositions,
            EditorField::KnobPositions,
            EditorField::SpritePositions,
            EditorField::LayerGroups,
        ]
    );
    assert_eq!(
        EditorField::ELEMENT_FIELDS.to_vec(),
        EditorField::ALL
            .into_iter()
            .filter(|field| field.element_kind().is_some())
            .collect::<Vec<_>>()
    );
}

#[test]
fn kind_set_operations() {
    let set = ElementKindSet::EMPTY
        .with(EditorElementTypeV1::Stat)
        .with(EditorElementTypeV1::Sprite);
    assert!(set.contains(EditorElementTypeV1::Stat));
    assert!(!set.contains(EditorElementTypeV1::Key));
    assert_eq!(
        set.iter().collect::<Vec<_>>(),
        [EditorElementTypeV1::Stat, EditorElementTypeV1::Sprite]
    );
    assert_eq!(set.complement().complement(), set);
    assert_eq!(
        set.complement().iter().collect::<Vec<_>>(),
        [
            EditorElementTypeV1::Key,
            EditorElementTypeV1::Graph,
            EditorElementTypeV1::Knob
        ]
    );
    assert_eq!(ElementKindSet::ALL.complement(), ElementKindSet::EMPTY);
    assert_eq!(
        ElementKindSet::ALL.without(EditorElementTypeV1::Key),
        ElementKindSet::matching(|kind| kind != EditorElementTypeV1::Key)
    );
}

fn sample_collections() -> ElementCollections {
    let position = KeyPosition::default;
    ElementCollections {
        key_positions: HashMap::from([("4key".to_string(), vec![position()])]),
        stat_positions: HashMap::from([(
            "4key".to_string(),
            vec![StatPosition {
                stat_type: StatType::Kps,
                position: position(),
            }],
        )]),
        graph_positions: HashMap::from([(
            "4key".to_string(),
            vec![GraphPosition {
                stat_type: GraphStatType::Kps,
                graph_type: GraphType::Line,
                graph_speed: 1,
                graph_color: "#fff".to_string(),
                show_avg_line: true,
                position: position(),
            }],
        )]),
        knob_positions: HashMap::from([(
            "4key".to_string(),
            vec![KnobPosition {
                axis_id: String::new(),
                sensitivity: 1.0,
                reverse: false,
                position: position(),
            }],
        )]),
        sprite_positions: HashMap::from([(
            "4key".to_string(),
            vec![ReactiveSpritePosition::default()],
        )]),
    }
}

#[test]
fn item_capabilities_match_kind_capabilities() {
    let collections = sample_collections();
    let mut seen = Vec::new();
    for_each_element(&collections, |kind, _, _, item| {
        seen.push(kind);
        assert_eq!(item.key_position().is_some(), kind.has_key_position());
    });
    assert_eq!(seen, EditorElementTypeV1::ALL);
    for kind in EditorElementTypeV1::ALL {
        // 사운드·카운터는 KeyPosition 필드에 산다
        assert!(!kind.has_sound() || kind.has_key_position());
        assert!(!kind.has_counter() || kind.has_key_position());
    }
}

#[test]
fn position_collection_fields_are_key_position_backed_store_keys() {
    let expected = EditorElementTypeV1::ALL
        .into_iter()
        .filter(|kind| kind.has_key_position())
        .map(EditorElementTypeV1::store_key)
        .collect::<Vec<_>>();
    assert_eq!(POSITION_COLLECTION_FIELDS.to_vec(), expected);
}

#[test]
fn mode_helpers_cover_every_collection() {
    let mut collections = sample_collections();
    assert_eq!(element_count(&collections), EditorElementTypeV1::ALL.len());
    assert_eq!(
        element_collection_modes(&collections).len(),
        EditorElementTypeV1::ALL.len()
    );

    assert_eq!(
        ElementCollections::mode_slice(&collections, "4key"),
        collections
    );
    assert_eq!(
        ElementCollections::mode_slice(&collections, "5key"),
        ElementCollections::default()
    );

    insert_empty_element_mode(&mut collections, "5key", ElementKindSet::ALL);
    assert_eq!(
        element_collection_modes(&collections).len(),
        EditorElementTypeV1::ALL.len() * 2
    );
    remove_element_mode(&mut collections, "4key");
    assert_eq!(element_count(&collections), 0);
    clear_element_collections(&mut collections, ElementKindSet::ALL);
    assert_eq!(collections, ElementCollections::default());
}

#[test]
fn image_refs_visit_key_images_then_sprite_base_and_poses() {
    let mut collections = sample_collections();
    for_each_key_position_mut(&mut collections, |_, position| {
        position.active_image = Some("active".to_string());
        position.inactive_image = Some("inactive".to_string());
    });
    let sprite = &mut collections.sprite_positions.get_mut("4key").unwrap()[0];
    sprite.base_image = Some("base".to_string());
    sprite.poses.push(crate::models::SpritePose {
        image_override: Some("pose".to_string()),
        ..Default::default()
    });

    let mut refs = Vec::new();
    for_each_element(&collections, |kind, _, _, item| {
        item.for_each_image_ref(&mut |image_ref| refs.push((kind, image_ref.clone())));
    });
    let expected = EditorElementTypeV1::ALL
        .into_iter()
        .filter(|kind| kind.has_key_position())
        .flat_map(|kind| {
            [
                (kind, Some("active".to_string())),
                (kind, Some("inactive".to_string())),
            ]
        })
        .chain([
            (EditorElementTypeV1::Sprite, Some("base".to_string())),
            (EditorElementTypeV1::Sprite, Some("pose".to_string())),
        ])
        .collect::<Vec<_>>();
    assert_eq!(refs, expected);
}
