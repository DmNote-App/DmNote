import { describe, expect, it } from 'vitest';

import {
  isCapacityTreeWriteFailure,
  isConflictTreeWriteFailure,
  isKindLockedTreeWriteFailure,
  isTransientTreeWriteFailure,
} from './treeWriteFailure';
import type { CommitFailure } from './elementDocumentStore';
import type { EditorCommitError } from '@src/types/editor';

const rejected = (
  code: 'VIOLATION' | 'HISTORY_IN_PROGRESS' | 'LEGACY_REJECTED',
  editorError?: EditorCommitError,
): CommitFailure => ({
  result: {
    status: 'rejected',
    revision: 1,
    code,
    violations: [],
    editorError,
  },
});

const editorError = (
  errorCode: EditorCommitError['errorCode'],
  validationCode?: string,
): EditorCommitError => ({
  errorCode,
  message: errorCode,
  retryable: false,
  ...(validationCode ? { details: { validationCode } } : {}),
});

describe('트리 쓰기 실패 가르기', () => {
  it('되돌리기 중·재시도 정책이 영구가 아닌 옛 편집 오류는 일시 실패', () => {
    expect(isTransientTreeWriteFailure(rejected('HISTORY_IN_PROGRESS'))).toBe(
      true,
    );
    expect(
      isTransientTreeWriteFailure(
        rejected('LEGACY_REJECTED', editorError('IO_ERROR')),
      ),
    ).toBe(true);
    expect(
      isTransientTreeWriteFailure(
        rejected('LEGACY_REJECTED', editorError('REVISION_CONFLICT')),
      ),
    ).toBe(true);
  });

  it('던진 오류·규칙 위반·검증 실패·이름표 없는 코드는 영구 실패, 한도 코드는 한도 초과', () => {
    expect(isTransientTreeWriteFailure({ error: new Error('io') })).toBe(false);
    expect(
      isTransientTreeWriteFailure(
        rejected('LEGACY_REJECTED', {
          ...editorError('IO_ERROR'),
          errorCode: 'NEW_UNKNOWN_CODE' as never,
        }),
      ),
    ).toBe(false);
    expect(isTransientTreeWriteFailure(rejected('VIOLATION'))).toBe(false);
    expect(isTransientTreeWriteFailure(rejected('LEGACY_REJECTED'))).toBe(
      false,
    );
    const capacity = rejected(
      'LEGACY_REJECTED',
      editorError('VALIDATION_FAILED', 'TOO_MANY_RENDER_ITEMS'),
    );
    expect(isTransientTreeWriteFailure(capacity)).toBe(false);
    expect(isCapacityTreeWriteFailure(capacity)).toBe(true);
    expect(
      isCapacityTreeWriteFailure(
        rejected('LEGACY_REJECTED', editorError('VALIDATION_FAILED', 'X')),
      ),
    ).toBe(false);
    expect(isCapacityTreeWriteFailure({ error: new Error('io') })).toBe(false);
  });

  it('다시 계획해도 겹친 옛 편집 충돌은 편집 충돌 (예전 충돌 대화상자)', () => {
    expect(
      isConflictTreeWriteFailure(
        rejected('LEGACY_REJECTED', editorError('REVISION_CONFLICT')),
      ),
    ).toBe(true);
    expect(
      isConflictTreeWriteFailure(
        rejected('LEGACY_REJECTED', editorError('PLUGIN_REVISION_CONFLICT')),
      ),
    ).toBe(true);
    expect(isConflictTreeWriteFailure(rejected('HISTORY_IN_PROGRESS'))).toBe(
      false,
    );
    expect(isConflictTreeWriteFailure({ error: new Error('io') })).toBe(false);
    expect(isConflictTreeWriteFailure(null)).toBe(false);
  });

  it('새 버전 앱이 쓴 종류라 거절된 쓰기는 트리 규칙 위반이든 옛 편집 검증이든 잠금 실패 (영구)', () => {
    const treeLocked: CommitFailure = {
      result: {
        status: 'rejected',
        revision: 1,
        code: 'VIOLATION',
        violations: [{ code: 'KIND_VERSION_LOCKED', path: 'id' }],
      },
    };
    const legacyLocked = rejected(
      'LEGACY_REJECTED',
      editorError('VALIDATION_FAILED', 'KIND_VERSION_LOCKED'),
    );
    expect(isKindLockedTreeWriteFailure(treeLocked)).toBe(true);
    expect(isKindLockedTreeWriteFailure(legacyLocked)).toBe(true);
    expect(isTransientTreeWriteFailure(treeLocked)).toBe(false);
    expect(isTransientTreeWriteFailure(legacyLocked)).toBe(false);
    expect(isKindLockedTreeWriteFailure(rejected('VIOLATION'))).toBe(false);
    expect(
      isKindLockedTreeWriteFailure(
        rejected('LEGACY_REJECTED', editorError('VALIDATION_FAILED', 'X')),
      ),
    ).toBe(false);
    expect(isKindLockedTreeWriteFailure({ error: new Error('io') })).toBe(
      false,
    );
  });
});
