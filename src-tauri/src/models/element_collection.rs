//! 캔버스 요소 컬렉션 단일 목록
//!
//! 컬렉션마다 반복되던 코드는 `visit_collections`가 아래 `ElementCollection`
//! 구현을 차례로 방문하는 형태로 쓴다. 새 컬렉션은 이 파일의 종류별 메타데이터와
//! `visit_collections` 한 줄, 컬렉션을 가진 구조체의 host 접근자만 추가하면 된다.
//! 일부 종류만 가진 기능(카운터·사운드·KeyPosition 공통 스타일)은 생략 대신
//! `EditorElementTypeV1`의 capability로 드러낸다

use std::{collections::HashMap, convert::Infallible, fmt::Debug};

use serde::{de::DeserializeOwned, Serialize};

use super::{
    rewrite_coupled_sprite_image_reference, AppStoreData, EditorBoundsV1, EditorDocumentV1,
    EditorElementTypeV1, EditorField, EditorPatchV1, GraphPosition, GraphPositions, KeyPosition,
    KeyPositions, KnobPosition, KnobPositions, ReactiveSpritePosition, SpritePositions,
    StatPosition, StatPositions,
};

pub(crate) type ElementPositions<T> = HashMap<String, Vec<T>>;

const ELEMENT_KIND_COUNT: usize = 5;

impl EditorElementTypeV1 {
    // 선언 순서 - visit_collections 방문 순서와 같다
    pub(crate) const ALL: [Self; ELEMENT_KIND_COUNT] =
        [Self::Key, Self::Stat, Self::Graph, Self::Knob, Self::Sprite];

    pub(crate) const fn editor_field(self) -> EditorField {
        match self {
            Self::Key => EditorField::KeyPositions,
            Self::Stat => EditorField::StatPositions,
            Self::Graph => EditorField::GraphPositions,
            Self::Knob => EditorField::KnobPositions,
            Self::Sprite => EditorField::SpritePositions,
        }
    }

    // store·편집 문서·프리셋 JSON의 컬렉션 필드명
    pub(crate) const fn store_key(self) -> &'static str {
        match self {
            Self::Key => "keyPositions",
            Self::Stat => "statPositions",
            Self::Graph => "graphPositions",
            Self::Knob => "knobPositions",
            Self::Sprite => "spritePositions",
        }
    }

    // 레거시 컬렉션 변경 이벤트 - 키만 역사적 이름 positions:changed
    pub(crate) const fn changed_event(self) -> &'static str {
        match self {
            Self::Key => "positions:changed",
            Self::Stat => "statPositions:changed",
            Self::Graph => "graphPositions:changed",
            Self::Knob => "knobPositions:changed",
            Self::Sprite => "spritePositions:changed",
        }
    }

    // KeyPosition 공통 스키마(이미지·폰트·노트·그라데이션·그림자) - 스프라이트는 자체 스키마
    pub(crate) const fn has_key_position(self) -> bool {
        match self {
            Self::Key | Self::Stat | Self::Graph | Self::Knob => true,
            Self::Sprite => false,
        }
    }

    // 요소별 키음(soundPath)
    pub(crate) const fn has_sound(self) -> bool {
        match self {
            Self::Key | Self::Stat | Self::Graph | Self::Knob => true,
            Self::Sprite => false,
        }
    }

    // 입력 카운터 - 노브는 KeyPosition의 counter 필드를 갖지만 카운터를 쓰지 않는다
    pub(crate) const fn has_counter(self) -> bool {
        match self {
            Self::Key | Self::Stat | Self::Graph => true,
            Self::Knob | Self::Sprite => false,
        }
    }

    pub(crate) const fn from_editor_field(field: EditorField) -> Option<Self> {
        match field {
            EditorField::KeyPositions => Some(Self::Key),
            EditorField::StatPositions => Some(Self::Stat),
            EditorField::GraphPositions => Some(Self::Graph),
            EditorField::KnobPositions => Some(Self::Knob),
            EditorField::SpritePositions => Some(Self::Sprite),
            EditorField::Keys | EditorField::LayerGroups => None,
        }
    }
}

impl EditorField {
    // 요소 컬렉션 필드 - 종류 선언 순서
    pub(crate) const ELEMENT_FIELDS: [Self; ELEMENT_KIND_COUNT] = {
        let mut fields = [Self::Keys; ELEMENT_KIND_COUNT];
        let mut index = 0;
        while index < ELEMENT_KIND_COUNT {
            fields[index] = EditorElementTypeV1::ALL[index].editor_field();
            index += 1;
        }
        fields
    };

