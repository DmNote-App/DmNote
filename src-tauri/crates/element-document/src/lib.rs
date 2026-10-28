//! DmNote 요소 문서 엔진 - 백엔드와 편집 창(WASM)이 같은 코드를 쓴다.
//!
//! - 문서: 탭(장면)마다 요소 트리 하나, 그룹은 중첩 가능한 폴더
//! - 요소: 공통 정보 + 기능 묶음 + 종류 고유 값 + 입력
//! - 규칙표: 종류 정의에서 뽑은 순수 데이터로 고유 값을 검사·정리
//! - 연산: 넣기·빼기·옮기기·칸 값 바꾸기, 바뀐 요소만 알림
//! - 세션: 확정 문서 + 미확정 편집 목록

pub mod bundles;
pub mod condition;
pub mod document;
pub mod load;
pub mod ops;
pub mod patch;
pub mod schema;
pub mod session;
pub mod value;

pub use bundles::{BundleCatalog, NoBundles};
pub use document::{Document, Element, Frame, Group, InputBinding, Node, Scene};
pub use load::{IdSource, LoadReport, Loader};
pub use ops::{diff, ChangeSet, Engine, FramePatch, Op, SceneChange};
pub use patch::{apply_patch, make_patch, DocumentPatch, ScenePatch};
pub use schema::{KindMigration, KindRegistry, KindSchema, MigrationStep, Size};
pub use session::{PendingEdit, Session};
pub use value::{AssetKind, FieldRule, ValueKind, Violation, ViolationCode};

#[cfg(test)]
pub(crate) mod test_support;
#[cfg(test)]
mod ts_bindings;
