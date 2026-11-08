// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createOverlayScrollbarController } from './overlayScrollbarController';

const lenisMocks = vi.hoisted(() => ({
  scrollLenisTo: vi.fn(),
  getWrapperLenis: vi.fn(() => undefined),
  forwardWheelToLenis: vi.fn(() => true),
}));

vi.mock('@hooks/useLenis', () => lenisMocks);
vi.mock('@utils/core/platform', () => ({ isMac: () => false }));

// jsdom에는 레이아웃이 없어 박스 값을 직접 심는다
const setBox = (element: HTMLElement, box: Record<string, unknown>) => {
  Object.entries(box).forEach(([key, value]) => {
    Object.defineProperty(element, key, { configurable: true, value });
  });
};

const pointer = (type: string, init: Record<string, unknown> = {}) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    ...init,
  });
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    pointerType: { value: 'mouse' },
  });
  return event;
};

class ResizeObserverStub {
  static instances: ResizeObserverStub[] = [];
  constructor(public callback: () => void) {
    ResizeObserverStub.instances.push(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('createOverlayScrollbarController', () => {
  let host: HTMLDivElement;
  let rail: HTMLDivElement;
  let thumb: HTMLDivElement;
  let view: Window & typeof globalThis;

  const addViewport = (box: Record<string, unknown>) => {
    const viewport = document.createElement('div');
    viewport.style.overflowY = 'auto';
    viewport.append(document.createElement('div'));
    setBox(viewport, {
      clientWidth: 240,
      clientTop: 0,
      clientLeft: 0,
      offsetTop: 0,
      offsetLeft: 0,
      offsetParent: host,
      ...box,
    });
    host.insertBefore(viewport, rail);
    return viewport;
  };

  const create = () => createOverlayScrollbarController(rail, thumb, view);

  beforeEach(() => {
    vi.useFakeTimers();
    Object.values(lenisMocks).forEach((mock) => mock.mockClear());
    // 실패한 테스트가 바꾼 반환값이 다음 테스트로 새지 않게
    lenisMocks.getWrapperLenis.mockReturnValue(undefined);
    lenisMocks.forwardWheelToLenis.mockReturnValue(true);
    ResizeObserverStub.instances = [];
    view = Object.assign(Object.create(window), {
      ResizeObserver: ResizeObserverStub,
      MutationObserver: window.MutationObserver,
      getComputedStyle: window.getComputedStyle.bind(window),
      setTimeout: window.setTimeout.bind(window),
      clearTimeout: window.clearTimeout.bind(window),
    });
    host = document.createElement('div');
    host.style.position = 'relative';
    rail = document.createElement('div');
    thumb = document.createElement('div');
    rail.append(thumb);
    host.append(rail);
    document.body.append(host);
    setBox(rail, { offsetWidth: 10, offsetHeight: 400 });
    rail.getBoundingClientRect = () =>
      ({
        top: 0,
        bottom: 400,
        left: 230,
        right: 240,
        height: 400,
        width: 10,
      } as DOMRect);
    const captured = new Set<number>();
    HTMLElement.prototype.setPointerCapture = (id: number) => {
      captured.add(id);
    };
    HTMLElement.prototype.releasePointerCapture = (id: number) => {
      captured.delete(id);
    };
    HTMLElement.prototype.hasPointerCapture = (id: number) => captured.has(id);
  });

  afterEach(() => {
    host.remove();
    vi.useRealTimers();
  });

  it('열릴 때는 숨은 채로 두고, 스크롤하면 얇게 드러났다가 대기 시간 뒤 숨는다', () => {
    const viewport = addViewport({ clientHeight: 400, scrollHeight: 1600 });
    const controller = create();
    expect(rail.dataset.state).toBe('hidden');
    viewport.scrollTop = 40;
    viewport.dispatchEvent(new Event('scroll'));
    expect(rail.dataset.state).toBe('thin');
    vi.advanceTimersByTime(899);
    expect(rail.dataset.state).toBe('thin');
    vi.advanceTimersByTime(1);
    expect(rail.dataset.state).toBe('hidden');
    controller.destroy();
  });

  it('넘치지 않으면 none', () => {
    addViewport({ clientHeight: 400, scrollHeight: 400 });
    const controller = create();
    expect(rail.dataset.state).toBe('none');
    controller.destroy();
  });

  it('숨은 keepalive 뷰포트는 건너뛰고 보이는 쪽에 맞춘다', () => {
    addViewport({ clientHeight: 0, scrollHeight: 0 });
    addViewport({ clientHeight: 400, scrollHeight: 1600, offsetTop: 20 });
    const controller = create();
    // 트랙 392(400 - 여백 4×2) × 보이는 비율 1/4
    expect(thumb.style.height).toBe('98px');
    expect(rail.style.top).toBe('20px');
    expect(rail.style.left).toBe('230px');
    expect(rail.style.height).toBe('400px');
    controller.destroy();
  });

  it('railLeft를 주면 뷰포트 기준 그 위치에 레일을 둔다', () => {
    addViewport({ clientHeight: 400, scrollHeight: 1600, offsetLeft: 8 });
    const controller = create();
    controller.setOptions({ inert: false, railLeft: 100, placement: 'edge' });
    expect(rail.style.left).toBe('108px');
    controller.destroy();
  });

  it('스크롤하면 썸이 따라가고 다시 드러난다', () => {
    const viewport = addViewport({ clientHeight: 400, scrollHeight: 1600 });
    const controller = create();
    vi.advanceTimersByTime(900);
    expect(rail.dataset.state).toBe('hidden');

    viewport.scrollTop = 600;
    viewport.dispatchEvent(new Event('scroll'));
    // 여백 4 + 진행 1/2 × 이동 거리 294
    expect(thumb.style.transform).toBe('translate3d(0, 151px, 0)');
    expect(rail.dataset.state).toBe('thin');
    controller.destroy();
  });

  it('가장자리 띠에 포인터가 닿으면 숨어 있어도 굵게 드러나고, 떠나면 얇게 남았다가 숨는다', () => {
    addViewport({ clientHeight: 400, scrollHeight: 1600 });
    const controller = create();
    expect(rail.dataset.state).toBe('hidden');
    rail.dispatchEvent(pointer('pointerenter'));
    expect(rail.dataset.state).toBe('expanded');
    vi.advanceTimersByTime(2000);
    expect(rail.dataset.state).toBe('expanded');
    rail.dispatchEvent(pointer('pointerleave'));
    expect(rail.dataset.state).toBe('thin');
    vi.advanceTimersByTime(900);
    expect(rail.dataset.state).toBe('hidden');
    controller.destroy();
  });

  it('outside 배치는 부모 상자 바깥 오른쪽에 부모 높이만큼 붙는다', () => {
    addViewport({
      clientHeight: 392,
      scrollHeight: 1568,
      offsetTop: 4,
      offsetLeft: 4,
    });
    setBox(host, { clientWidth: 216, clientHeight: 400 });
    const controller = create();
    controller.setOptions({
      inert: false,
      railLeft: undefined,
      placement: 'outside',
    });
    expect(rail.style.left).toBe('216px');
    expect(rail.style.top).toBe('0px');
    expect(rail.style.height).toBe('400px');
    // 트랙은 부모 높이에서 여백 4×2를 뺀 392, 보이는 비율 1/4
    expect(thumb.style.height).toBe('98px');
    controller.destroy();
  });

  // 실제 Lenis처럼 resize()는 목표 지점을 현재 위치로 덮고 'scroll'을 동기로 낸다.
  // 한도만 다시 재는 dimensions.resize()는 이벤트를 내지 않는다
  const mockLenis = (order: string[] = []) => {
    let onLenisScroll: (() => void) | undefined;
    const lenis = {
      on: vi.fn((_event: string, callback: () => void) => {
        onLenisScroll = callback;
        return () => {};
      }),
      resize: vi.fn(() => {
        order.push('resize');
        onLenisScroll?.();
      }),
      dimensions: {
        resize: vi.fn(() => {
          order.push('dimensions');
        }),
      },
      emitScroll: () => onLenisScroll?.(),
    };
    lenisMocks.getWrapperLenis.mockReturnValue(lenis as never);
    return lenis;
  };

  it('깊은 자손만 커졌으면 휠을 Lenis보다 먼저 받아 한도를 다시 재게 한다', () => {
    const viewport = addViewport({ clientHeight: 400, scrollHeight: 400 });
    const order: string[] = [];
    const lenis = mockLenis(order);
    const controller = create();
    expect(lenis.on).toHaveBeenCalledWith('scroll', expect.any(Function));
    viewport.addEventListener('wheel', () => order.push('lenis-wheel'));
    order.length = 0;

    setBox(viewport, { scrollHeight: 800 });
    viewport.dispatchEvent(
      new WheelEvent('wheel', { deltaY: 40, bubbles: true }),
    );
    expect(order).toEqual(['dimensions', 'lenis-wheel']);
    // 크기만 다시 잰다. 드러내는 건 이어지는 실제 스크롤이 맡는다
    expect(rail.dataset.state).toBe('hidden');
    expect(thumb.style.height).toBe('196px');
    controller.destroy();
  });

  it('부드러운 스크롤 중에 높이가 바뀌어도 Lenis 목표 지점을 덮지 않는다', () => {
    const viewport = addViewport({ clientHeight: 400, scrollHeight: 1600 });
    const lenis = mockLenis();
    const controller = create();
    setBox(viewport, { scrollHeight: 2000 });
    lenis.emitScroll();
    expect(lenis.resize).not.toHaveBeenCalled();
    expect(lenis.dimensions.resize).toHaveBeenCalled();
    controller.destroy();
  });

  it('관찰자가 잡은 크기 변화도 Lenis 한도에 반영한다', () => {
    const viewport = addViewport({ clientHeight: 400, scrollHeight: 400 });
    const lenis = mockLenis();
    const controller = create();
    lenis.dimensions.resize.mockClear();

    setBox(viewport, { scrollHeight: 1600 });
    ResizeObserverStub.instances.forEach((observer) => observer.callback());
    expect(lenis.dimensions.resize).toHaveBeenCalledTimes(1);
    expect(thumb.style.height).toBe('98px');

    // 이미 반영된 크기라 다음 휠에서 다시 재지 않는다
    viewport.dispatchEvent(
      new WheelEvent('wheel', { deltaY: 40, bubbles: true }),
    );
    expect(lenis.dimensions.resize).toHaveBeenCalledTimes(1);
    expect(lenis.resize).not.toHaveBeenCalled();
    controller.destroy();
  });

  it('직계 자식 박스는 그대로이고 깊은 자손만 커져도 스크롤 때 다시 잰다', () => {
    const viewport = addViewport({ clientHeight: 400, scrollHeight: 1600 });
    const controller = create();
    expect(thumb.style.height).toBe('98px');
    setBox(viewport, { scrollHeight: 3200 });
    viewport.scrollTop = 10;
    viewport.dispatchEvent(new Event('scroll'));
    expect(thumb.style.height).toBe('49px');
    controller.destroy();
  });

  it('처음엔 넘치지 않다가 깊은 자손이 커지면 스크롤 때 막대가 생긴다', () => {
    const viewport = addViewport({ clientHeight: 400, scrollHeight: 400 });
    const controller = create();
    expect(rail.dataset.state).toBe('none');
    setBox(viewport, { scrollHeight: 800 });
    viewport.scrollTop = 20;
    viewport.dispatchEvent(new Event('scroll'));
    expect(rail.dataset.state).toBe('thin');
    expect(thumb.style.height).toBe('196px');
    controller.destroy();
  });

  it('썸을 끌면 이동량을 콘텐츠 거리로 바꿔 즉시 스크롤한다', () => {
    const viewport = addViewport({ clientHeight: 400, scrollHeight: 1600 });
    const controller = create();
    thumb.dispatchEvent(pointer('pointerdown', { clientY: 50 }));
    expect(rail.dataset.state).toBe('dragging');
    thumb.dispatchEvent(pointer('pointermove', { clientY: 99 }));
    // 49px × 범위 1200 / 이동 거리 294
    expect(lenisMocks.scrollLenisTo).toHaveBeenLastCalledWith(viewport, 200, {
      immediate: true,
    });
    thumb.dispatchEvent(pointer('pointerup', { clientX: 500, clientY: 99 }));
    expect(rail.dataset.state).toBe('thin');
    controller.destroy();
  });

  it('트랙을 누르면 한 화면 넘기고 감속을 탄다', () => {
    const viewport = addViewport({ clientHeight: 400, scrollHeight: 1600 });
    const controller = create();
    rail.dispatchEvent(pointer('pointerdown', { clientY: 380 }));
    expect(lenisMocks.scrollLenisTo).toHaveBeenCalledWith(viewport, 360, {
      immediate: false,
    });
    controller.destroy();
  });

  it('Shift로 누르면 그 자리로 바로 가고 놓기 전까지 끌 수 있다', () => {
    const viewport = addViewport({ clientHeight: 400, scrollHeight: 1600 });
    const controller = create();
    rail.dispatchEvent(
      pointer('pointerdown', { clientY: 4 + 294 / 2 + 49, shiftKey: true }),
    );
    expect(lenisMocks.scrollLenisTo).toHaveBeenCalledWith(viewport, 600, {
      immediate: true,
    });
    expect(rail.dataset.state).toBe('dragging');
    controller.destroy();
  });

  it('inert면 포인터에 반응하지 않는다', () => {
    addViewport({ clientHeight: 400, scrollHeight: 1600 });
    const controller = create();
    controller.setOptions({
      inert: true,
      railLeft: undefined,
      placement: 'edge',
    });
    expect(rail.hasAttribute('data-inert')).toBe(true);
    rail.dispatchEvent(pointer('pointerenter'));
    expect(rail.dataset.state).toBe('hidden');
    thumb.dispatchEvent(pointer('pointerdown', { clientY: 50 }));
    expect(rail.dataset.state).toBe('hidden');
    controller.destroy();
  });

  it('레일에 떨어진 휠은 스크롤 영역으로 넘기고 부모로 올리지 않는다', () => {
    const viewport = addViewport({ clientHeight: 400, scrollHeight: 1600 });
    const controller = create();
    const parentWheel = vi.fn();
    document.body.addEventListener('wheel', parentWheel);
    const wheel = new WheelEvent('wheel', {
      deltaY: 40,
      bubbles: true,
      cancelable: true,
    });
    rail.dispatchEvent(wheel);
    expect(lenisMocks.forwardWheelToLenis).toHaveBeenCalledWith(
      viewport,
      wheel,
    );
    expect(wheel.defaultPrevented).toBe(true);
    expect(parentWheel).not.toHaveBeenCalled();
    document.body.removeEventListener('wheel', parentWheel);
    controller.destroy();
  });

  it('보이는 뷰포트가 바뀌면 그쪽으로 옮겨 붙되 깜빡이지 않는다', () => {
    const first = addViewport({ clientHeight: 400, scrollHeight: 1600 });
    const second = addViewport({ clientHeight: 0, scrollHeight: 0 });
    const controller = create();
    expect(rail.dataset.state).toBe('hidden');

    setBox(first, { clientHeight: 0 });
    setBox(second, { clientHeight: 400, scrollHeight: 800 });
    ResizeObserverStub.instances[0].callback();
    expect(thumb.style.height).toBe('196px');
    expect(rail.dataset.state).toBe('hidden');

    second.scrollTop = 400;
    second.dispatchEvent(new Event('scroll'));
    expect(thumb.style.transform).toBe('translate3d(0, 200px, 0)');
    expect(rail.dataset.state).toBe('thin');
    controller.destroy();
  });
});