    // 편집 문서 전체 필드 - keys, 요소 컬렉션, layerGroups 순 (선언 순서)
    pub(crate) const ALL: [Self; ELEMENT_KIND_COUNT + 2] = {
        let mut fields = [Self::Keys; ELEMENT_KIND_COUNT + 2];
        let mut index = 0;
        while index < ELEMENT_KIND_COUNT {
            fields[index + 1] = Self::ELEMENT_FIELDS[index];
            index += 1;
        }
        fields[ELEMENT_KIND_COUNT + 1] = Self::LayerGroups;
        fields
    };

    pub(crate) const fn element_kind(self) -> Option<EditorElementTypeV1> {
        EditorElementTypeV1::from_editor_field(self)
    }
}

/// 요소 종류 집합 - 컬렉션별 bool 인자 대신 쓴다
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub(crate) struct ElementKindSet(u8);

impl ElementKindSet {
    pub(crate) const EMPTY: Self = Self(0);
    pub(crate) const ALL: Self = Self((1 << ELEMENT_KIND_COUNT) - 1);

    const fn bit(kind: EditorElementTypeV1) -> u8 {
        1 << kind as u8
    }

    pub(crate) const fn with(self, kind: EditorElementTypeV1) -> Self {
        Self(self.0 | Self::bit(kind))
    }

    pub(crate) const fn without(self, kind: EditorElementTypeV1) -> Self {
        Self(self.0 & !Self::bit(kind))
    }

    pub(crate) fn insert(&mut self, kind: EditorElementTypeV1) {
        *self = self.with(kind);
    }

    pub(crate) const fn contains(self, kind: EditorElementTypeV1) -> bool {
        self.0 & Self::bit(kind) != 0
    }

    pub(crate) const fn complement(self) -> Self {
        Self(!self.0 & Self::ALL.0)
    }

    pub(crate) fn matching(predicate: impl Fn(EditorElementTypeV1) -> bool) -> Self {
        EditorElementTypeV1::ALL
            .into_iter()
            .filter(|kind| predicate(*kind))
            .fold(Self::EMPTY, Self::with)
    }

    pub(crate) fn iter(self) -> impl Iterator<Item = EditorElementTypeV1> {
        EditorElementTypeV1::ALL
            .into_iter()
            .filter(move |kind| self.contains(*kind))
    }
}

/// 요소 한 개의 공통 접근 - 종류별 구조체 차이(StatPosition.position 등)를 숨긴다
pub(crate) trait ElementItem {
    fn id(&self) -> &str;
    fn id_mut(&mut self) -> &mut String;
    fn group_id(&self) -> Option<&str>;
    fn group_id_mut(&mut self) -> &mut Option<String>;
    // KeyPosition 공통 스키마 - has_key_position 종류만 Some
    fn key_position(&self) -> Option<&KeyPosition>;
    fn key_position_mut(&mut self) -> Option<&mut KeyPosition>;
    fn bounds(&self) -> EditorBoundsV1;
    // 로컬 자산이 될 수 있는 이미지 참조 - 고아 정리 보호·프리셋 임베드·자산 이동이 공유
    fn for_each_image_ref(&self, visit: &mut dyn FnMut(&Option<String>));
    // 스프라이트는 결합된 원본 크기 source를 함께 갱신한다
    fn for_each_image_ref_mut(&mut self, visit: &mut dyn FnMut(&mut Option<String>));
}

fn key_position_bounds(position: &KeyPosition) -> EditorBoundsV1 {
    EditorBoundsV1 {
        dx: position.dx,
        dy: position.dy,
        width: position.width,
        height: position.height,
    }
}

impl ElementItem for KeyPosition {
    fn id(&self) -> &str {
        &self.id
    }

    fn id_mut(&mut self) -> &mut String {
        &mut self.id
    }

    fn group_id(&self) -> Option<&str> {
        self.group_id.as_deref()
    }

    fn group_id_mut(&mut self) -> &mut Option<String> {
        &mut self.group_id
    }

    fn key_position(&self) -> Option<&KeyPosition> {
        Some(self)
    }

    fn key_position_mut(&mut self) -> Option<&mut KeyPosition> {
        Some(self)
    }

    fn bounds(&self) -> EditorBoundsV1 {
        key_position_bounds(self)
    }

    fn for_each_image_ref(&self, visit: &mut dyn FnMut(&Option<String>)) {
        visit(&self.active_image);
        visit(&self.inactive_image);
    }

    fn for_each_image_ref_mut(&mut self, visit: &mut dyn FnMut(&mut Option<String>)) {
        visit(&mut self.active_image);
        visit(&mut self.inactive_image);
    }
}

// KeyPosition을 flatten으로 품은 종류 - 공통 접근을 내부 position에 위임
trait KeyPositionBacked {
    fn inner(&self) -> &KeyPosition;
    fn inner_mut(&mut self) -> &mut KeyPosition;
}

