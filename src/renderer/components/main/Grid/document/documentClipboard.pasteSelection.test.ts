import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  // 트리 스토어 화면에 있는 요소 (낙관 반영·되감기를 흉내)
  existing: new Set<string>(),
  release: null as null | ((result: unknown) => void),
  scene: { nodes: [] } as { nodes: unknown[] },
  sent: [] as unknown[][],
}));

vi.mock('@src/renderer/editor/document/elementDocumentRuntime', () => ({
  getElementDocumentStore: () => ({
    getScene: () => mocks.scene,
    getElement: (_scene: string, id: string) =>
      mocks.existing.has(id) ? { id } : undefined,
  }),
}));
vi.mock('./documentEditActions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./documentEditActions')>()),
  editDocument: (ops: Array<{ op: string; node?: { id: string } }>) => {
    mocks.sent.push(ops);
    for (const op of ops) {
      if (op.op === 'insert' && op.node) mocks.existing.add(op.node.id);
    }
    return new Promise((resolve) => {
      mocks.release = resolve;
    });
  },
}));

import { useDocumentSelectionStore } from '@stores/grid/useDocumentSelectionStore';
import { useLayerCollapseStore } from '@stores/grid/useLayerCollapseStore';
import { usePluginDisplayElementStore } from '@stores/plugin/usePluginDisplayElementStore';
import {
  copyDocumentSelection,
  pasteDocumentClipboard,
  useDocumentClipboardStore,
} from './documentClipboard';

const tracker = {
  type: 'element' as const,
  id: 't1',
  kind: 'cursorTracker',
  frame: { x: 0, y: 0, width: 120, height: 120, rotation: 0 },
};

