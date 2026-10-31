import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePluginDisplayElementStore } from '@stores/plugin/usePluginDisplayElementStore';
import type { PluginDisplayElementInternal } from '@src/types/plugin/api';
import { ElementEditHeldError } from '@src/renderer/editor/document/elementDocumentStore';
import {
  isPluginElementEditing,
  resetPluginTreeEditOwnership,
  subscribePluginEditingReleased,
} from './pluginTreeEditOwnership';

const mocks = vi.hoisted(() => ({
  nodes: new Map<string, { frame: Record<string, number> }>(),
  edit: vi.fn(),
  hideBySave: vi.fn(async () => true),
}));
vi.mock('@src/renderer/editor/document/elementDocumentRuntime', () => ({
  getElementDocumentStore: () => ({
    getElement: (_scene: string, id: string) => mocks.nodes.get(id),
    edit: mocks.edit,
  }),
}));
vi.mock('./pluginElementActions', () => ({
  setPluginElementsHidden: mocks.hideBySave,
}));

const {
  applyPluginElementEdit,
  commitPluginFrames,
  sendPluginTreeEdit,
  setPluginElementHiddenInTree,
} = await import('./pluginTreeGeometry');

const element = (
  fullId: string,
  position: { x: number; y: number },
  extra: Partial<PluginDisplayElementInternal> = {},
) =>
  ({
    id: fullId.split('::')[1],
    fullId,
    pluginId: fullId.split('::')[0],
    html: '',
    position,
    tabId: '4key',
    ...extra,
  } as PluginDisplayElementInternal);

const frame = (x: number, y: number) => ({
  frame: { x, y, width: 200, height: 150, rotation: 0 },
});

describe('편집기의 플러그인 요소 위치 저장', () => {
  beforeEach(() => {
    mocks.nodes.clear();
    mocks.edit.mockReset().mockResolvedValue({ status: 'committed' });
    mocks.hideBySave.mockClear();
    resetPluginTreeEditOwnership();
  });

  it('미리보기는 런타임 스토어만 고치고 미리보는 요소로 표시한다', () => {
    const seen: string[][] = [];
    applyPluginElementEdit(new Set(['a::1']), (ids) => seen.push([...ids]));
    expect(seen).toEqual([['a::1']]);
    expect(isPluginElementEditing('a::1')).toBe(true);
  });

  it('바뀐 위치·측정 크기만 같은 동작 id의 틀 연산으로 보내고, 보낸 뒤 미리보기를 푼다', async () => {
    mocks.nodes.set('a::1', frame(0, 0));
    mocks.nodes.set('a::2', frame(5, 5));
    usePluginDisplayElementStore.setState({
      elements: [
        element(
          'a::1',
          { x: 10, y: 0 },
          { measuredSize: { width: 80, height: 150 } },
        ),
        element('a::2', { x: 5, y: 5 }),
        element('a::missing', { x: 1, y: 1 }),
      ],
    });
    applyPluginElementEdit(new Set(['a::1', 'a::2']), () => undefined);
    const released: string[][] = [];
    const stop = subscribePluginEditingReleased((ids) =>
      // 풀릴 때는 이미 보냈다
      released.push([...ids, `sent:${mocks.edit.mock.calls.length}`]),
    );
    await commitPluginFrames('4key', ['a::1', 'a::2', 'a::missing'], 'g1');
    stop();
    expect(mocks.edit).toHaveBeenCalledWith(
      [
        {
          op: 'setFrame',
          scene: '4key',
          id: 'a::1',
          frame: { x: 10, width: 80 },
        },
      ],
      { gestureId: 'g1' },
    );
    expect(released).toEqual([['a::1', 'a::2', 'sent:1']]);
    expect(isPluginElementEditing('a::1')).toBe(false);
  });

  it('바뀐 것이 없으면 보내지 않고 미리보기만 푼다', async () => {
    mocks.nodes.set('a::1', frame(3, 4));
    usePluginDisplayElementStore.setState({
      elements: [element('a::1', { x: 3, y: 4 })],
    });
    applyPluginElementEdit(new Set(['a::1']), () => undefined);
    await commitPluginFrames('4key', ['a::1']);
    expect(mocks.edit).not.toHaveBeenCalled();
    expect(isPluginElementEditing('a::1')).toBe(false);
  });

  it('거절은 오류로 올리고, 보류는 화면에 남긴 채 끝난 것으로 본다', async () => {
    const ops = [
      { op: 'remove' as const, scene: '4key', ids: ['a::1'] as string[] },
    ];
    mocks.edit.mockResolvedValueOnce({ status: 'rejected', code: 'VIOLATION' });
    await expect(sendPluginTreeEdit(ops)).rejects.toThrow('VIOLATION');
    mocks.edit.mockRejectedValueOnce(new ElementEditHeldError());
    await expect(sendPluginTreeEdit(ops)).resolves.toBeUndefined();
  });

  it('숨김 - 트리에 노드가 있으면 공통 정보 연산, 없으면 런타임 스토어에서', async () => {
    mocks.nodes.set('a::1', frame(0, 0));
    await setPluginElementHiddenInTree('4key', 'a::1', true);
    expect(mocks.edit).toHaveBeenCalledWith(
      [{ op: 'setCommon', scene: '4key', id: 'a::1', hidden: true }],
      undefined,
    );
    await setPluginElementHiddenInTree('4key', 'a::free', true);
    expect(mocks.hideBySave).toHaveBeenCalledWith([
      { fullId: 'a::free', hidden: true },
    ]);
  });
});