impl KeyPositionBacked for StatPosition {
    fn inner(&self) -> &KeyPosition {
        &self.position
    }

    fn inner_mut(&mut self) -> &mut KeyPosition {
        &mut self.position
    }
}

impl KeyPositionBacked for GraphPosition {
    fn inner(&self) -> &KeyPosition {
        &self.position
    }

    fn inner_mut(&mut self) -> &mut KeyPosition {
        &mut self.position
    }
}

impl KeyPositionBacked for KnobPosition {
    fn inner(&self) -> &KeyPosition {
        &self.position
    }

    fn inner_mut(&mut self) -> &mut KeyPosition {
        &mut self.position
    }
}

impl<T: KeyPositionBacked> ElementItem for T {
    fn id(&self) -> &str {
        self.inner().id()
    }

    fn id_mut(&mut self) -> &mut String {
        self.inner_mut().id_mut()
    }

    fn group_id(&self) -> Option<&str> {
        self.inner().group_id()
    }

    fn group_id_mut(&mut self) -> &mut Option<String> {
        self.inner_mut().group_id_mut()
    }

    fn key_position(&self) -> Option<&KeyPosition> {
        Some(self.inner())
    }

    fn key_position_mut(&mut self) -> Option<&mut KeyPosition> {
        Some(self.inner_mut())
    }

    fn bounds(&self) -> EditorBoundsV1 {
        self.inner().bounds()
    }

    fn for_each_image_ref(&self, visit: &mut dyn FnMut(&Option<String>)) {
        self.inner().for_each_image_ref(visit);
    }

    fn for_each_image_ref_mut(&mut self, visit: &mut dyn FnMut(&mut Option<String>)) {
        self.inner_mut().for_each_image_ref_mut(visit);
    }
}

impl ElementItem for ReactiveSpritePosition {
    fn id(&self) -> &str {
        &self.id
    }

    fn id_mut(&mut self) -> &mut String {
        &mut self.id
    }

    fn group_id(&self) -> Option<&str> {
        self.group_id.as_deref()
    }

    fn group_id_mut(&mut self) -> &mut Option<String> {
        &mut self.group_id
    }

    fn key_position(&self) -> Option<&KeyPosition> {
        None
    }

    fn key_position_mut(&mut self) -> Option<&mut KeyPosition> {
        None
    }

    fn bounds(&self) -> EditorBoundsV1 {
        EditorBoundsV1 {
            dx: self.dx,
            dy: self.dy,
            width: self.width,
            height: self.height,
        }
    }

    fn for_each_image_ref(&self, visit: &mut dyn FnMut(&Option<String>)) {
        visit(&self.base_image);
        for pose in &self.poses {
            visit(&pose.image_override);
        }
    }

    fn for_each_image_ref_mut(&mut self, visit: &mut dyn FnMut(&mut Option<String>)) {
        rewrite_coupled_sprite_image_reference(self, |image_ref| visit(image_ref));
        for pose in &mut self.poses {
            rewrite_coupled_sprite_image_reference(pose, |image_ref| visit(image_ref));
        }
    }
}

/// 요소 컬렉션 전체를 가진 구조체 (store, 편집 문서, 프리셋 작업 묶음)
pub(crate) trait ElementPositionsHost {
    fn key_collection(&self) -> &KeyPositions;
    fn key_collection_mut(&mut self) -> &mut KeyPositions;
    fn stat_collection(&self) -> &StatPositions;
    fn stat_collection_mut(&mut self) -> &mut StatPositions;
    fn graph_collection(&self) -> &GraphPositions;
    fn graph_collection_mut(&mut self) -> &mut GraphPositions;
    fn knob_collection(&self) -> &KnobPositions;
    fn knob_collection_mut(&mut self) -> &mut KnobPositions;
    fn sprite_collection(&self) -> &SpritePositions;
    fn sprite_collection_mut(&mut self) -> &mut SpritePositions;
}

/// 요소 컬렉션을 선택적으로 가진 구조체 (편집 패치, 프리셋 파일)
pub(crate) trait OptionalElementPositionsHost {
    fn key_collection(&self) -> &Option<KeyPositions>;
    fn key_collection_mut(&mut self) -> &mut Option<KeyPositions>;
    fn stat_collection(&self) -> &Option<StatPositions>;
    fn stat_collection_mut(&mut self) -> &mut Option<StatPositions>;
    fn graph_collection(&self) -> &Option<GraphPositions>;
    fn graph_collection_mut(&mut self) -> &mut Option<GraphPositions>;
    fn knob_collection(&self) -> &Option<KnobPositions>;
    fn knob_collection_mut(&mut self) -> &mut Option<KnobPositions>;
    fn sprite_collection(&self) -> &Option<SpritePositions>;
    fn sprite_collection_mut(&mut self) -> &mut Option<SpritePositions>;
}

