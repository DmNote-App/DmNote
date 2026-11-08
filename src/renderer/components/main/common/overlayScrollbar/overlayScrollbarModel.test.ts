import { describe, expect, it } from 'vitest';

import {
  computeThumbGeometry,
  resolveOverlayScrollbarState,
  resolveTrackPressTarget,
  scrollOffsetForThumbDrag,
  wheelDeltaToPixels,
} from './overlayScrollbarModel';

describe('computeThumbGeometry', () => {
  it('넘치지 않으면 썸이 트랙을 채우고 범위는 0', () => {
    const g = computeThumbGeometry({
      viewportSize: 400,
      contentSize: 400,
      scrollOffset: 0,
      trackSize: 392,
      minThumbSize: 28,
    });
    expect(g.range).toBe(0);
    expect(g.overflow).toBe(false);
    expect(g.size).toBe(392);
    expect(g.offset).toBe(0);
  });

  it('1px 이하 차이는 서브픽셀 반올림으로 보고 넘침으로 치지 않음', () => {
    const g = computeThumbGeometry({
      viewportSize: 400,
      contentSize: 401,
      scrollOffset: 0,
      trackSize: 392,
      minThumbSize: 28,
    });
    expect(g.overflow).toBe(false);
  });

  it('썸 길이는 보이는 비율, 위치는 스크롤 비율을 따름', () => {
    const g = computeThumbGeometry({
      viewportSize: 400,
      contentSize: 1600,
      scrollOffset: 600,
      trackSize: 400,
      minThumbSize: 28,
    });
    expect(g.overflow).toBe(true);
    expect(g.range).toBe(1200);
    expect(g.size).toBe(100);
    expect(g.travel).toBe(300);
    expect(g.offset).toBe(150);
  });

  it('콘텐츠가 아주 길어도 최소 길이 아래로 줄지 않음', () => {
    const g = computeThumbGeometry({
      viewportSize: 300,
      contentSize: 30000,
      scrollOffset: 29700,
      trackSize: 292,
      minThumbSize: 28,
    });
    expect(g.size).toBe(28);
    expect(g.offset).toBe(264);
  });

  it('트랙이 최소 길이보다 짧으면 트랙 길이에서 멈춤', () => {
    const g = computeThumbGeometry({
      viewportSize: 20,
      contentSize: 200,
      scrollOffset: 0,
      trackSize: 12,
      minThumbSize: 28,
    });
    expect(g.size).toBe(12);
    expect(g.travel).toBe(0);
  });

  it('오버스크롤 값은 트랙 안으로 묶음', () => {
    const base = {
      viewportSize: 400,
      contentSize: 1600,
      trackSize: 400,
      minThumbSize: 28,
    };
    expect(computeThumbGeometry({ ...base, scrollOffset: -40 }).offset).toBe(0);
    expect(computeThumbGeometry({ ...base, scrollOffset: 1300 }).offset).toBe(
      300,
    );
  });
});

describe('scrollOffsetForThumbDrag', () => {
  it('썸 이동량을 콘텐츠 이동량으로 환산', () => {
    expect(
      scrollOffsetForThumbDrag({
        startScroll: 600,
        pointerDelta: 30,
        range: 1200,
        travel: 300,
      }),
    ).toBe(720);
  });

  it('범위 밖으로 끌면 양 끝에서 멈춤', () => {
    const base = { startScroll: 600, range: 1200, travel: 300 };
    expect(scrollOffsetForThumbDrag({ ...base, pointerDelta: -999 })).toBe(0);
    expect(scrollOffsetForThumbDrag({ ...base, pointerDelta: 999 })).toBe(1200);
  });

  it('썸이 움직일 공간이 없으면 시작 위치 유지', () => {
    expect(
      scrollOffsetForThumbDrag({
        startScroll: 40,
        pointerDelta: 50,
        range: 100,
        travel: 0,
      }),
    ).toBe(40);
  });
});

describe('resolveTrackPressTarget', () => {
  const geometry = computeThumbGeometry({
    viewportSize: 400,
    contentSize: 1600,
    scrollOffset: 600,
    trackSize: 400,
    minThumbSize: 28,
  });

  it('썸 위를 누르면 한 화면 위로', () => {
    expect(
      resolveTrackPressTarget({
        pointer: 40,
        geometry,
        scrollOffset: 600,
        viewportSize: 400,
        jumpToSpot: false,
      }),
    ).toBe(240);
  });

  it('썸 아래를 누르면 한 화면 아래로', () => {
    expect(
      resolveTrackPressTarget({
        pointer: 380,
        geometry,
        scrollOffset: 600,
        viewportSize: 400,
        jumpToSpot: false,
      }),
    ).toBe(960);
  });

  it('한 화면 이동도 범위 끝에서 멈춤', () => {
    expect(
      resolveTrackPressTarget({
        pointer: 380,
        geometry,
        scrollOffset: 1100,
        viewportSize: 400,
        jumpToSpot: false,
      }),
    ).toBe(1200);
  });

  it('보조키를 누르면 썸 가운데가 누른 자리에 오도록 이동', () => {
    expect(
      resolveTrackPressTarget({
        pointer: 350,
        geometry,
        scrollOffset: 600,
        viewportSize: 400,
        jumpToSpot: true,
      }),
    ).toBe(1200);
    expect(
      resolveTrackPressTarget({
        pointer: 200,
        geometry,
        scrollOffset: 600,
        viewportSize: 400,
        jumpToSpot: true,
      }),
    ).toBe(600);
  });

  it('썸 위를 눌렀으면 이동하지 않음', () => {
    expect(
      resolveTrackPressTarget({
        pointer: 200,
        geometry,
        scrollOffset: 600,
        viewportSize: 400,
        jumpToSpot: false,
      }),
    ).toBeNull();
  });
});

describe('resolveOverlayScrollbarState', () => {
  const base = {
    overflow: true,
    dragging: false,
    hovering: false,
    revealed: false,
  };

  it('넘치지 않으면 다른 입력과 무관하게 none', () => {
    expect(
      resolveOverlayScrollbarState({
        ...base,
        overflow: false,
        dragging: true,
        hovering: true,
      }),
    ).toBe('none');
  });

  it('끄는 중이 호버보다 우선', () => {
    expect(
      resolveOverlayScrollbarState({ ...base, dragging: true, hovering: true }),
    ).toBe('dragging');
  });

  it('호버는 굵게, 스크롤 직후는 얇게, 그 밖은 숨김', () => {
    expect(resolveOverlayScrollbarState({ ...base, hovering: true })).toBe(
      'expanded',
    );
    expect(resolveOverlayScrollbarState({ ...base, revealed: true })).toBe(
      'thin',
    );
    expect(resolveOverlayScrollbarState(base)).toBe('hidden');
  });
});

describe('wheelDeltaToPixels', () => {
  it('픽셀·줄·페이지 단위를 픽셀로', () => {
    expect(wheelDeltaToPixels(12, 0, 300)).toBe(12);
    expect(wheelDeltaToPixels(3, 1, 300)).toBe(48);
    expect(wheelDeltaToPixels(1, 2, 300)).toBe(300);
  });
});
