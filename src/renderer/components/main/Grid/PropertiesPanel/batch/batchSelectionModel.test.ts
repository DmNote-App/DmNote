import { describe, expect, it } from 'vitest';
import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import { panelFieldViewOf } from '@src/renderer/elementKinds/runtime/fieldView';
import {
  createBatchSelectionModel,
  type BatchSelectionModelInput,
} from './batchSelectionModel';

const node = (
  id: string,
  kind: string,
  extra: Record<string, unknown> = {},
  width = 60,
) =>
  ({
    type: 'element',
    id,
    kind,
    frame: { x: 0, y: 0, width, height: 60, rotation: 0 },
    ...extra,
  } as unknown as ElementNode);

const createInput = (): BatchSelectionModelInput => {
  const nodes = [
    // 지금 칸 40, 보이는 칸(편집 미리보기) 60
    node('key-1', 'key', { input: { type: 'key', slot: 'LEFT SHIFT' } }, 40),
    node('stat-1', 'stat', { values: { statType: 'total' } }, 80),
    node('graph-1', 'graph', { values: { statType: 'kpsMax' } }),
    node('knob-1', 'knob', { input: { type: 'axis', axisId: 'axis' } }),
    node('sprite-1', 'sprite', {}, 200),
  ];
  const elements = new Map(nodes.map((element) => [element.id, element]));
  return {
    elementOf: (id) => elements.get(id),
    viewOf: (id) => {
      const element = elements.get(id);
      if (!element) return undefined;
      const view = panelFieldViewOf(element);
      return id === 'key-1' ? { ...view, width: 60 } : view;
    },
    selectedKeyElements: [{ type: 'key', id: 'key-1' }],
    selectedKeyLikeElements: [
      { type: 'key', id: 'key-1' },
      { type: 'stat', id: 'stat-1' },
    ],
    selectedGraphElements: [{ type: 'graph', id: 'graph-1' }],
    selectedKnobElements: [{ type: 'knob', id: 'knob-1' }],
    selectedBatchStyleElements: [
      { type: 'stat', id: 'stat-1' },
      { type: 'key', id: 'key-1' },
      { type: 'graph', id: 'graph-1' },
      { type: 'knob', id: 'knob-1' },
    ],
    selectedBatchGeometryElements: [
      { type: 'stat', id: 'stat-1' },
      { type: 'key', id: 'key-1' },
      { type: 'graph', id: 'graph-1' },
      { type: 'knob', id: 'knob-1' },
      { type: 'sprite', id: 'sprite-1' },
    ],
  };
};

describe('createBatchSelectionModel', () => {
  it('유형별 선택 데이터를 트리 요소 id와 선택 순서로 해석한다', () => {
    const model = createBatchSelectionModel(createInput());

    expect(
      model.getSelectedKeysData().map(({ position }) => position.id),
    ).toEqual(['key-1', 'stat-1']);
    expect(model.getSelectedKeysData()[0]).toMatchObject({
      keyCode: 'LEFT SHIFT',
      keyInfo: { displayName: 'LShift' },
    });
    expect(model.getSelectedKeysData()[1].keyInfo?.displayName).toBe('Total');
    expect(
      model
        .getSelectedBatchStyleData()
        .map(({ keyInfo }) => keyInfo?.displayName),
    ).toEqual(['Total', 'LShift', 'MAX Graph', 'Knob']);
    expect(
      model.getSelectedBatchStyleData().map(({ position }) => position.id),
    ).toEqual(['stat-1', 'key-1', 'graph-1', 'knob-1']);
  });

  it('보이는 칸과 지금 칸(미리보기 없음)의 혼합 값 계산을 분리한다', () => {
    const input = createInput();
    input.selectedKeyLikeElements = [{ type: 'key', id: 'key-1' }];
    const model = createBatchSelectionModel(input);

    expect(model.getMixedValue((position) => position.width, 0)).toEqual({
      isMixed: false,
      value: 60,
    });
    expect(
      model.getMixedValueCanonical((position) => position.width, 0),
    ).toEqual({ isMixed: false, value: 40 });
  });

  // 크기 입력은 resize 대상 집합을 읽는다 - 스타일 집합만 보면 스프라이트 값이 가려진다
  it('크기 혼합 값은 스프라이트를 포함한 기하 집합에서 집계한다', () => {
    const input = createInput();
    input.selectedBatchStyleElements = [{ type: 'key', id: 'key-1' }];
    input.selectedBatchGeometryElements = [
      { type: 'key', id: 'key-1' },
      { type: 'sprite', id: 'sprite-1' },
    ];
    const model = createBatchSelectionModel(input);

    expect(model.getMixedValueBatch((position) => position.width, 0)).toEqual({
      isMixed: false,
      value: 60,
    });
    expect(
      model.getMixedValueGeometry((position) => position.width, 0),
    ).toEqual({ isMixed: true, value: 60 });
  });

  it('트리에 없거나 종류가 다른 id를 제외하고 생성 시점의 선택 snapshot을 재사용한다', () => {
    const input = createInput();
    input.selectedKeyLikeElements = [
      { type: 'stat', id: 'missing-stat' },
      ...input.selectedKeyLikeElements,
      { type: 'key', id: 'missing-key' },
      // 키 몫으로 온 스탯 id
      { type: 'key', id: 'stat-1' },
    ];
    input.selectedGraphElements = [
      { type: 'graph', id: 'missing-graph' },
      ...input.selectedGraphElements,
    ];
    const model = createBatchSelectionModel(input);

    expect(model.getSelectedKeysData()).toBe(model.getSelectedKeysData());
    expect(
      model.getSelectedKeysData().map(({ position }) => position.id),
    ).toEqual(['key-1', 'stat-1']);
    expect(
      model
        .getSelectedBatchStyleData()
        .filter(({ position }) => position.id.startsWith('graph'))
        .map(({ position }) => position.id),
    ).toEqual(['graph-1']);
  });

  it('슬롯 없는 키는 키 코드가 빈 값이고 키 정보가 없다', () => {
    const input = createInput();
    const unbound = node('key-2', 'key', { input: { type: 'key', slot: '' } });
    const elementOf = input.elementOf;
    const viewOf = input.viewOf;
    input.elementOf = (id) => (id === 'key-2' ? unbound : elementOf(id));
    input.viewOf = (id) =>
      id === 'key-2' ? panelFieldViewOf(unbound) : viewOf(id);
    input.selectedKeyLikeElements = [{ type: 'key', id: 'key-2' }];
    const model = createBatchSelectionModel(input);

    expect(model.getSelectedKeysData()[0]).toMatchObject({
      keyCode: '',
      keyInfo: null,
    });
  });
});