/// 요소 컬렉션 한 종류 - 종류 메타데이터와 host 필드를 묶는다
pub(crate) trait ElementCollection: 'static {
    type Item: ElementItem + Clone + PartialEq + Debug + Serialize + DeserializeOwned + 'static;

    const KIND: EditorElementTypeV1;
    const FIELD: EditorField = Self::KIND.editor_field();
    const STORE_KEY: &'static str = Self::KIND.store_key();
    const CHANGED_EVENT: &'static str = Self::KIND.changed_event();

    fn positions<H: ElementPositionsHost + ?Sized>(host: &H) -> &ElementPositions<Self::Item>;
    fn positions_mut<H: ElementPositionsHost + ?Sized>(
        host: &mut H,
    ) -> &mut ElementPositions<Self::Item>;
    fn optional<H: OptionalElementPositionsHost + ?Sized>(
        host: &H,
    ) -> &Option<ElementPositions<Self::Item>>;
    fn optional_mut<H: OptionalElementPositionsHost + ?Sized>(
        host: &mut H,
    ) -> &mut Option<ElementPositions<Self::Item>>;
}

pub(crate) struct KeyCollection;
pub(crate) struct StatCollection;
pub(crate) struct GraphCollection;
pub(crate) struct KnobCollection;
pub(crate) struct SpriteCollection;

impl ElementCollection for KeyCollection {
    type Item = KeyPosition;
    const KIND: EditorElementTypeV1 = EditorElementTypeV1::Key;

    fn positions<H: ElementPositionsHost + ?Sized>(host: &H) -> &KeyPositions {
        host.key_collection()
    }

    fn positions_mut<H: ElementPositionsHost + ?Sized>(host: &mut H) -> &mut KeyPositions {
        host.key_collection_mut()
    }

    fn optional<H: OptionalElementPositionsHost + ?Sized>(host: &H) -> &Option<KeyPositions> {
        host.key_collection()
    }

    fn optional_mut<H: OptionalElementPositionsHost + ?Sized>(
        host: &mut H,
    ) -> &mut Option<KeyPositions> {
        host.key_collection_mut()
    }
}

impl ElementCollection for StatCollection {
    type Item = StatPosition;
    const KIND: EditorElementTypeV1 = EditorElementTypeV1::Stat;

    fn positions<H: ElementPositionsHost + ?Sized>(host: &H) -> &StatPositions {
        host.stat_collection()
    }

    fn positions_mut<H: ElementPositionsHost + ?Sized>(host: &mut H) -> &mut StatPositions {
        host.stat_collection_mut()
    }

    fn optional<H: OptionalElementPositionsHost + ?Sized>(host: &H) -> &Option<StatPositions> {
        host.stat_collection()
    }

    fn optional_mut<H: OptionalElementPositionsHost + ?Sized>(
        host: &mut H,
    ) -> &mut Option<StatPositions> {
        host.stat_collection_mut()
    }
}

impl ElementCollection for GraphCollection {
    type Item = GraphPosition;
    const KIND: EditorElementTypeV1 = EditorElementTypeV1::Graph;

    fn positions<H: ElementPositionsHost + ?Sized>(host: &H) -> &GraphPositions {
        host.graph_collection()
    }

    fn positions_mut<H: ElementPositionsHost + ?Sized>(host: &mut H) -> &mut GraphPositions {
        host.graph_collection_mut()
    }

    fn optional<H: OptionalElementPositionsHost + ?Sized>(host: &H) -> &Option<GraphPositions> {
        host.graph_collection()
    }

    fn optional_mut<H: OptionalElementPositionsHost + ?Sized>(
        host: &mut H,
    ) -> &mut Option<GraphPositions> {
        host.graph_collection_mut()
    }
}

impl ElementCollection for KnobCollection {
    type Item = KnobPosition;
    const KIND: EditorElementTypeV1 = EditorElementTypeV1::Knob;

    fn positions<H: ElementPositionsHost + ?Sized>(host: &H) -> &KnobPositions {
        host.knob_collection()
    }

    fn positions_mut<H: ElementPositionsHost + ?Sized>(host: &mut H) -> &mut KnobPositions {
        host.knob_collection_mut()
    }

    fn optional<H: OptionalElementPositionsHost + ?Sized>(host: &H) -> &Option<KnobPositions> {
        host.knob_collection()
    }

    fn optional_mut<H: OptionalElementPositionsHost + ?Sized>(
        host: &mut H,
    ) -> &mut Option<KnobPositions> {
        host.knob_collection_mut()
    }
}

