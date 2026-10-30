import { describe, expect, it } from 'vitest';

import type { Node, Scene } from '@src/types/generated/elementDocument';
import { sceneEditorArrays, treeEditorDocument } from './treeEditorDocument';

const frame = { x: 1, y: 2, width: 30, height: 40, rotation: 0 };

const key = (id: string, slot: string, zIndex?: number): Node =>
  ({
    type: 'element',
    id,
    kind: 'key',
    frame,
    input: { type: 'key', slot },
    legacy: zIndex === undefined ? {} : { zIndex },
  } as Node);

const tracker = (id: string): Node =>
  ({ type: 'element', id, kind: 'cursorTracker', frame } as Node);

const stat = (id: string): Node =>
  ({ type: 'element', id, kind: 'stat', frame, legacy: {} } as Node);

describe('트리 → 편집 의도 바탕 문서', () => {
  it('장면마다 트리 순서로 키 슬롯·위치·종류별 목록을 만들고 옛 그룹만 담는다', () => {
    const scene: Scene = {
      nodes: [
        key('k1', 'KeyA', 3),
        {
          type: 'group',
          id: 'g1',
          name: '묶음',
          hidden: true,
          children: [stat('s1'), key('k2', 'KeyB')],
        },
        { type: 'group', id: 't1', name: '트리', children: [tracker('c1')] },
      ],
    } as Scene;
    const arrays = sceneEditorArrays(scene);
    expect(arrays.keys).toEqual(['KeyA', 'KeyB']);
    expect(arrays.keyPositions.map(({ id }) => id)).toEqual(['k1', 'k2']);
    // 기록된 옛 겹침값 그대로, 그룹 숨김은 요소 숨김으로 바꾸지 않는다
    expect(arrays.keyPositions[0]).toMatchObject({ zIndex: 3, hidden: false });
    expect(arrays.keyPositions[1]).toMatchObject({ hidden: false });
    expect(arrays.statPositions.map(({ id }) => id)).toEqual(['s1']);
    expect(arrays.layerGroups).toEqual([{ id: 'g1', name: '묶음' }]);
    expect(sceneEditorArrays(scene)).toBe(arrays);
  });

  it('모든 장면을 한 문서로', () => {
    const scenes: Record<string, Scene> = {
      '4key': { nodes: [key('k1', 'KeyA')] } as Scene,
      custom: { nodes: [] },
    };
    const document = treeEditorDocument({
      getSceneIds: () => Object.keys(scenes),
      getScene: (id: string) => scenes[id],
    });
    expect(document.schemaVersion).toBe(1);
    expect(document.keys).toEqual({ '4key': ['KeyA'], custom: [] });
    expect(Object.keys(document.keyPositions)).toEqual(['4key', 'custom']);
    expect(document.layerGroups).toEqual({ '4key': [], custom: [] });
  });
});
