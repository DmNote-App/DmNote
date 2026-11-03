import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { applyLocalOps } from '../src/renderer/editor/document/documentLocalOps';
import { fillKindDefaults } from '../src/renderer/elementKinds/runtime/elementKindDefaults';
import type { ElementNode } from '../src/renderer/editor/document/documentPatch';
import type { Document, Op } from '../src/types/generated/elementDocument';

// Rust 테스트(state/store/element_tree/local_ops_fixture.rs)가 만든 fixture - 편집 창 낙관 적용과
// 새 요소 기본값이 백엔드 트리 편집 적용·엔진 넣기 채우기와 같은 결과를 내는지 고정한다
const fixture = JSON.parse(
  readFileSync(
    join(__dirname, 'fixtures', 'element-document-local-ops.json'),
    'utf8',
  ),
) as {
  bases: Record<string, Document>;
  ops: { name: string; before: string; ops: Op[]; after: Document }[];
  fills: { kind: string; node: ElementNode; filled: ElementNode }[];
};

describe('편집 창 낙관 적용 파리티', () => {
  it.each(fixture.ops.map((entry) => [entry.name, entry] as const))(
    '%s',
    (_, { before, ops, after }) => {
      expect(applyLocalOps(fixture.bases[before], ops)).toEqual(after);
    },
  );
});

describe('새 요소 기본값 파리티', () => {
  it.each(fixture.fills.map((entry) => [entry.kind, entry] as const))(
    '%s: 빠진 고유 값·기능 묶음을 엔진 넣기와 같게 채운다',
    (_, { node, filled }) => {
      expect(fillKindDefaults(node)).toEqual(filled);
    },
  );
});
