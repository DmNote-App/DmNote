// 시작 직후 저장 파일 미리 읽기 - 쓰기 없는 읽기·해석(load_store_from_path)을 Tauri 초기화와 겹쳐 돌리고,
// setup이 같은 경로를 열 때 결과를 받는다. setup은 메인 스레드라 그동안 창의 페이지·스크립트 요청을 받지 못한다
use std::{
    path::{Path, PathBuf},
    sync::Mutex,
    thread::JoinHandle,
};

use anyhow::Result;

use super::STORE_FILE_NAME;
use crate::state::migration::{load_store_from_path, LoadedStore};

type Preload = (PathBuf, JoinHandle<Result<LoadedStore>>);

static PRELOAD: Mutex<Option<Preload>> = Mutex::new(None);

/// 앱 데이터 폴더(식별자)의 저장 파일을 백그라운드에서 읽기 시작한다 - 파일이 없으면 하지 않는다
pub(crate) fn start(identifier: &str) {
    if let Some(dir) = dirs_next::data_dir() {
        start_at(dir.join(identifier).join(STORE_FILE_NAME));
    }
}

fn start_at(path: PathBuf) {
    if !path.exists() {
        return;
    }
    let thread_path = path.clone();
    let Ok(handle) = std::thread::Builder::new()
        .name("store-preload".into())
        .spawn(move || load_store_from_path(&thread_path))
    else {
        return;
    };
    if let Ok(mut slot) = PRELOAD.lock() {
        *slot = Some((path, handle));
    }
}

/// 미리 읽은 결과 - 같은 경로일 때만 꺼낸다. 읽다 멈췄으면(패닉) 없음 - 부르는 쪽이 다시 읽는다
pub(super) fn take(path: &Path) -> Option<Result<LoadedStore>> {
    let handle = {
        let mut slot = PRELOAD.lock().ok()?;
        if slot.as_ref().map(|(preloaded, _)| preloaded.as_path()) != Some(path) {
            return None;
        }
        slot.take()?.1
    };
    handle.join().ok()
}

/// 쓰지 않은 미리 읽기를 버린다 - setup이 다른 경로를 열었으면 결과를 붙들지 않게
pub(crate) fn discard() {
    if let Ok(mut slot) = PRELOAD.lock() {
        slot.take();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::AppStore;

    fn slot_is_empty() -> bool {
        PRELOAD.lock().unwrap().is_none()
    }

    // 미리 읽기 칸은 하나라 한 테스트에서 차례로 본다 (다른 테스트의 setup은 제 경로만 꺼낸다)
    #[test]
    fn 같은_경로일_때만_미리_읽은_결과를_꺼내고_setup은_그것으로_연다() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(STORE_FILE_NAME);
        // 저장 파일 하나 - 기본 상태로 처음 열어 저장한다
        AppStore::initialize_in_dir(dir.path())
            .unwrap()
            .flush_and_shutdown()
            .unwrap();
        let direct = load_store_from_path(&path).unwrap();

        start_at(path.clone());
        // 다른 경로는 꺼내지 않고 그대로 둔다
        assert!(take(&dir.path().join("other.json")).is_none());
        assert!(!slot_is_empty());
        let preloaded = take(&path).expect("미리 읽은 결과").unwrap();
        assert!(slot_is_empty());
        assert_eq!(preloaded.data, direct.data);
        assert_eq!(preloaded.needs_persist, direct.needs_persist);
        assert_eq!(preloaded.repaired, direct.repaired);
        assert_eq!(
            preloaded.element_document_missing,
            direct.element_document_missing
        );

        // setup이 같은 경로를 열면 미리 읽은 결과를 쓴다 - 다시 읽은 것과 같은 상태
        start_at(path.clone());
        let opened = AppStore::initialize_in_dir(dir.path()).unwrap();
        assert!(slot_is_empty());
        let reopened_state = opened.snapshot();
        opened.flush_and_shutdown().unwrap();
        let again = AppStore::initialize_in_dir(dir.path()).unwrap();
        assert_eq!(again.snapshot(), reopened_state);
        again.flush_and_shutdown().unwrap();

        // 쓰지 않은 미리 읽기는 버린다
        start_at(path);
        discard();
        assert!(slot_is_empty());
        // 파일이 없으면 시작하지 않는다
        start_at(dir.path().join("missing.json"));
        assert!(slot_is_empty());
    }
}
