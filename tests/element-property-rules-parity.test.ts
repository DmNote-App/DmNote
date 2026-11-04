import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { applyLocalOps } from '../src/renderer/editor/document/documentLocalOps';
import type { ElementNode } from '../src/renderer/editor/document/documentPatch';
import { propertyPatchOps } from '../src/renderer/elementKinds/runtime/propertyPatchOps';
import type { EditorOpV1 } from '../src/types/editor';
import type { Document } from '../src/types/generated/elementDocument';

// Rust가 만든 fixture(src-tauri/src/state/store/element_tree/property_rules_fixture.rs) - 옛 편집 연산 기준표의
// 속성 패치 경우를 저장된 옛 모양처럼 트리로 읽고 백엔드 옛 편집 연산 적용 뒤 트리에 맞춘 요소.
// 패널의 트리 쓰기(속성 패치 → 트리 연산 → 낙관 적용)가 같은 요소가 되는지 고정한다
type FixtureElement = Omit<ElementNode, 'type'>;

const fixture = JSON.parse(
  readFileSync(
    join(__dirname, 'fixtures', 'element-property-rules.json'),
    'utf8',
  ),
) as {
  cases: {
    name: string;
    ops: EditorOpV1[];
    elements: {
      id: string;
      scene: string;
      before: FixtureElement;
      after: FixtureElement;
    }[];
  }[];
};

const elementOf = (node: FixtureElement): ElementNode => ({
  type: 'element',
  ...node,
});

// 칸을 비우면 패널은 null을 쓰고 옛 모양 맞추기는 칸을 뺀다 - 둘 다 값 없음이라 같게 본다
const withoutNulls = (fields: Record<string, unknown> | undefined) =>
  fields &&
  Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== null),
  );

const comparable = (node: ElementNode | undefined) =>
  node && {
    ...node,
    values: withoutNulls(node.values),
    bundles:
      node.bundles &&
      Object.fromEntries(
        Object.entries(node.bundles).map(([name, fields]) => [
          name,
          withoutNulls(fields as Record<string, unknown>),
        ]),
      ),
  };

const findElement = (document: Document, id: string) => {
  for (const [scene, { nodes }] of Object.entries(document.scenes)) {
    const node = nodes.find((candidate) => candidate.id === id);
    if (node?.type === 'element') return { scene, node };
  }
  return null;
};

describe('속성 패치 칸 규칙 트리 파리티', () => {
  it('속성 패치 경우가 있다', () => {
    expect(fixture.cases.length).toBeGreaterThan(0);
  });

  it.each(fixture.cases.map((entry) => [entry.name, entry] as const))(
    '%s',
    (_, { ops, elements }) => {
      let document: Document = {
        formatVersion: 1,
        kindVersions: {},
        scenes: {},
      };
      for (const { scene, before } of elements) {
        document.scenes[scene] ??= { nodes: [] };
        document.scenes[scene]!.nodes.push(elementOf(before));
      }
      for (const op of ops) {
        if (op.kind !== 'patchElement') continue;
        const found = findElement(document, op.id);
        if (!found) continue;
        const treeOps = propertyPatchOps(found.scene, found.node, op.patch);
        if (treeOps) document = applyLocalOps(document, treeOps);
      }
      for (const { id, after } of elements) {
        expect(comparable(findElement(document, id)?.node)).toEqual(
          comparable(elementOf(after)),
        );
      }
    },
  );
});