impl ElementCollection for SpriteCollection {
    type Item = ReactiveSpritePosition;
    const KIND: EditorElementTypeV1 = EditorElementTypeV1::Sprite;

    fn positions<H: ElementPositionsHost + ?Sized>(host: &H) -> &SpritePositions {
        host.sprite_collection()
    }

    fn positions_mut<H: ElementPositionsHost + ?Sized>(host: &mut H) -> &mut SpritePositions {
        host.sprite_collection_mut()
    }

    fn optional<H: OptionalElementPositionsHost + ?Sized>(host: &H) -> &Option<SpritePositions> {
        host.sprite_collection()
    }

    fn optional_mut<H: OptionalElementPositionsHost + ?Sized>(
        host: &mut H,
    ) -> &mut Option<SpritePositions> {
        host.sprite_collection_mut()
    }
}

/// 컬렉션별 작업 - 실패 없는 방문은 `type Error = Infallible`
pub(crate) trait CollectionVisitor {
    type Error;

    fn visit<C: ElementCollection>(&mut self) -> Result<(), Self::Error>;
}

/// 요소 컬렉션 목록이 등장하는 유일한 곳 - 종류 선언 순서로 방문한다
pub(crate) fn visit_collections<V: CollectionVisitor + ?Sized>(
    visitor: &mut V,
) -> Result<(), V::Error> {
    visitor.visit::<KeyCollection>()?;
    visitor.visit::<StatCollection>()?;
    visitor.visit::<GraphCollection>()?;
    visitor.visit::<KnobCollection>()?;
    visitor.visit::<SpriteCollection>()?;
    Ok(())
}

/// 집합에 든 종류만 방문
pub(crate) fn visit_collections_in<V: CollectionVisitor + ?Sized>(
    kinds: ElementKindSet,
    visitor: &mut V,
) -> Result<(), V::Error> {
    struct Filtered<'v, V: ?Sized> {
        kinds: ElementKindSet,
        inner: &'v mut V,
    }

    impl<V: CollectionVisitor + ?Sized> CollectionVisitor for Filtered<'_, V> {
        type Error = V::Error;

        fn visit<C: ElementCollection>(&mut self) -> Result<(), Self::Error> {
            if self.kinds.contains(C::KIND) {
                self.inner.visit::<C>()
            } else {
                Ok(())
            }
        }
    }

    visit_collections(&mut Filtered {
        kinds,
        inner: visitor,
    })
}

/// 런타임 종류 값 하나에 해당하는 컬렉션만 방문
pub(crate) fn visit_collection_of<V: CollectionVisitor + ?Sized>(
    kind: EditorElementTypeV1,
    visitor: &mut V,
) -> Result<(), V::Error> {
    visit_collections_in(ElementKindSet::EMPTY.with(kind), visitor)
}

pub(crate) fn for_each_element<'h, H, F>(host: &'h H, visit: F)
where
    H: ElementPositionsHost + ?Sized,
    F: FnMut(EditorElementTypeV1, &'h str, usize, &'h dyn ElementItem),
{
    struct Visit<'h, H: ?Sized, F> {
        host: &'h H,
        visit: F,
    }

    impl<'h, H, F> CollectionVisitor for Visit<'h, H, F>
    where
        H: ElementPositionsHost + ?Sized,
        F: FnMut(EditorElementTypeV1, &'h str, usize, &'h dyn ElementItem),
    {
        type Error = Infallible;

        fn visit<C: ElementCollection>(&mut self) -> Result<(), Infallible> {
            let host: &'h H = self.host;
            for (mode, items) in C::positions(host) {
                for (index, item) in items.iter().enumerate() {
                    (self.visit)(C::KIND, mode, index, item);
                }
            }
            Ok(())
        }
    }

    let Ok(()) = visit_collections(&mut Visit { host, visit });
}

pub(crate) fn for_each_element_mut<H, F>(host: &mut H, visit: F)
where
    H: ElementPositionsHost + ?Sized,
    F: FnMut(EditorElementTypeV1, &str, &mut dyn ElementItem),
{
    struct Visit<'h, H: ?Sized, F> {
        host: &'h mut H,
        visit: F,
    }

    impl<H, F> CollectionVisitor for Visit<'_, H, F>
    where
        H: ElementPositionsHost + ?Sized,
        F: FnMut(EditorElementTypeV1, &str, &mut dyn ElementItem),
    {
        type Error = Infallible;

        fn visit<C: ElementCollection>(&mut self) -> Result<(), Infallible> {
            for (mode, items) in C::positions_mut(self.host) {
                for item in items {
                    (self.visit)(C::KIND, mode, item);
                }
            }
            Ok(())
        }
    }

    let Ok(()) = visit_collections(&mut Visit { host, visit });
}