describe('붙여넣기 뒤 선택', () => {
  beforeEach(() => {
    mocks.existing = new Set(['t1']);
    mocks.release = null;
    mocks.scene = { nodes: [] };
    mocks.sent = [];
    useDocumentSelectionStore.getState().replaceSelection('4key', ['t1'], []);
    useDocumentClipboardStore.getState().set([tracker], {
      mode: '4key',
      triggerCanonicals: {},
    });
  });

  it('응답을 기다리지 않고 붙인 사본을 고른다 - 그 사이 Delete가 원본을 지우지 않게', async () => {
    const pasted = pasteDocumentClipboard('4key');
    const selected = useDocumentSelectionStore.getState().selectedIds;
    expect(selected).toHaveLength(1);
    expect(selected[0]).not.toBe('t1');
    mocks.release!({ status: 'committed' });
    await pasted;
    expect(useDocumentSelectionStore.getState().selectedIds).toEqual(selected);
  });

  it('붙이지 못해 화면에서 빠진 사본은 선택에서도 뺀다', async () => {
    const pasted = pasteDocumentClipboard('4key');
    const [copy] = useDocumentSelectionStore.getState().selectedIds;
    mocks.existing.delete(copy);
    mocks.release!({ status: 'rejected', code: 'VIOLATION' });
    await pasted;
    expect(useDocumentSelectionStore.getState().selectedIds).toEqual([]);
  });

  it('고른 것 중 가장 위 노드 바로 위에 붙이고, 접혀 있던 그룹은 붙인 그룹도 접는다 (예전과 같다)', async () => {
    const group = {
      type: 'group' as const,
      id: 'G',
      name: 'G',
      children: [{ ...tracker, id: 'g1' }],
    };
    mocks.scene = { nodes: [tracker, group, { ...tracker, id: 'top' }] };
    useDocumentSelectionStore.getState().replaceSelection('4key', ['g1'], []);
    useLayerCollapseStore.setState({ collapsed: new Set(['G']) });
    expect(copyDocumentSelection()).toBe(true);

    const pasted = pasteDocumentClipboard('4key');
    mocks.release!({ status: 'committed' });
    await pasted;
    const [insert] = mocks.sent[0] as Array<{
      parent: string | null;
      index: number | null;
      node: { id: string; type: string };
    }>;
    // 다 고른 그룹째 복사 - 그 그룹 바로 위(장면 맨 위 단계의 G 다음 자리)
    expect(insert.parent).toBeNull();
    expect(insert.index).toBe(2);
    expect(insert.node.type).toBe('group');
    expect(useLayerCollapseStore.getState().collapsed.has(insert.node.id)).toBe(
      true,
    );
  });

  it('그룹 안 그룹에서 고르면 트리 전용 요소는 그 자리에, 옛 종류 요소는 장면 맨 위에 붙인다 (옛 그룹이 겹치지 않게)', async () => {
    const inner = {
      type: 'group' as const,
      id: 'inner',
      name: 'inner',
      children: [
        { ...tracker, id: 'n1' },
        { ...tracker, id: 'n2' },
      ],
    };
    mocks.scene = {
      nodes: [
        {
          type: 'group',
          id: 'outer',
          name: 'outer',
          children: [inner, { ...tracker, id: 'o1' }],
        },
      ],
    };
    useDocumentSelectionStore.getState().replaceSelection('4key', ['n1'], []);
    const sentInsert = async () => {
      const pasted = pasteDocumentClipboard('4key');
      mocks.release!({ status: 'committed' });
      await pasted;
      return (mocks.sent.at(-1) as Array<{ parent: string | null }>)[0];
    };

    expect((await sentInsert()).parent).toBe('inner');

    useDocumentClipboardStore
      .getState()
      .set([{ ...tracker, id: 'k1', kind: 'key' }], {
        mode: '4key',
        triggerCanonicals: {},
      });
    useDocumentSelectionStore.getState().replaceSelection('4key', ['n1'], []);
    expect((await sentInsert()).parent).toBeNull();
  });

  it('플러그인 요소 사본은 `{플러그인}::{새 id}`이고, 원본 인스턴스 항목만 들고 목록 순번은 버린다', async () => {
    const plugin = {
      type: 'element' as const,
      id: 'demo::orig',
      kind: 'plugin:demo',
      frame: { x: 0, y: 0, width: 50, height: 40, rotation: 0 },
      values: { label: 'A' },
      legacy: { pluginEntry: { instanceId: 'orig', keep: 1 }, order: 3 },
    };
    useDocumentClipboardStore.getState().set([plugin as never], {
      mode: '4key',
      triggerCanonicals: {},
    });
    const pasted = pasteDocumentClipboard('4key');
    mocks.release!({ status: 'committed' });
    await pasted;
    const [insert] = mocks.sent[0] as Array<{
      node: { id: string; legacy: unknown; values: unknown };
    }>;
    expect(insert.node.id).toMatch(/^demo::[0-9a-f-]{36}$/);
    expect(insert.node.legacy).toEqual({
      pluginEntry: { instanceId: 'orig', keep: 1 },
    });
    expect(insert.node.values).toEqual({ label: 'A' });
  });

  it('플러그인 인스턴스 상한을 넘으면 아무것도 붙이지 않는다 (옛 붙여넣기와 같다)', async () => {
    const node = (id: string) => ({
      type: 'element' as const,
      id,
      kind: 'plugin:capped',
      frame: { x: 0, y: 0, width: 50, height: 40, rotation: 0 },
    });
    mocks.scene = { nodes: [node('capped::a')] };
    usePluginDisplayElementStore.setState({
      definitions: new Map([
        [
          'capped',
          { id: 'capped', pluginId: 'capped', maxInstances: 1 } as never,
        ],
      ]),
    });
    useDocumentClipboardStore.getState().set([node('capped::a') as never], {
      mode: '4key',
      triggerCanonicals: {},
    });
    await pasteDocumentClipboard('4key');
    expect(mocks.sent).toEqual([]);
    usePluginDisplayElementStore.setState({ definitions: new Map() });
  });
});
