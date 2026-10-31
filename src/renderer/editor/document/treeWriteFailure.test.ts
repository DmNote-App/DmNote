import { describe, expect, it } from 'vitest';

import {
  isCapacityTreeWriteFailure,
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
});