/// 한 모드의 요소만 순회
pub(crate) fn for_each_element_in_mode<'h, H, F>(host: &'h H, mode: &str, mut visit: F)
where
    H: ElementPositionsHost + ?Sized,
    F: FnMut(EditorElementTypeV1, &'h dyn ElementItem),
{
    struct Visit<'h, 'm, H: ?Sized, F> {
        host: &'h H,
        mode: &'m str,
        visit: &'m mut F,
    }

    impl<'h, H, F> CollectionVisitor for Visit<'h, '_, H, F>
    where
        H: ElementPositionsHost + ?Sized,
        F: FnMut(EditorElementTypeV1, &'h dyn ElementItem),
    {
        type Error = Infallible;

        fn visit<C: ElementCollection>(&mut self) -> Result<(), Infallible> {
            let host: &'h H = self.host;
            for item in C::positions(host).get(self.mode).into_iter().flatten() {
                (self.visit)(C::KIND, item);
            }
            Ok(())
        }
    }

    let Ok(()) = visit_collections(&mut Visit {
        host,
        mode,
        visit: &mut visit,
    });
}

/// KeyPosition 공통 스키마를 가진 요소 순회 (종류, 컬렉션 필드명, 모드, 인덱스, 위치)
pub(crate) fn for_each_key_position<'h, H, F>(host: &'h H, mut visit: F)
where
    H: ElementPositionsHost + ?Sized,
    F: FnMut(EditorElementTypeV1, &'h str, usize, &'h KeyPosition),
{
    for_each_element(host, |kind, mode, index, item| {
        if let Some(position) = item.key_position() {
            visit(kind, mode, index, position);
        }
    });
}

pub(crate) fn for_each_key_position_mut<H, F>(host: &mut H, mut visit: F)
where
    H: ElementPositionsHost + ?Sized,
    F: FnMut(EditorElementTypeV1, &mut KeyPosition),
{
    for_each_element_mut(host, |kind, _, item| {
        if let Some(position) = item.key_position_mut() {
            visit(kind, position);
        }
    });
}

/// 컬렉션별 모드 키 (중복 포함, 종류 순서)
pub(crate) fn element_collection_modes<H: ElementPositionsHost + ?Sized>(host: &H) -> Vec<&String> {
    struct Visit<'h, H: ?Sized> {
        host: &'h H,
        modes: Vec<&'h String>,
    }

    impl<'h, H: ElementPositionsHost + ?Sized> CollectionVisitor for Visit<'h, H> {
        type Error = Infallible;

        fn visit<C: ElementCollection>(&mut self) -> Result<(), Infallible> {
            let host: &'h H = self.host;
            self.modes.extend(C::positions(host).keys());
            Ok(())
        }
    }

    let mut visitor = Visit {
        host,
        modes: Vec::new(),
    };
    let Ok(()) = visit_collections(&mut visitor);
    visitor.modes
}

pub(crate) fn element_count<H: ElementPositionsHost + ?Sized>(host: &H) -> usize {
    let mut count = 0;
    for_each_element(host, |_, _, _, _| count += 1);
    count
}

/// 모드 하나의 요소 컬렉션 항목 제거
pub(crate) fn remove_element_mode<H: ElementPositionsHost + ?Sized>(host: &mut H, mode: &str) {
    struct Visit<'h, 'm, H: ?Sized> {
        host: &'h mut H,
        mode: &'m str,
    }

    impl<H: ElementPositionsHost + ?Sized> CollectionVisitor for Visit<'_, '_, H> {
        type Error = Infallible;

        fn visit<C: ElementCollection>(&mut self) -> Result<(), Infallible> {
            C::positions_mut(self.host).remove(self.mode);
            Ok(())
        }
    }

    let Ok(()) = visit_collections(&mut Visit { host, mode });
}

/// 집합에 든 종류의 모드 항목을 빈 목록으로 설정
pub(crate) fn insert_empty_element_mode<H: ElementPositionsHost + ?Sized>(
    host: &mut H,
    mode: &str,
    kinds: ElementKindSet,
) {
    struct Visit<'h, 'm, H: ?Sized> {
        host: &'h mut H,
        mode: &'m str,
    }

    impl<H: ElementPositionsHost + ?Sized> CollectionVisitor for Visit<'_, '_, H> {
        type Error = Infallible;

        fn visit<C: ElementCollection>(&mut self) -> Result<(), Infallible> {
            C::positions_mut(self.host).insert(self.mode.to_string(), Vec::new());
            Ok(())
        }
    }

    let Ok(()) = visit_collections_in(kinds, &mut Visit { host, mode });
}

