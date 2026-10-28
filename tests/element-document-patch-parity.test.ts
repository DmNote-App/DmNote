import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { applyDocumentPatch } from '../src/renderer/editor/document/documentPatch';
import type {
  Document,
  DocumentPatch,
} from '../src/types/generated/elementDocument';

// Rust 테스트(element-document patch)가 만든 fixture - 오버레이의 JS 패치 적용이
// 엔진의 apply_patch와 같은 결과를 내는지 고정한다
const cases = JSON.parse(
  readFileSync(
    join(__dirname, 'fixtures', 'element-document-patches.json'),
    'utf8',
  ),
) as { before: Document; patch: DocumentPatch; after: Document }[];

describe('요소 문서 패치 파리티', () => {
  it.each(cases.map((entry, index) => [index, entry] as const))(
    '경우 %i: 패치를 적용하면 뒤 문서와 같다',
    (_, { before, patch, after }) => {
      expect(applyDocumentPatch(before, patch)).toEqual(after);
    },
  );
});
