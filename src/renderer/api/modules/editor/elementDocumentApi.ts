import { invoke } from '@tauri-apps/api/core';
import { subscribe } from '../shared';

import type {
  ChangeSet,
  Document,
  DocumentPatch,
  Op,
  Violation,
} from '@src/types/generated/elementDocument';

export interface ElementDocumentGetResult {
  revision: number;
  document: Document;
}

export type ElementDocumentCommitResult =
  | { status: 'committed'; revision: number; changes: ChangeSet }
  | {
      status: 'rejected';
      revision: number;
      // VIOLATION: 규칙에 어긋남, MANAGED_ELSEWHERE: 옛 저장 모양 경로로만 고칠 수 있는 대상
      code: 'VIOLATION' | 'MANAGED_ELSEWHERE';
      violations: Violation[];
    };

export interface ElementDocumentChangedEvent {
  revision: number;
  patch: DocumentPatch;
}

// 요소 트리 문서 - 내부 전용 (플러그인 공개 API 아님)
export const elementDocumentApi = {
  get: () => invoke<ElementDocumentGetResult>('element_document_get'),
  commit: (ops: Op[]) =>
    invoke<ElementDocumentCommitResult>('element_document_commit', {
      request: { ops },
    }),
  onChanged: (listener: (event: ElementDocumentChangedEvent) => void) =>
    subscribe<ElementDocumentChangedEvent>('elementDocument:changed', listener),
};