/// 집합에 든 종류의 컬렉션 비우기
pub(crate) fn clear_element_collections<H: ElementPositionsHost + ?Sized>(
    host: &mut H,
    kinds: ElementKindSet,
) {
    struct Visit<'h, H: ?Sized> {
        host: &'h mut H,
    }

    impl<H: ElementPositionsHost + ?Sized> CollectionVisitor for Visit<'_, H> {
        type Error = Infallible;

        fn visit<C: ElementCollection>(&mut self) -> Result<(), Infallible> {
            C::positions_mut(self.host).clear();
            Ok(())
        }
    }

    let Ok(()) = visit_collections_in(kinds, &mut Visit { host });
}

/// 한 host의 요소 컬렉션을 다른 host로 복제
pub(crate) fn copy_element_collections<S, T>(source: &S, target: &mut T)
where
    S: ElementPositionsHost + ?Sized,
    T: ElementPositionsHost + ?Sized,
{
    struct Visit<'a, S: ?Sized, T: ?Sized> {
        source: &'a S,
        target: &'a mut T,
    }

    impl<S, T> CollectionVisitor for Visit<'_, S, T>
    where
        S: ElementPositionsHost + ?Sized,
        T: ElementPositionsHost + ?Sized,
    {
        type Error = Infallible;

        fn visit<C: ElementCollection>(&mut self) -> Result<(), Infallible> {
            C::positions_mut(self.target).clone_from(C::positions(self.source));
            Ok(())
        }
    }

    let Ok(()) = visit_collections(&mut Visit { source, target });
}

/// 요소 컬렉션만 담는 작업 묶음 - 프리셋 임포트·익스포트처럼 store 밖에서 컬렉션을 다룰 때
#[derive(Debug, Clone, Default, PartialEq)]
pub(crate) struct ElementCollections {
    pub(crate) key_positions: KeyPositions,
    pub(crate) stat_positions: StatPositions,
    pub(crate) graph_positions: GraphPositions,
    pub(crate) knob_positions: KnobPositions,
    pub(crate) sprite_positions: SpritePositions,
}

impl ElementCollections {
    pub(crate) fn cloned_from<H: ElementPositionsHost + ?Sized>(host: &H) -> Self {
        let mut collections = Self::default();
        copy_element_collections(host, &mut collections);
        collections
    }

    /// 한 모드만 복제 - 그 모드 항목이 없는 컬렉션은 빈 맵으로 둔다
    pub(crate) fn mode_slice<H: ElementPositionsHost + ?Sized>(host: &H, mode: &str) -> Self {
        struct Visit<'a, H: ?Sized> {
            host: &'a H,
            mode: &'a str,
            slice: ElementCollections,
        }

        impl<H: ElementPositionsHost + ?Sized> CollectionVisitor for Visit<'_, H> {
            type Error = Infallible;

            fn visit<C: ElementCollection>(&mut self) -> Result<(), Infallible> {
                if let Some(items) = C::positions(self.host).get(self.mode) {
                    C::positions_mut(&mut self.slice).insert(self.mode.to_string(), items.clone());
                }
                Ok(())
            }
        }

        let mut visitor = Visit {
            host,
            mode,
            slice: Self::default(),
        };
        let Ok(()) = visit_collections(&mut visitor);
        visitor.slice
    }

    /// 선택 컬렉션을 꺼내 담는다 - 없는 컬렉션은 빈 맵
    pub(crate) fn take_optional<H: OptionalElementPositionsHost + ?Sized>(host: &mut H) -> Self {
        struct Visit<'a, H: ?Sized> {
            host: &'a mut H,
            collections: ElementCollections,
        }

        impl<H: OptionalElementPositionsHost + ?Sized> CollectionVisitor for Visit<'_, H> {
            type Error = Infallible;

            fn visit<C: ElementCollection>(&mut self) -> Result<(), Infallible> {
                *C::positions_mut(&mut self.collections) =
                    C::optional_mut(self.host).take().unwrap_or_default();
                Ok(())
            }
        }

        let mut visitor = Visit {
            host,
            collections: Self::default(),
        };
        let Ok(()) = visit_collections(&mut visitor);
        visitor.collections
    }

    /// 모든 컬렉션을 Some으로 옮긴다
    pub(crate) fn into_optional<H: OptionalElementPositionsHost + ?Sized>(mut self, host: &mut H) {
        struct Visit<'a, H: ?Sized> {
            collections: &'a mut ElementCollections,
            host: &'a mut H,
        }

        impl<H: OptionalElementPositionsHost + ?Sized> CollectionVisitor for Visit<'_, H> {
            type Error = Infallible;

            fn visit<C: ElementCollection>(&mut self) -> Result<(), Infallible> {
                *C::optional_mut(self.host) =
                    Some(std::mem::take(C::positions_mut(self.collections)));
                Ok(())
            }
        }

        let Ok(()) = visit_collections(&mut Visit {
            collections: &mut self,
            host,
        });
    }
}

