import { describe, expect, it } from 'vitest';

import { buildLayerLabels } from './layerPanelModel';

const plugin = (fullId: string, tabId?: string, hidden = false) =>
  ({
    id: fullId,
    fullId,
    pluginId: 'plugin-a',
    definitionId: 'plugin-a',
    position: { x: 0, y: 0 },
    tabId,
    zIndex: 1,
    hidden,
  } as never);

describe('레이어 패널 이름표', () => {
  it('현재 탭과 전역 플러그인만 넣고 숨김은 플러그인 스토어 값', () => {
    const labels = buildLayerLabels({
      selectedKeyType: '4key',
      positions: {},
      keyMappings: {},
      statPositions: {},
      graphPositions: {},
      knobPositions: {},
      spritePositions: {},
      pluginElements: [
        plugin('same', '4key', true),
        plugin('global'),
        plugin('other', '7key'),
      ],
    });
    expect([...labels.defaultNames.keys()].sort()).toEqual(['global', 'same']);
    expect(labels.pluginHidden.get('same')).toBe(true);
  });

  it('옛 종류는 저장된 레이어 이름과 상관없이 기본 이름 (키는 슬롯 이름)', () => {
    const labels = buildLayerLabels({
      selectedKeyType: '4key',
      positions: {
        '4key': [{ id: 'k1', layerName: '왼손' } as never],
      },
      keyMappings: { '4key': [''] },
      statPositions: {},
      graphPositions: {},
      knobPositions: { '4key': [{ id: 'n1' } as never] },
      spritePositions: {},
      pluginElements: [],
    });
    expect(labels.defaultNames.get('k1')).toBe('Key 1');
    expect(labels.defaultNames.get('n1')).toBe('Knob 1');
  });

  it('기본 이름 번호는 옛 배열 순번 - 겹침 순서를 바꿔도 이름이 그대로다 (예전과 같다)', () => {
    const knob = (id: string) => ({ id } as never);
    const labels = buildLayerLabels({
      selectedKeyType: '4key',
      positions: {},
      keyMappings: {},
      statPositions: {},
      graphPositions: {},
      // 트리 순서(겹침 순서)로 온 목록
      knobPositions: { '4key': [knob('second'), knob('first')] },
      spritePositions: {},
      pluginElements: [],
      storedIndexOf: (id) => (id === 'first' ? 0 : 1),
    });
    expect(labels.defaultNames.get('first')).toBe('Knob 1');
    expect(labels.defaultNames.get('second')).toBe('Knob 2');
  });
});
