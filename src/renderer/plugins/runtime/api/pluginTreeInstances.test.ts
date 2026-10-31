import { describe, expect, it } from 'vitest';

import type { Node, Scene } from '@src/types/generated/elementDocument';
import type { SavedInstance } from './pluginInstanceSnapshotApplier';
import {
  pluginInstanceOps,
  pluginInstancesFromTree,
} from './pluginTreeInstances';

const plugin = (
  id: string,
  frame: { x: number; y: number; width: number; height: number },
  extra: Record<string, unknown> = {},
): Node =>
  ({
    type: 'element',
    id: `demo::${id}`,
    kind: 'plugin:demo',
    frame: { ...frame, rotation: 0 },
    ...extra,
  } as Node);

const view = (scenes: Record<string, Node[]>) => ({
  getSceneIds: () => Object.keys(scenes),
  getScene: (sceneId: string): Scene | undefined =>
    scenes[sceneId] ? { nodes: scenes[sceneId] } : undefined,
});

const box = { x: 1, y: 2, width: 200, height: 150 };

describe('트리 → 플러그인 인스턴스', () => {
  it('플러그인 노드를 저장 모양으로 - 목록 순번대로, 그룹은 부모, 겹침값은 항목에서', () => {
    const scenes = view({
      '4key': [
        plugin(
          'b',
          { x: 5, y: 6, width: 30, height: 40 },
          {
            hidden: true,
            values: { label: 'B' },
            legacy: { pluginEntry: { zIndex: 3 }, order: 1 },
          },
        ),
        {
          type: 'group',
          id: 'g1',
          name: 'G',
          children: [plugin('a', box, { legacy: { order: 0 } })],
        },
        // 다른 플러그인·id 모양이 다른 노드는 뺀다
        { ...plugin('x', box), kind: 'plugin:other' } as Node,
      ],
      '5key': [plugin('n', box)],
    });
    expect(pluginInstancesFromTree(scenes, 'demo')).toEqual([
      {
        instanceId: 'a',
        position: { x: 1, y: 2 },
        tabId: '4key',
        hidden: false,
        groupId: 'g1',
      },
      {
        instanceId: 'b',
        position: { x: 5, y: 6 },
        tabId: '4key',
        hidden: true,
        measuredSize: { width: 30, height: 40 },
        settings: { label: 'B' },
        zIndex: 3,
      },
      // 순번이 없는(막 넣은) 노드는 끝에
      {
        instanceId: 'n',
        position: { x: 1, y: 2 },
        tabId: '5key',
        hidden: false,
      },
    ]);
  });

  it('기본 크기 틀은 측정 크기 없음 - 항목에 측정 크기가 있으면 있음', () => {
    const scenes = view({
      '4key': [
        plugin('a', box, {
          legacy: {
            pluginEntry: { measuredSize: { width: 200, height: 150 } },
          },
        }),
      ],
    });
    expect(pluginInstancesFromTree(scenes, 'demo')[0].measuredSize).toEqual({
      width: 200,
      height: 150,
    });
  });
});

const saved = (
  id: string,
  patch: Partial<SavedInstance> = {},
): [string, SavedInstance] => [
  `demo::${id}`,
  { instanceId: id, position: { x: 1, y: 2 }, tabId: '4key', ...patch },
];

describe('런타임 변경 → 트리 연산', () => {
  const scenes = view({
    '4key': [
      plugin(
        'a',
        { x: 1, y: 2, width: 30, height: 40 },
        {
          values: { label: 'A' },
          legacy: { pluginEntry: { instanceId: 'a', tabId: '4key' }, order: 0 },
        },
      ),
    ],
    '5key': [],
  });
  const before = new Map([
    saved('a', {
      measuredSize: { width: 30, height: 40 },
      settings: { label: 'A' },
      hidden: false,
    }),
  ]);

  it('바뀐 칸만 - 위치·크기는 틀, 숨김은 공통 정보, 설정은 바뀐 값만', () => {
    const next = new Map([
      saved('a', {
        position: { x: 9, y: 2 },
        measuredSize: { width: 30, height: 50 },
        settings: { label: 'B' },
        hidden: true,
      }),
    ]);
    expect(pluginInstanceOps(scenes, 'demo', before, next)).toEqual([
      {
        op: 'setFrame',
        scene: '4key',
        id: 'demo::a',
        frame: { x: 9, height: 50 },
      },
      { op: 'setCommon', scene: '4key', id: 'demo::a', hidden: true },
      { op: 'setValues', scene: '4key', id: 'demo::a', values: { label: 'B' } },
    ]);
  });

  it('트리와 같은 값·바뀌지 않은 칸은 쓰지 않는다', () => {
    expect(pluginInstanceOps(scenes, 'demo', before, before)).toEqual([]);
    // 기본값으로 채운 설정이 트리에 없어도 이번에 바뀌지 않았으면 쓰지 않는다
    const withDefaults = (x: number) =>
      new Map([
        saved('a', {
          position: { x, y: 2 },
          measuredSize: { width: 30, height: 40 },
          settings: { label: 'A', size: 3 },
          hidden: false,
        }),
      ]);
    expect(
      pluginInstanceOps(scenes, 'demo', withDefaults(1), withDefaults(4)),
    ).toEqual([
      { op: 'setFrame', scene: '4key', id: 'demo::a', frame: { x: 4 } },
    ]);
  });

  it('새 인스턴스는 넣고(크기는 측정 크기·없으면 기본), 사라진 인스턴스는 지운다', () => {
    const next = new Map([
      saved('n', { tabId: '5key', settings: { label: 'N' } }),
    ]);
    expect(pluginInstanceOps(scenes, 'demo', before, next)).toEqual([
      {
        op: 'insert',
        scene: '5key',
        parent: null,
        index: null,
        node: {
          type: 'element',
          id: 'demo::n',
          kind: 'plugin:demo',
          frame: { x: 1, y: 2, width: 200, height: 150, rotation: 0 },
          hidden: false,
          values: { label: 'N' },
          legacy: { pluginEntry: { instanceId: 'n', tabId: '5key' } },
        },
      },
      { op: 'remove', scene: '4key', ids: ['demo::a'] },
    ]);
  });

  it('탭·겹침값·그룹을 바꾸면 빼고 다시 넣는다 - 자리는 항목 값으로 백엔드가 정한다', () => {
    const next = new Map([
      saved('a', {
        tabId: '5key',
        measuredSize: { width: 30, height: 40 },
        settings: { label: 'A' },
        hidden: false,
        zIndex: 7,
        groupId: 'g9',
      }),
    ]);
    expect(pluginInstanceOps(scenes, 'demo', before, next)).toEqual([
      { op: 'remove', scene: '4key', ids: ['demo::a'] },
      {
        op: 'insert',
        scene: '5key',
        parent: null,
        index: null,
        node: {
          type: 'element',
          id: 'demo::a',
          kind: 'plugin:demo',
          frame: { x: 1, y: 2, width: 30, height: 40, rotation: 0 },
          hidden: false,
          values: { label: 'A' },
          // 원래 항목의 다른 칸·목록 순번은 지킨다
          legacy: {
            pluginEntry: {
              instanceId: 'a',
              tabId: '5key',
              zIndex: 7,
              groupId: 'g9',
            },
            order: 0,
          },
        },
      },
    ]);
  });
});