impl ElementPositionsHost for AppStoreData {
    fn key_collection(&self) -> &KeyPositions {
        &self.key_positions
    }

    fn key_collection_mut(&mut self) -> &mut KeyPositions {
        &mut self.key_positions
    }

    fn stat_collection(&self) -> &StatPositions {
        &self.stat_positions
    }

    fn stat_collection_mut(&mut self) -> &mut StatPositions {
        &mut self.stat_positions
    }

    fn graph_collection(&self) -> &GraphPositions {
        &self.graph_positions
    }

    fn graph_collection_mut(&mut self) -> &mut GraphPositions {
        &mut self.graph_positions
    }

    fn knob_collection(&self) -> &KnobPositions {
        &self.knob_positions
    }

    fn knob_collection_mut(&mut self) -> &mut KnobPositions {
        &mut self.knob_positions
    }

    fn sprite_collection(&self) -> &SpritePositions {
        &self.sprite_positions
    }

    fn sprite_collection_mut(&mut self) -> &mut SpritePositions {
        &mut self.sprite_positions
    }
}

impl ElementPositionsHost for EditorDocumentV1 {
    fn key_collection(&self) -> &KeyPositions {
        &self.key_positions
    }

    fn key_collection_mut(&mut self) -> &mut KeyPositions {
        &mut self.key_positions
    }

    fn stat_collection(&self) -> &StatPositions {
        &self.stat_positions
    }

    fn stat_collection_mut(&mut self) -> &mut StatPositions {
        &mut self.stat_positions
    }

    fn graph_collection(&self) -> &GraphPositions {
        &self.graph_positions
    }

    fn graph_collection_mut(&mut self) -> &mut GraphPositions {
        &mut self.graph_positions
    }

    fn knob_collection(&self) -> &KnobPositions {
        &self.knob_positions
    }

    fn knob_collection_mut(&mut self) -> &mut KnobPositions {
        &mut self.knob_positions
    }

    fn sprite_collection(&self) -> &SpritePositions {
        &self.sprite_positions
    }

    fn sprite_collection_mut(&mut self) -> &mut SpritePositions {
        &mut self.sprite_positions
    }
}

impl ElementPositionsHost for ElementCollections {
    fn key_collection(&self) -> &KeyPositions {
        &self.key_positions
    }

    fn key_collection_mut(&mut self) -> &mut KeyPositions {
        &mut self.key_positions
    }

    fn stat_collection(&self) -> &StatPositions {
        &self.stat_positions
    }

    fn stat_collection_mut(&mut self) -> &mut StatPositions {
        &mut self.stat_positions
    }

    fn graph_collection(&self) -> &GraphPositions {
        &self.graph_positions
    }

    fn graph_collection_mut(&mut self) -> &mut GraphPositions {
        &mut self.graph_positions
    }

    fn knob_collection(&self) -> &KnobPositions {
        &self.knob_positions
    }

    fn knob_collection_mut(&mut self) -> &mut KnobPositions {
        &mut self.knob_positions
    }

    fn sprite_collection(&self) -> &SpritePositions {
        &self.sprite_positions
    }

    fn sprite_collection_mut(&mut self) -> &mut SpritePositions {
        &mut self.sprite_positions
    }
}

impl OptionalElementPositionsHost for EditorPatchV1 {
    fn key_collection(&self) -> &Option<KeyPositions> {
        &self.key_positions
    }

    fn key_collection_mut(&mut self) -> &mut Option<KeyPositions> {
        &mut self.key_positions
    }

    fn stat_collection(&self) -> &Option<StatPositions> {
        &self.stat_positions
    }

    fn stat_collection_mut(&mut self) -> &mut Option<StatPositions> {
        &mut self.stat_positions
    }

    fn graph_collection(&self) -> &Option<GraphPositions> {
        &self.graph_positions
    }

    fn graph_collection_mut(&mut self) -> &mut Option<GraphPositions> {
        &mut self.graph_positions
    }

    fn knob_collection(&self) -> &Option<KnobPositions> {
        &self.knob_positions
    }

    fn knob_collection_mut(&mut self) -> &mut Option<KnobPositions> {
        &mut self.knob_positions
    }

    fn sprite_collection(&self) -> &Option<SpritePositions> {
        &self.sprite_positions
    }

    fn sprite_collection_mut(&mut self) -> &mut Option<SpritePositions> {
        &mut self.sprite_positions
    }
}

#[cfg(test)]
mod tests;
