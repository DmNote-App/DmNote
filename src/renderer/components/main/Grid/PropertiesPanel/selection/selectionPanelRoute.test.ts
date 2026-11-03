import { describe, expect, it } from 'vitest';

import {
  resolveSelectionPanelRoute,
  type SelectionPanelRouteInput,
} from './selectionPanelRoute';

const input = (
  overrides: Partial<SelectionPanelRouteInput>,
): SelectionPanelRouteInput => ({
  keyLikeCount: 0,
  graphCount: 0,
  knobCount: 0,
  spriteCount: 0,
  pluginCount: 0,
  hasSinglePosition: false,
  ...overrides,
});

describe('selectionPanelRoute native 단독 선택', () => {
  it('키 다중 선택은 batchKeyLike', () => {
    expect(resolveSelectionPanelRoute(input({ keyLikeCount: 2 }))).toEqual({
      kind: 'batchKeyLike',
    });
  });

  it('그래프+노브 혼합은 batchKeyLike', () => {
    expect(
      resolveSelectionPanelRoute(input({ graphCount: 1, knobCount: 1 })),
    ).toEqual({ kind: 'batchKeyLike' });
  });

  it('노브만 다중이면 batchKnobOnly', () => {
    expect(resolveSelectionPanelRoute(input({ knobCount: 2 }))).toEqual({
      kind: 'batchKnobOnly',
    });
  });

  it('그래프만 다중이면 batchGraphOnly', () => {
    expect(resolveSelectionPanelRoute(input({ graphCount: 3 }))).toEqual({
      kind: 'batchGraphOnly',
    });
  });

  // 하나 고른 패널은 종류와 상관없이 그 종류 정의의 패널 선언
  it.each([
    ['키·통계', { keyLikeCount: 1 }],
    ['그래프', { graphCount: 1 }],
    ['노브', { knobCount: 1 }],
  ] as const)('단일 %s는 single', (_label, counts) => {
    expect(
      resolveSelectionPanelRoute(input({ ...counts, hasSinglePosition: true })),
    ).toEqual({ kind: 'single' });
  });

  it('위치 미해결 단일 native는 none', () => {
    expect(resolveSelectionPanelRoute(input({ keyLikeCount: 1 }))).toEqual({
      kind: 'none',
    });
  });
});

describe('selectionPanelRoute 플러그인 단독 선택', () => {
  it('빈 선택은 none', () => {
    expect(resolveSelectionPanelRoute(input({}))).toEqual({ kind: 'none' });
  });

  it('단일 플러그인은 plugin', () => {
    expect(resolveSelectionPanelRoute(input({ pluginCount: 1 }))).toEqual({
      kind: 'plugin',
    });
  });

  it('다중 플러그인은 pluginBatch 경량 기하 배치', () => {
    expect(resolveSelectionPanelRoute(input({ pluginCount: 3 }))).toEqual({
      kind: 'pluginBatch',
    });
  });
});

describe('selectionPanelRoute 혼합 선택(네이티브+플러그인)', () => {
  it('키2+플러그인은 batchKeyLike', () => {
    expect(
      resolveSelectionPanelRoute(input({ keyLikeCount: 2, pluginCount: 1 })),
    ).toEqual({ kind: 'batchKeyLike' });
  });

  it('키1+플러그인도 총요소 기준으로 batchKeyLike', () => {
    expect(
      resolveSelectionPanelRoute(
        input({ keyLikeCount: 1, hasSinglePosition: true, pluginCount: 2 }),
      ),
    ).toEqual({ kind: 'batchKeyLike' });
  });

  it('노브1+플러그인은 batchKnobOnly', () => {
    expect(
      resolveSelectionPanelRoute(
        input({ knobCount: 1, hasSinglePosition: true, pluginCount: 1 }),
      ),
    ).toEqual({ kind: 'batchKnobOnly' });
  });

  it('노브 다중+플러그인은 batchKnobOnly', () => {
    expect(
      resolveSelectionPanelRoute(input({ knobCount: 2, pluginCount: 1 })),
    ).toEqual({ kind: 'batchKnobOnly' });
  });

  it('그래프1+플러그인은 batchGraphOnly', () => {
    expect(
      resolveSelectionPanelRoute(
        input({ graphCount: 1, hasSinglePosition: true, pluginCount: 1 }),
      ),
    ).toEqual({ kind: 'batchGraphOnly' });
  });

  it('그래프 다중+플러그인은 batchGraphOnly', () => {
    expect(
      resolveSelectionPanelRoute(input({ graphCount: 2, pluginCount: 2 })),
    ).toEqual({ kind: 'batchGraphOnly' });
  });

  it('그래프+노브+플러그인은 batchKeyLike', () => {
    expect(
      resolveSelectionPanelRoute(
        input({ graphCount: 1, knobCount: 1, pluginCount: 1 }),
      ),
    ).toEqual({ kind: 'batchKeyLike' });
  });

  it('위치 미해결 native+플러그인도 배치로 라우트한다', () => {
    // 기하 커밋 경로가 fail-closed라 미해결 대상은 커밋 없이 무시된다
    expect(
      resolveSelectionPanelRoute(input({ knobCount: 1, pluginCount: 1 })),
    ).toEqual({ kind: 'batchKnobOnly' });
  });
});

describe('selectionPanelRoute 스프라이트 선택', () => {
  it('단일 스프라이트는 single', () => {
    expect(
      resolveSelectionPanelRoute(
        input({ spriteCount: 1, hasSinglePosition: true }),
      ),
    ).toEqual({ kind: 'single' });
  });

  it('위치 미해결 단일 스프라이트는 none', () => {
    expect(resolveSelectionPanelRoute(input({ spriteCount: 1 }))).toEqual({
      kind: 'none',
    });
  });

  it('스프라이트만 다중이면 경량 기하 배치', () => {
    expect(resolveSelectionPanelRoute(input({ spriteCount: 2 }))).toEqual({
      kind: 'pluginBatch',
    });
  });

  it('스프라이트+플러그인은 경량 기하 배치', () => {
    expect(
      resolveSelectionPanelRoute(
        input({
          spriteCount: 1,
          hasSinglePosition: true,
          pluginCount: 1,
        }),
      ),
    ).toEqual({ kind: 'pluginBatch' });
  });

  it('스프라이트+키는 batchKeyLike', () => {
    expect(
      resolveSelectionPanelRoute(input({ spriteCount: 1, keyLikeCount: 1 })),
    ).toEqual({ kind: 'batchKeyLike' });
  });

  it('스프라이트+노브는 batchKnobOnly', () => {
    expect(
      resolveSelectionPanelRoute(input({ spriteCount: 1, knobCount: 1 })),
    ).toEqual({ kind: 'batchKnobOnly' });
  });

  it('스프라이트+그래프는 batchGraphOnly', () => {
    expect(
      resolveSelectionPanelRoute(input({ spriteCount: 1, graphCount: 1 })),
    ).toEqual({ kind: 'batchGraphOnly' });
  });

  it('스프라이트가 섞여도 단일 라우트로 새지 않는다', () => {
    expect(
      resolveSelectionPanelRoute(
        input({ spriteCount: 1, knobCount: 1, hasSinglePosition: true }),
      ),
    ).toEqual({ kind: 'batchKnobOnly' });
  });
});
