import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePluginDisplayElementStore } from '@stores/plugin/usePluginDisplayElementStore';
import type { PluginDisplayElementInternal } from '@src/types/plugin/api';
import { ElementEditHeldError } from '@src/renderer/editor/document/elementDocumentStore';

const mocks = vi.hoisted(() => ({
  nodes: new Set<string>(),
  edit: vi.fn(),
  hideBySave: vi.fn(async () => true),
}));
vi.mock('@src/renderer/editor/document/elementDocumentRuntime', () => ({
  getElementDocumentStore: () => ({
    getElement: (_scene: string, id: string) =>
      mocks.nodes.has(id) ? { id } : undefined,
    edit: mocks.edit,
  }),
}));
vi.mock('./pluginElementActions', () => ({
  setPluginElementsHidden: mocks.hideBySave,
}));

const {
  sendPluginTreeEdit,
  setPluginElementFrames,
  setPluginElementHiddenInTree,
} = await import('./pluginTreeGeometry');

const element = (
  fullId: string,
  extra: Partial<PluginDisplayElementInternal> = {},
) =>
  ({
    id: fullId.split('::')[1],
    fullId,
    pluginId: fullId.split('::')[0],
    html: '',
    position: { x: 0, y: 0 },
    tabId: '4key',
    ...extra,
  } as PluginDisplayElementInternal);

describe('편집기의 플러그인 요소 틀·숨김 저장', () => {
  beforeEach(() => {
    mocks.nodes.clear();
    mocks.edit.mockReset().mockResolvedValue({ status: 'committed' });
    mocks.hideBySave.mockClear();
  });

  it('틀 - 인스턴스는 트리 틀 연산 하나로, 런타임 요소는 런타임 스토어에서', async () => {
    mocks.nodes.add('a::1');
    usePluginDisplayElementStore.setState({
      elements: [
        element('a::1'),
        element('a::free', { measuredSize: { width: 10, height: 20 } }),
      ],
    });
    await setPluginElementFrames(
      '4key',
      new Map([
        ['a::1', { x: 5, width: 80 }],
        ['a::free', { y: 7, height: 30 }],
      ]),
      'g1',
    );
    expect(mocks.edit).toHaveBeenCalledWith(
      [
        {
          op: 'setFrame',
          scene: '4key',
          id: 'a::1',
          frame: { x: 5, width: 80 },
        },
      ],
      { gestureId: 'g1' },
    );
    const free = usePluginDisplayElementStore
      .getState()
      .elements.find(({ fullId }) => fullId === 'a::free')!;
    expect(free.position).toEqual({ x: 0, y: 7 });
    expect(free.measuredSize).toEqual({ width: 10, height: 30 });
    // 인스턴스의 런타임 값은 트리를 따라온다 - 여기서 고치지 않는다
    expect(
      usePluginDisplayElementStore
        .getState()
        .elements.find(({ fullId }) => fullId === 'a::1')!.position,
    ).toEqual({ x: 0, y: 0 });
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
    mocks.nodes.add('a::1');
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
