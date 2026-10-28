//! 편집 창의 화면 상태 - 확정 문서 + 아직 확정되지 않은 편집 목록.
//! 백엔드가 거부하면 그 편집을 목록에서 빼고 다시 쌓는다. 영수증·되돌리기 장치가 필요 없다.

use serde::{Deserialize, Serialize};

use crate::document::Document;
use crate::ops::{diff, ChangeSet, Engine, Op};
use crate::value::Violation;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct PendingEdit {
    pub id: String,
    pub ops: Vec<Op>,
}

#[derive(Debug, Clone)]
pub struct Session {
    confirmed: Document,
    revision: u64,
    pending: Vec<PendingEdit>,
    view: Document,
}

impl Session {
    pub fn new(confirmed: Document, revision: u64) -> Self {
        Self {
            view: confirmed.clone(),
            confirmed,
            revision,
            pending: Vec::new(),
        }
    }

    pub fn view(&self) -> &Document {
        &self.view
    }

    pub fn confirmed(&self) -> &Document {
        &self.confirmed
    }

    pub fn revision(&self) -> u64 {
        self.revision
    }

    pub fn pending(&self) -> &[PendingEdit] {
        &self.pending
    }

    /// 화면에 먼저 반영 - 검사에 걸리면 목록에 넣지 않는다
    pub fn push(
        &mut self,
        engine: &Engine<'_>,
        edit: PendingEdit,
    ) -> Result<ChangeSet, Vec<Violation>> {
        let changes = engine.apply(&mut self.view, &edit.ops)?;
        self.pending.push(edit);
        Ok(changes)
    }

    /// 백엔드가 받아들인 편집. `confirmed`는 백엔드가 확정한 문서(정리된 값 포함)
    pub fn confirm(
        &mut self,
        engine: &Engine<'_>,
        edit_id: &str,
        confirmed: Document,
        revision: u64,
    ) -> ChangeSet {
        self.pending.retain(|edit| edit.id != edit_id);
        self.rebase(engine, confirmed, revision)
    }

    /// 백엔드가 거부한 편집 - 목록에서 빼고 화면을 다시 만든다
    pub fn reject(&mut self, engine: &Engine<'_>, edit_id: &str) -> ChangeSet {
        self.pending.retain(|edit| edit.id != edit_id);
        let confirmed = self.confirmed.clone();
        let revision = self.revision;
        self.rebase(engine, confirmed, revision)
    }

    /// 백엔드가 보낸 패치로 확정 문서를 고친 뒤 남은 편집을 다시 쌓는다
    pub fn apply_remote(
        &mut self,
        engine: &Engine<'_>,
        patch: &crate::patch::DocumentPatch,
        revision: u64,
    ) -> ChangeSet {
        let mut confirmed = self.confirmed.clone();
        crate::patch::apply_patch(&mut confirmed, patch);
        self.rebase(engine, confirmed, revision)
    }

    /// 확정 문서가 바뀜(다른 창의 편집, 되돌리기 등) - 남은 편집을 그 위에 다시 쌓는다.
    /// 더는 맞지 않는 편집은 버린다
    pub fn rebase(&mut self, engine: &Engine<'_>, confirmed: Document, revision: u64) -> ChangeSet {
        let mut view = confirmed.clone();
        self.pending
            .retain(|edit| engine.apply(&mut view, &edit.ops).is_ok());
        let changes = diff(&self.view, &view);
        self.confirmed = confirmed;
        self.revision = revision;
        self.view = view;
        changes
    }
}

#[cfg(test)]
mod tests;
