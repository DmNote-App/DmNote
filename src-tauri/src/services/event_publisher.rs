use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc,
};

use element_document::{make_patch, Document, DocumentPatch};
use parking_lot::Mutex;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::state::AppState;

// 요소 트리 문서 변경 - 바뀐 장면·요소만 싣는다
pub(crate) const ELEMENT_DOCUMENT_CHANGED_EVENT: &str = "elementDocument:changed";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ElementDocumentChangedPayload {
    revision: u64,
    patch: DocumentPatch,
}

/// 창에 마지막으로 알린 트리 문서 - 다음 변경을 이것과의 차이로 보낸다
pub(crate) struct ElementDocumentPublication {
    published: AtomicU64,
    last: Mutex<Arc<Document>>,
}

impl ElementDocumentPublication {
    pub(crate) fn new(revision: u64, document: Arc<Document>) -> Self {
        Self {
            published: AtomicU64::new(revision),
            last: Mutex::new(document),
        }
    }
}

pub fn publish_event<T: Serialize>(app: &AppHandle, event: &str, payload: T) {
    let obs_state = app
        .try_state::<AppState>()
        .filter(|state| state.obs_bridge.is_running());
    match obs_state {
        // OBS에도 보낼 때만 값으로 한 번 만들어 함께 쓴다
        Some(state) => {
            let value = match serde_json::to_value(payload) {
                Ok(value) => value,
                Err(error) => {
                    log::error!("[EventPublisher] {event} payload serialization failed: {error}");
                    return;
                }
            };
            if let Err(error) = app.emit(event, &value) {
                log::error!("[EventPublisher] Tauri emit failed for {event}: {error}");
            }
            state.obs_bridge.publish(event, value);
        }
        None => {
            if let Err(error) = app.emit(event, &payload) {
                log::error!("[EventPublisher] Tauri emit failed for {event}: {error}");
            }
        }
    }

    // 옛 모양 경로의 커밋도 트리를 바꾸므로 어떤 발행 뒤에든 트리 변경을 따라 보낸다
    if event != ELEMENT_DOCUMENT_CHANGED_EVENT {
        publish_element_document_changes(app);
    }
}

/// 트리 문서가 마지막 알림 뒤 바뀌었으면 차이를 보낸다
pub(crate) fn publish_element_document_changes(app: &AppHandle) {
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    let publication = &state.element_document_publication;
    if state.store.element_document_revision() == publication.published.load(Ordering::Acquire) {
        return;
    }
    // 잠금을 쥔 채로 보낸다 - 다른 스레드의 다음 패치가 먼저 나가면 창이 이 패치를 건너뛴다
    let mut last = publication.last.lock();
    let (revision, document) = state.store.element_document_snapshot();
    if revision == publication.published.load(Ordering::Acquire) {
        return;
    }
    let patch = make_patch(&last, &document);
    *last = document;
    publication.published.store(revision, Ordering::Release);
    publish_event(
        app,
        ELEMENT_DOCUMENT_CHANGED_EVENT,
        ElementDocumentChangedPayload { revision, patch },
    );
}
