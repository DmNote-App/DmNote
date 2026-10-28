//! 편집 창의 요소 문서 세션 - 확정 문서 + 미확정 편집 목록을 WASM에서 든다.
//! JS와는 JSON 문자열로 주고받고, 바뀐 요소만 알린다.

use element_document::bundles::BuiltinBundles;
use element_document::{DocumentPatch, Engine, KindRegistry, PendingEdit, Session};
use wasm_bindgen::prelude::*;

fn json_error(error: serde_json::Error) -> JsError {
    JsError::new(&error.to_string())
}

fn to_json<T: serde::Serialize>(value: &T) -> Result<String, JsError> {
    serde_json::to_string(value).map_err(json_error)
}

#[wasm_bindgen]
pub struct EditorDocumentSession {
    kinds: KindRegistry,
    session: Session,
}

fn engine(kinds: &KindRegistry) -> Engine<'_> {
    Engine {
        kinds,
        bundles: &BuiltinBundles,
    }
}

#[wasm_bindgen]
impl EditorDocumentSession {
    /// kinds: 종류 정의 데이터 배열(JSON), document: 확정 문서(JSON)
    #[wasm_bindgen(constructor)]
    pub fn new(
        kinds: &str,
        document: &str,
        revision: f64,
    ) -> Result<EditorDocumentSession, JsError> {
        let kinds = KindRegistry::from_json(kinds).map_err(|error| JsError::new(&error.message))?;
        let document = serde_json::from_str(document).map_err(json_error)?;
        Ok(Self {
            kinds,
            session: Session::new(document, revision as u64),
        })
    }

    /// 화면에 먼저 반영 - 바뀐 곳(ChangeSet) JSON. 규칙에 어긋나면 위반 목록 JSON을 담은 오류
    pub fn push(&mut self, edit: &str) -> Result<String, JsError> {
        let edit: PendingEdit = serde_json::from_str(edit).map_err(json_error)?;
        let engine = engine(&self.kinds);
        match self.session.push(&engine, edit) {
            Ok(changes) => to_json(&changes),
            Err(violations) => Err(JsError::new(&to_json(&violations)?)),
        }
    }

    pub fn acknowledge(&mut self, edit_id: &str, revision: f64) -> Result<String, JsError> {
        let engine = engine(&self.kinds);
        to_json(&self.session.acknowledge(&engine, edit_id, revision as u64))
    }

    pub fn reject(&mut self, edit_id: &str) -> Result<String, JsError> {
        let engine = engine(&self.kinds);
        to_json(&self.session.reject(&engine, edit_id))
    }

    /// 백엔드 패치(elementDocument:changed)로 확정 문서를 고친다
    #[wasm_bindgen(js_name = applyRemote)]
    pub fn apply_remote(&mut self, patch: &str, revision: f64) -> Result<String, JsError> {
        let patch: DocumentPatch = serde_json::from_str(patch).map_err(json_error)?;
        let engine = engine(&self.kinds);
        to_json(&self.session.apply_remote(&engine, &patch, revision as u64))
    }

    /// 확정 문서를 통째로 바꾼다 (다시 불러오기)
    pub fn reset(&mut self, document: &str, revision: f64) -> Result<String, JsError> {
        let document = serde_json::from_str(document).map_err(json_error)?;
        let engine = engine(&self.kinds);
        to_json(&self.session.rebase(&engine, document, revision as u64))
    }

    /// 화면 상태의 장면 하나(JSON) - 없으면 undefined
    pub fn scene(&self, scene: &str) -> Result<Option<String>, JsError> {
        self.session
            .view()
            .scenes
            .get(scene)
            .map(to_json)
            .transpose()
    }

    /// 화면 상태의 요소 하나(JSON) - 없으면 undefined
    pub fn element(&self, scene: &str, id: &str) -> Result<Option<String>, JsError> {
        self.session
            .view()
            .scenes
            .get(scene)
            .and_then(|scene| scene.element(id))
            .map(to_json)
            .transpose()
    }

    pub fn revision(&self) -> f64 {
        self.session.revision() as f64
    }

    #[wasm_bindgen(js_name = pendingCount)]
    pub fn pending_count(&self) -> u32 {
        self.session.pending().len() as u32
    }
}
