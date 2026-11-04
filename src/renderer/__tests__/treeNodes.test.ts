import { describe, expect, it } from 'vitest';

import { legacyPositionOf } from '@src/renderer/elementKinds/runtime/legacyPosition';
import { legacyShapedNode, legacyShapedScene } from './treeNodes';

// 예전 꾸미기(옛 위치 객체를 옛 칸에 통째로)가 보이던 옛 모양 보기
const viewOf = (
  position: Record<string, unknown>,
  index: number,
  kind: string,
) => ({
  ...position,
  id: position.id ?? `${kind}-${index}`,
  dx: position.dx ?? 0,
  dy: position.dy ?? 0,
  width: position.width ?? 60,
  height: position.height ?? 60,
  rotation: position.rotation ?? 0,
  hidden: position.hidden === true,
});

describe('옛 위치 모양 → 트리 요소', () => {
  it.each([
    [
      'key',
      {
        id: '70000000-0000-4000-8000-000000000001',
        dx: 10,
        dy: 20,
        width: 80,
        height: 70,
        rotation: 15,
        layerName: 'Key',
        className: null,
        useInlineStyles: true,
        displayText: 'A',
        count: 3,
        backgroundColor: '#112233',
        fontSize: 14,
        inactiveImage: 'idle.png',
        noteColor: '#ffffff',
        counter: { enabled: false },
        soundVolume: 40,
        zIndex: 2,
        groupId: 'g-1',
      },
    ],
    ['stat', { dx: 1, dy: 2, statType: 'total', fontWeight: 700 }],
    [
      'graph',
      {
        dx: 0,
        dy: 0,
        width: 200,
        height: 100,
        graphType: 'bar',
        borderWidth: 2,
      },
    ],
    [
      'knob',
      { axisId: 'HIDA:test', sensitivity: 2, reverse: true, hidden: true },
    ],
    [
      'sprite',
      {
        id: '70000000-0000-4000-8000-000000000005',
        width: 120,
        height: 90,
        baseImage: 'base.png',
        poses: [{ poseId: 'p-1', triggers: [] }],
      },
    ],
  ] as const)('%s - 옛 모양 보기가 준 값과 같다', (kind, position) => {
    const node = legacyShapedNode(
      kind,
      position,
      3,
      kind === 'key' ? 'KeyA' : undefined,
    );

    expect(legacyPositionOf(node)).toEqual(viewOf(position, 3, kind));
  });

  it('종류가 가진 칸은 고유 값·기능 묶음·입력에, 나머지는 옛 칸에 싣는다', () => {
    const node = legacyShapedNode(
      'key',
      { count: 3, backgroundColor: '#112233', groupId: 'g-1', layerName: 'K' },
      0,
      'KeyA',
    ) as unknown as Record<string, unknown>;

    expect(node.values).toEqual({ count: 3 });
    expect(node.bundles).toEqual({ surface: { backgroundColor: '#112233' } });
    expect(node.input).toEqual({ type: 'key', slot: 'KeyA' });
    expect(node.name).toBe('K');
    expect(node.legacy).toEqual({ index: 0, fields: { groupId: 'g-1' } });
  });

  it('장면은 키(슬롯 순서)부터 쌓고 옛 그룹은 그룹 노드로 묶는다', () => {
    const scene = legacyShapedScene({
      keyMappings: ['A', 'B'],
      keys: [{ id: 'k-a' }, { id: 'k-b', groupId: 'g-1' }],
      stats: [{ id: 's-1', groupId: 'g-1' }],
      layerGroups: [{ id: 'g-1', name: 'Group' }],
    });

    expect(scene.nodes.map((node) => node.id)).toEqual(['k-a', 'g-1']);
    const group = scene.nodes[1] as { children: { id: string }[] };
    expect(group.children.map((child) => child.id)).toEqual(['k-b', 's-1']);
  });

  it('플러그인 요소는 플러그인 종류 노드로 옛 그룹에 함께 든다', () => {
    const scene = legacyShapedScene({
      keys: [{ id: 'k-a', groupId: 'g-1' }],
      plugins: [{ id: 'plugin-a::p-1', pluginId: 'plugin-a', groupId: 'g-1' }],
      layerGroups: [{ id: 'g-1', name: 'Group' }],
    });

    const group = scene.nodes[0] as {
      children: { id: string; kind: string }[];
    };
    expect(group.children.map(({ id, kind }) => [id, kind])).toEqual([
      ['k-a', 'key'],
      ['plugin-a::p-1', 'plugin:plugin-a'],
    ]);
  });
});
