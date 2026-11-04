import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { applySemanticElementPatch } from '../src/renderer/editor/runtime/projection/semanticElementPatchProjection';
import {
  EDITOR_ELEMENT_POSITION_FIELDS,
  type CanonicalEditorDocumentV1,
  type EditorOpV1,
} from '../src/types/editor';

// Rust 테스트(src-tauri/src/state/editor_ops_parity.rs)와 같은 fixture - 속성 패치(patchElement)만 있는 경우를
// 패널 편집의 칸 계산(legacyFieldPatch가 쓰는 applySemanticElementPatch)으로 돌려 백엔드 옛 편집 연산
// 적용(플러그인 editor.commit의 속성 패치)과 같은 문서가 되는지 고정한다
const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'editor-ops-parity.json'), 'utf8'),
) as {
  cases: {
    name: string;
    initialDocument: CanonicalEditorDocumentV1;
    ops: EditorOpV1[];
    expectedDocument: CanonicalEditorDocumentV1;
  }[];
};

const patchOnly = fixture.cases.filter((entry) =>
  entry.ops.every((op) => op.kind === 'patchElement'),
);

// 속성 칸 목록(Rust 원본) - 칸마다 기준 경우가 하나 이상 있어야 한다
const propertyTags = (
  JSON.parse(
    readFileSync(
      join(__dirname, 'fixtures', 'editor-property-tags.json'),
      'utf8',
    ),
  ) as { properties: string[] }
).properties;

describe('속성 패치 칸 계산 파리티', () => {
  it('속성 패치 경우가 있다', () => {
    expect(patchOnly.length).toBeGreaterThan(0);
  });

  it('속성 칸마다 기준 경우가 있다', () => {
    const covered = new Set(
      patchOnly.flatMap((entry) =>
        entry.ops.flatMap((op) =>
          op.kind === 'patchElement' ? [op.patch.property as string] : [],
        ),
      ),
    );
    expect(propertyTags.filter((tag) => !covered.has(tag))).toEqual([]);
  });

  it.each(patchOnly.map((entry) => [entry.name, entry] as const))(
    '%s',
    (_, { initialDocument, ops, expectedDocument }) => {
      const document = structuredClone(initialDocument);
      for (const op of ops) {
        if (op.kind !== 'patchElement') continue;
        applySemanticElementPatch(
          document,
          op,
          undefined,
          EDITOR_ELEMENT_POSITION_FIELDS,
        );
      }
      expect(document).toEqual(expectedDocument);
    },
  );
});
