import { describe, expect, it } from 'vitest';

import type { Document, Node } from '@src/types/generated/elementDocument';
import { applyLocalOps } from './documentLocalOps';
import { sceneElements } from './documentPatch';

const element = (id: string, x = 0): Node => ({
  type: 'element',
  id,
  kind: 'cursorTracker',
  frame: { x, y: 0, width: 10, height: 10, rotation: 0 },
  values: { mode: 'motion', sensitivity: 1 },
  bundles: { surface: { borderWidth: 1 } },
});

const document = (): Document => ({
  formatVersion: 1,
  kindVersions: {},
  scenes: {
    s: {
      nodes: [
        element('a'),
        { type: 'group', id: 'g', name: 'G', children: [element('b')] },
        element('c'),
      ],
    },
  },
});

const ids = (doc: Document) =>
  doc.scenes.s!.nodes.map((node) =>
    node.type === 'group'
      ? `${node.id}[${node.children.map((child) => child.id).join(',')}]`
      : node.id,
  );

const find = (doc: Document, id: string) =>
  sceneElements(doc.scenes.s!).find((node) => node.id === id);

describe('편집 창 낙관 적용', () => {
  it('위치·값·묶음·공통 정보를 바꾸고 다른 요소는 같은 객체로 둔다', () => {
    const before = document();
    const after = applyLocalOps(before, [
      { op: 'setFrame', scene: 's', id: 'b', frame: { x: 5, width: null } },
      { op: 'setValues', scene: 's', id: 'b', values: { sensitivity: 2 } },
      {
        op: 'setBundle',
        scene: 's',
        id: 'b',
        bundle: 'surface',
        fields: { borderRadius: 4 },
      },
      { op: 'setCommon', scene: 's', id: 'b', name: '이름', hidden: true },
    ]);
    expect(find(after, 'b')).toMatchObject({
      frame: { x: 5, y: 0, width: 10 },
      values: { mode: 'motion', sensitivity: 2 },
      bundles: { surface: { borderWidth: 1, borderRadius: 4 } },
      name: '이름',
      hidden: true,
    });
    expect(find(after, 'a')).toBe(find(before, 'a'));
    expect(find(before, 'b')?.frame.x).toBe(0);
  });

  it('공통 정보의 null은 지운다', () => {
    const named = applyLocalOps(document(), [
      { op: 'setCommon', scene: 's', id: 'a', name: '이름' },
    ]);
    const cleared = applyLocalOps(named, [
      { op: 'setCommon', scene: 's', id: 'a', name: null },
    ]);
    expect(find(cleared, 'a')?.name).toBeUndefined();
  });

  it('넣기·빼기는 트리 자리를 따르고 이미 있는 id는 다시 넣지 않는다', () => {
    const inserted = applyLocalOps(document(), [
      { op: 'insert', scene: 's', parent: 'g', index: 0, node: element('n') },
      {
        op: 'insert',
        scene: 's',
        parent: null,
        index: null,
        node: element('a'),
      },
    ]);
    expect(ids(inserted)).toEqual(['a', 'g[n,b]', 'c']);
    const removed = applyLocalOps(inserted, [
      { op: 'remove', scene: 's', ids: ['b', 'c'] },
    ]);
    expect(ids(removed)).toEqual(['a', 'g[n]']);
  });

  it('옮기기는 지금 겹치는 순서를 지킨 채 옮기기 전 목록 기준 자리에 놓는다', () => {
    const moved = applyLocalOps(document(), [
      { op: 'move', scene: 's', ids: ['c', 'a'], parent: null, index: 2 },
    ]);
    expect(ids(moved)).toEqual(['g[b]', 'a', 'c']);
    const intoGroup = applyLocalOps(document(), [
      { op: 'move', scene: 's', ids: ['a'], parent: 'g', index: null },
    ]);
    expect(ids(intoGroup)).toEqual(['g[b,a]', 'c']);
  });

  it('여기서 다루지 않는 연산과 없는 대상은 건너뛴다', () => {
    const before = document();
    const after = applyLocalOps(before, [
      { op: 'setFrame', scene: 's', id: 'missing', frame: { x: 1 } },
      { op: 'setFrame', scene: 'none', id: 'a', frame: { x: 1 } },
      { op: 'setInput', scene: 's', id: 'a', input: null },
      { op: 'ungroup', scene: 's', id: 'missing' },
    ]);
    expect(after.scenes.s).toBe(before.scenes.s);
  });

  it('빼기·옮기기로 비게 된 트리 그룹은 함께 지운다', () => {
    const removed = applyLocalOps(document(), [
      { op: 'remove', scene: 's', ids: ['b'] },
    ]);
    expect(ids(removed)).toEqual(['a', 'c']);
    const moved = applyLocalOps(document(), [
      { op: 'move', scene: 's', ids: ['b'], parent: null, index: null },
    ]);
    expect(ids(moved)).toEqual(['a', 'c', 'b']);
  });

  it('묶기는 엔진과 같이 가장 위 멤버 자리에, 멤버는 아래→위로 - 그룹 멤버의 자손은 따로 떼지 않는다', () => {
    const grouped = applyLocalOps(document(), [
      { op: 'group', scene: 's', id: 'n', name: 'N', ids: ['c', 'a'] },
    ]);
    expect(ids(grouped)).toEqual(['g[b]', 'n[a,c]']);
    const withGroup = applyLocalOps(document(), [
      { op: 'group', scene: 's', id: 'n', name: 'N', ids: ['g', 'b', 'a'] },
    ]);
    expect(ids(withGroup)).toEqual(['n[a,g]', 'c']);
    // 그룹 안 요소가 가장 위면 그 그룹 안에 - 비게 된 트리 그룹은 지운다
    const inner = applyLocalOps(document(), [
      { op: 'group', scene: 's', id: 'n', name: 'N', ids: ['a', 'b'] },
    ]);
    expect(ids(inner)).toEqual(['g[n]', 'c']);
  });

  it('풀기는 그룹 자리에 자식을 그대로, 그룹 정보는 이름·숨김만 바꾼다', () => {
    expect(
      ids(applyLocalOps(document(), [{ op: 'ungroup', scene: 's', id: 'g' }])),
    ).toEqual(['a', 'b', 'c']);
    const renamed = applyLocalOps(document(), [
      { op: 'setGroup', scene: 's', id: 'g', name: 'H', hidden: true },
    ]);
    const group = renamed.scenes.s!.nodes[1];
    expect(group.type === 'group' && [group.name, group.hidden]).toEqual([
      'H',
      true,
    ]);
  });
});
