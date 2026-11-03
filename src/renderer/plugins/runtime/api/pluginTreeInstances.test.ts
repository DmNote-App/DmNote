import { describe, expect, it } from 'vitest';

import type { Node, Scene } from '@src/types/generated/elementDocument';
import type { SavedInstance } from './pluginInstanceSnapshotApplier';
import {
  pluginInstanceOps,
  pluginInstancesFromTree,
  splitBackendPlacedOps,
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

  it('그룹을 바꾸면 화면에 바로 그 그룹 안으로 넣는다 (장면에 없는 그룹은 맨 위 단계)', () => {
    const grouped = view({
      '4key': [
        { type: 'group', id: 'g1', name: 'G', children: [] } as Node,
        plugin(
          'a',
          { x: 1, y: 2, width: 30, height: 40 },
          {
            values: { label: 'A' },
            legacy: {
              pluginEntry: { instanceId: 'a', tabId: '4key' },
              order: 0,
            },
          },
        ),
      ],
    });
    const regroup = (groupId: string) =>
      pluginInstanceOps(
        grouped,
        'demo',
        before,
        new Map([
          saved('a', {
            measuredSize: { width: 30, height: 40 },
            settings: { label: 'A' },
            hidden: false,
            groupId,
          }),
        ]),
      )[1] as { parent: string | null };
    expect(regroup('g1').parent).toBe('g1');
    expect(regroup('missing').parent).toBeNull();
  });

  it('설정 칸을 빼면 같은 자리에 빼고 다시 넣어 값을 통째로 바꾼다 (값 쓰기는 합치기라)', () => {
    const withTwo = view({
      '4key': [
        plugin('z', box),
        plugin(
          'a',
          { x: 1, y: 2, width: 30, height: 40 },
          {
            values: { label: 'A', size: 3 },
            legacy: {
              pluginEntry: { instanceId: 'a', tabId: '4key' },
              order: 0,
            },
          },
        ),
      ],
    });
    const two = new Map([
      saved('a', {
        measuredSize: { width: 30, height: 40 },
        settings: { label: 'A', size: 3 },
        hidden: false,
      }),
    ]);
    const ops = pluginInstanceOps(
      withTwo,
      'demo',
      two,
      new Map([
        saved('a', {
          measuredSize: { width: 30, height: 40 },
          settings: { label: 'A' },
          hidden: false,
        }),
      ]),
    );
    expect(ops).toEqual([
      { op: 'remove', scene: '4key', ids: ['demo::a'] },
      {
        op: 'insert',
        scene: '4key',
        parent: null,
        index: 1,
        node: {
          type: 'element',
          id: 'demo::a',
          kind: 'plugin:demo',
          frame: { x: 1, y: 2, width: 30, height: 40, rotation: 0 },
          hidden: false,
          values: { label: 'A' },
          legacy: { pluginEntry: { instanceId: 'a', tabId: '4key' }, order: 0 },
        },
      },
    ]);
  });
});

