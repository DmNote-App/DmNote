// 임시 동치 행렬 - 속성 패치의 트리 쓰기(propertyPatchOps)가 지금 경로(옛 칸 보기 → legacyFieldPatch →
// 칸 → 트리 연산, treeRoutedOps)와 같은 연산을 만드는지 칸마다·종류마다 고정한다. 옛 경로를 걷을 때 함께 지운다
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import { treeRoutedOps } from '@src/renderer/editor/runtime/operations/treeRoutedOps';
import type {
  EditorElementPropertyPatchV1,
  EditorElementTypeV1,
  EditorOpV1,
} from '@src/types/editor';
import { fillKindDefaults } from './elementKindDefaults';
import { fieldPatchOps } from './fieldView';
import { legacyFieldPatch } from './legacyFieldPatch';
import { legacyPositionOf } from './legacyPosition';
import { propertyPatchOps } from './propertyPatchOps';

const FIXTURES = join(__dirname, '../../../../tests/fixtures');
const read = <T>(name: string) =>
  JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as T;

// 칸마다 값 - 옛 편집 연산 기준표의 속성 패치 전부 (칸 76개를 모두 덮는다)
const patches = [
  ...new Map(
    read<{ cases: { ops: EditorOpV1[] }[] }>('editor-ops-parity.json')
      .cases.flatMap(({ ops }) => ops)
      .flatMap((op) => (op.kind === 'patchElement' ? [op.patch] : []))
      .map((patch) => [JSON.stringify(patch), patch] as const),
  ).values(),
];

const KINDS: EditorElementTypeV1[] = ['key', 'stat', 'graph', 'knob', 'sprite'];

// 새로 만든 요소 (종류 기본값)
const freshNode = (kind: EditorElementTypeV1): ElementNode =>
  fillKindDefaults({
    type: 'element',
    id: `${kind}-fresh`,
    kind,
    frame: { x: 10, y: 20, width: 60, height: 60, rotation: 0 },
    ...(kind === 'key' ? { input: { type: 'key', slot: 'KeyA' } } : {}),
    ...(kind === 'knob' ? { input: { type: 'axis', axisId: 'HIDA:1' } } : {}),
  } as ElementNode);

// 저장된 옛 모양을 백엔드가 트리로 읽은 요소 (종류가 쓰지 않는 옛 칸이 legacy.fields에 남는다)
const storedNodes = read<{
  cases: { elements: { before: Omit<ElementNode, 'type'> }[] }[];
}>('element-property-rules.json')
  .cases.flatMap(({ elements }) => elements)
  .map(({ before }) => ({ type: 'element', ...before } as ElementNode));

const nodes = [
  ...KINDS.map(freshNode),
  ...new Map(storedNodes.map((node) => [node.id, node])).values(),
];

// 지금 경로 - editorSemanticOps의 트리 몫 나누기와 같다
const legacyRoute = (
  scene: string,
  node: ElementNode,
  patch: EditorElementPropertyPatchV1,
) => {
  const op = {
    kind: 'patchElement',
    elementType: node.kind,
    id: node.id,
    patch,
  } as EditorOpV1;
  const { treeOps, legacyIndexes } = treeRoutedOps([op], {
    isTreeEdited: () => true,
    sceneOf: () => scene,
    styleOps: (routed) => {
      if (routed.kind !== 'patchElement') return null;
      const fields = legacyFieldPatch(
        routed.elementType,
        legacyPositionOf(node) as Record<string, unknown> & { id: string },
        routed.patch,
      );
      const { ops, unowned } = fieldPatchOps(scene, node, fields);
      return unowned.length === 0 && ops.length > 0 ? ops : null;
    },
  });
  return legacyIndexes.size > 0 ? null : treeOps;
};

// 칸 규칙이 없는 묶음 칸을 고치면(그래프의 카운터 등) 규칙이 던진다 - 던지는 것까지 같아야 한다
const outcome = (run: () => unknown) => {
  try {
    return run();
  } catch (error) {
    return { threw: String(error) };
  }
};

describe('속성 패치 트리 쓰기 = 지금 경로', () => {
  it('칸 76개를 모두 덮는다', () => {
    const tags = read<{ properties: string[] }>(
      'editor-property-tags.json',
    ).properties;
    const covered = new Set(patches.map((patch) => patch.property as string));
    expect(tags.filter((tag) => !covered.has(tag))).toEqual([]);
  });

  it.each(nodes.map((node) => [`${node.kind} ${node.id}`, node] as const))(
    '%s',
    (_, node) => {
      const differ = patches.flatMap((patch) => {
        const next = outcome(() => propertyPatchOps('tab', node, patch));
        const legacy = outcome(() => legacyRoute('tab', node, patch));
        return JSON.stringify(next) === JSON.stringify(legacy)
          ? []
          : [{ patch, next, legacy }];
      });
      expect(differ).toEqual([]);
    },
  );
});