describe('백엔드가 자리를 정하는 다시 넣기', () => {
  const scenes = view({
    '4key': [
      plugin('a', box, {
        legacy: { pluginEntry: { instanceId: 'a', tabId: '4key' }, order: 0 },
      }),
      plugin('b', box, {
        legacy: { pluginEntry: { instanceId: 'b', tabId: '4key' }, order: 1 },
      }),
    ],
    '5key': [],
  });
  const before = new Map([saved('a'), saved('b'), saved('c')]);

  it('겹침값을 실은 다시 넣기와 그 빼기만 나누고, 화면에는 같은 부모의 지금 자리에 둔다', () => {
    const next = new Map([
      saved('a', { zIndex: 5 }),
      saved('b', { tabId: '5key', position: { x: 9, y: 2 } }),
      saved('d', { zIndex: 3 }),
    ]);
    const ops = pluginInstanceOps(scenes, 'demo', before, next);
    const { placed, placedLocal, local } = splitBackendPlacedOps(
      scenes,
      'demo',
      ops,
    );
    expect(
      placed.flatMap((op) =>
        op.op === 'remove' ? op.ids : op.op === 'insert' ? [op.node.id] : [],
      ),
    ).toEqual(['demo::a', 'demo::a', 'demo::d']);
    // 보내기는 백엔드가 자리를 정하게 index 없이, 화면은 a를 지금 자리(0)에 - 새 d는 자리를 몰라 맨 위
    const indexOf = (list: typeof placed) =>
      list.flatMap((op) => (op.op === 'insert' ? [op.index] : []));
    expect(indexOf(placed)).toEqual([null, null]);
    expect(indexOf(placedLocal)).toEqual([0, null]);
    // 겹침값 없는 탭 옮기기는 맨 위에 놓여 백엔드 놓기와 같다
    expect(local.map((op) => op.op)).toEqual(['remove', 'insert']);
    expect(placed.length + local.length).toBe(ops.length);
  });

  it('화면 자리는 같은 묶음에서 먼저 얹히는 연산(이어 붙이는 편집, 앞의 다시 넣기)을 적용한 뒤 기준이다', () => {
    const three = view({
      '4key': ['a', 'b', 'c'].map((id, order) =>
        plugin(id, box, {
          legacy: { pluginEntry: { instanceId: id, tabId: '4key' }, order },
        }),
      ),
      '5key': [],
    });
    const all = new Map([saved('a'), saved('b'), saved('c')]);
    const localIndexOf = (next: Map<string, SavedInstance>) =>
      splitBackendPlacedOps(
        three,
        'demo',
        pluginInstanceOps(three, 'demo', all, next),
      ).placedLocal.flatMap((op) =>
        op.op === 'insert' ? [[op.node.id, op.index]] : [],
      );
    // 아래 형제 a를 지우면(이어 붙이는 편집이 먼저 얹힌다) b는 한 칸 내려온 자리
    expect(
      localIndexOf(new Map([saved('b', { zIndex: 5 }), saved('c')])),
    ).toEqual([['demo::b', 0]]);
    // 앞의 다시 넣기가 같은 부모를 떠나도 같다
    expect(
      localIndexOf(
        new Map([
          saved('a', { tabId: '5key', zIndex: 1 }),
          saved('b', { zIndex: 5 }),
          saved('c'),
        ]),
      ),
    ).toEqual([
      ['demo::a', null],
      ['demo::b', 0],
    ]);
  });

  it('다시 넣기 묶음 중간에 빈 그룹은 정리하지 않는다 - 화면도 묶음 끝에서 한 번 정리한다', () => {
    // 옛 그룹 표시가 아직 없는 그룹 G의 유일한 자식 x와 그 위 y를 함께 다시 넣는다
    const grouped = view({
      '4key': [
        {
          type: 'group',
          id: 'G',
          name: 'G',
          children: [
            plugin('x', box, {
              legacy: {
                pluginEntry: { instanceId: 'x', tabId: '4key', zIndex: 1 },
                order: 0,
              },
            }),
          ],
        },
        plugin('y', box, {
          legacy: {
            pluginEntry: { instanceId: 'y', tabId: '4key', zIndex: 2 },
            order: 1,
          },
        }),
      ],
    });
    const ops = pluginInstanceOps(
      grouped,
      'demo',
      new Map([
        saved('x', { zIndex: 1, groupId: 'G' }),
        saved('y', { zIndex: 2 }),
      ]),
      new Map([
        saved('x', { zIndex: 3, groupId: 'G' }),
        saved('y', { zIndex: 4 }),
      ]),
    );
    expect(
      splitBackendPlacedOps(grouped, 'demo', ops).placedLocal.flatMap((op) =>
        op.op === 'insert' ? [[op.node.id, op.parent, op.index]] : [],
      ),
    ).toEqual([
      ['demo::x', 'G', 0],
      ['demo::y', null, 1],
    ]);
  });

  it('겹침값을 실은 다시 넣기가 없으면 그대로 돌려준다', () => {
    const ops = pluginInstanceOps(
      scenes,
      'demo',
      before,
      new Map([saved('a', { position: { x: 3, y: 4 } }), saved('b')]),
    );
    expect(splitBackendPlacedOps(scenes, 'demo', ops)).toEqual({
      placed: [],
      placedLocal: [],
      local: ops,
    });
  });
});
