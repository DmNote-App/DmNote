import {
  forwardWheelToLenis,
  getWrapperLenis,
  scrollLenisTo,
} from '@hooks/useLenis';
import { isMac } from '@utils/core/platform';

import {
  computeThumbGeometry,
  resolveOverlayScrollbarState,
  resolveTrackPressTarget,
  scrollOffsetForThumbDrag,
  wheelDeltaToPixels,
  type OverlayScrollbarState,
  type ThumbGeometry,
} from './overlayScrollbarModel';

/**
 * 레일 자리. edge는 뷰포트 오른쪽 끝 안쪽, outside는 부모 바깥 오른쪽에 붙어 부모 높이만큼.
 * 어느 쪽이든 그 자리는 막대 전용이어야 한다 - 버튼을 두지 않는다
 */
export type OverlayScrollbarPlacement = 'edge' | 'outside';

export interface OverlayScrollbarOptions {
  /** 끌어 정렬처럼 뷰포트 위 히트 판정이 필요한 동안 막대 입력을 끈다 */
  inert: boolean;
  /** 레일 왼쪽 위치(뷰포트 기준 px). edge 배치에서만 쓴다 */
  railLeft: number | undefined;
  placement: OverlayScrollbarPlacement;
}

export interface OverlayScrollbarController {
  setOptions: (options: OverlayScrollbarOptions) => void;
  destroy: () => void;
}

interface DragSession {
  pointerId: number;
  startY: number;
  startScroll: number;
  scale: number;
}

const DEFAULT_PAD = 4;
const DEFAULT_MIN_THUMB = 28;
const DEFAULT_HIDE_DELAY_MS = 900;

// 분리 패널은 다른 창 문서라 instanceof HTMLElement가 거짓이 된다
const isElement = (node: Element): node is HTMLElement => node.nodeType === 1;

const readPx = (style: CSSStyleDeclaration, name: string, fallback: number) => {
  const value = parseFloat(style.getPropertyValue(name));
  return Number.isFinite(value) ? value : fallback;
};

const readMs = (style: CSSStyleDeclaration, name: string, fallback: number) => {
  const raw = style.getPropertyValue(name).trim();
  const value = parseFloat(raw);
  if (!Number.isFinite(value)) return fallback;
  if (raw.endsWith('ms')) return value;
  return raw.endsWith('s') ? value * 1000 : value;
};

/**
 * 레일의 부모(위치 지정된 래퍼) 안에서 보이는 스크롤 뷰포트를 찾아 썸을 맞춘다.
 * keepalive 탭처럼 뷰포트가 여럿이면 보이는 쪽을 따라간다.
 * 위치 갱신은 transform만 쓰고, 크기는 ResizeObserver 콜백에서만 잰다.
 * 레일 자리는 레이아웃이 비워 둔 막대 전용 띠라, 넘치는 동안 레일이 포인터를 받는다
 */
export const createOverlayScrollbarController = (
  rail: HTMLElement,
  thumb: HTMLElement,
  // 분리 패널 창이면 그 창 - 관찰자·타이머가 메인 창 렌더 주기에 묶이지 않게
  view: Window & typeof globalThis,
): OverlayScrollbarController => {
  const host = rail.parentElement;
  const doc = rail.ownerDocument;

  let options: OverlayScrollbarOptions = {
    inert: false,
    railLeft: undefined,
    placement: 'edge',
  };
  let viewport: HTMLElement | null = null;
  let viewportVisible = false;
  let geometry: ThumbGeometry | null = null;
  let viewportSize = 0;
  let contentSize = 0;
  let trackSize = 0;
  let pad = DEFAULT_PAD;
  let minThumb = DEFAULT_MIN_THUMB;
  let hideDelay = DEFAULT_HIDE_DELAY_MS;
  let hovering = false;
  let revealed = false;
  let drag: DragSession | null = null;
  let hideTimer: number | undefined;
  let state: OverlayScrollbarState | null = null;
  let lenis: ReturnType<typeof getWrapperLenis>;
  let unsubscribeLenis: (() => void) | null = null;
  let destroyed = false;
  let syncingContentSize = false;
  const observed = new Set<Element>();

  const applyState = () => {
    const next = resolveOverlayScrollbarState({
      overflow: viewportVisible && !!geometry?.overflow,
      dragging: drag !== null,
      hovering: hovering && !options.inert,
      revealed,
    });
    if (next === state) return;
    state = next;
    rail.dataset.state = next;
  };

  const reveal = () => {
    revealed = true;
    if (hideTimer !== undefined) view.clearTimeout(hideTimer);
    hideTimer = view.setTimeout(() => {
      hideTimer = undefined;
      revealed = false;
      applyState();
    }, hideDelay);
    applyState();
  };

  const placeThumb = () => {
    if (!geometry) return;
    thumb.style.transform = `translate3d(0, ${pad + geometry.offset}px, 0)`;
  };

  const updateOffset = () => {
    if (!viewport || !geometry?.overflow) return;
    geometry = computeThumbGeometry({
      viewportSize,
      contentSize,
      scrollOffset: viewport.scrollTop,
      trackSize,
      minThumbSize: minThumb,
    });
    placeThumb();
  };

  const measure = () => {
    if (!viewport || viewport.clientHeight === 0) {
      viewportVisible = false;
      geometry = null;
      return;
    }
    const style = view.getComputedStyle(rail);
    pad = readPx(style, '--ui-scrollbar-pad', DEFAULT_PAD);
    minThumb = readPx(style, '--ui-scrollbar-min', DEFAULT_MIN_THUMB);
    hideDelay = readMs(
      style,
      '--ui-scrollbar-hide-delay',
      DEFAULT_HIDE_DELAY_MS,
    );

    viewportVisible = true;
    viewportSize = viewport.clientHeight;
    contentSize = viewport.scrollHeight;

    let top = 0;
    let left: number;
    let height: number;
    if (options.placement === 'outside' && host) {
      // 부모 상자 바깥 여백에 붙인다 - 상자 안 행·버튼과 자리를 나누지 않게
      left = host.clientWidth;
      height = host.clientHeight;
    } else {
      // 부모가 위치 지정 요소가 아니면 오프셋 기준이 달라 부모 전체를 덮는 배치로 둔다
      const aligned = viewport.offsetParent === host;
      top = aligned ? viewport.offsetTop + viewport.clientTop : 0;
      left =
        (aligned ? viewport.offsetLeft + viewport.clientLeft : 0) +
        (options.railLeft ?? viewport.clientWidth - rail.offsetWidth);
      height = viewportSize;
    }
    rail.style.top = `${top}px`;
    rail.style.left = `${left}px`;
    rail.style.height = `${height}px`;

    trackSize = Math.max(0, height - pad * 2);
    geometry = computeThumbGeometry({
      viewportSize,
      contentSize,
      scrollOffset: viewport.scrollTop,
      trackSize,
      minThumbSize: minThumb,
    });
    thumb.style.height = `${geometry.size}px`;
    placeThumb();
  };

  // 관찰 대상(뷰포트 직계 자식)의 박스는 그대로인데 깊은 자손만 커져 scrollHeight가
  // 바뀐 경우를 휠·스크롤·호버 시점에 바로잡는다. 같은 이유로 Lenis 한도도 낡았을 수 있어
  // 함께 다시 잰다 - 안 그러면 휠이 이전 한도에 묶여 새 영역으로 못 간다. 바뀌었으면 true
  const syncContentSize = (): boolean => {
    if (!viewport || syncingContentSize) return false;
    if (
      viewport.scrollHeight === contentSize &&
      viewport.clientHeight === viewportSize
    ) {
      return false;
    }
    syncingContentSize = true;
    try {
      // 캐시를 먼저 갱신한다 - Lenis resize()는 'scroll'을 동기로 내서 여기로 다시 들어온다
      measure();
      getWrapperLenis(viewport)?.resize();
      applyState();
    } finally {
      syncingContentSize = false;
    }
    return true;
  };

  const onLenisScroll = () => {
    if (!syncContentSize()) updateOffset();
  };

  // Lenis는 rAF 안에서 scrollTop을 바꾸고 바로 'scroll'을 낸다. 네이티브 이벤트만 들으면
  // 썸이 콘텐츠보다 한 프레임 늦게 따라온다. 인스턴스는 부모 이펙트에서 늦게 생기므로 지연 구독
  const syncLenis = () => {
    const next = viewport ? getWrapperLenis(viewport) : undefined;
    if (next === lenis) return;
    unsubscribeLenis?.();
    unsubscribeLenis = null;
    lenis = next;
    if (next) unsubscribeLenis = next.on('scroll', onLenisScroll);
  };

  const onScroll = () => {
    syncLenis();
    if (!syncContentSize()) updateOffset();
    if (geometry?.overflow) reveal();
  };

  // Lenis보다 먼저 받아야 바뀐 한도로 이번 휠을 처리한다 (캡처 단계)
  const onHostWheelCapture = () => {
    syncContentSize();
  };

  const pickViewport = (): HTMLElement | null => {
    if (!host) return null;
    for (const child of Array.from(host.children)) {
      if (child === rail || !isElement(child)) continue;
      // keepalive 탭의 숨은 뷰포트(display: none)는 건너뛴다
      if (child.clientHeight === 0) continue;
      const { overflowY } = view.getComputedStyle(child);
      if (overflowY === 'auto' || overflowY === 'scroll') return child;
    }
    return null;
  };

  // 관찰자가 없는 환경(jsdom 등)에서는 마운트·자식 변경 때만 잰다
  const resizeObserver =
    typeof view.ResizeObserver === 'function'
      ? new view.ResizeObserver(() => refresh())
      : null;
  const mutationObserver =
    typeof view.MutationObserver === 'function'
      ? new view.MutationObserver(() => refresh())
      : null;

  // 관찰 대상이 바뀐 것만 반영 - 다시 observe하면 초기 콜백이 또 와서 루프가 된다
  const syncObservation = () => {
    if (!resizeObserver) return;
    const targets = new Set<Element>();
    if (host) {
      targets.add(host);
      Array.from(host.children).forEach((child) => {
        if (child !== rail) targets.add(child);
      });
    }
    if (viewport) {
      Array.from(viewport.children).forEach((child) => targets.add(child));
    }
    observed.forEach((target) => {
      if (targets.has(target)) return;
      resizeObserver.unobserve(target);
      observed.delete(target);
    });
    targets.forEach((target) => {
      if (observed.has(target)) return;
      resizeObserver.observe(target);
      observed.add(target);
    });
  };

  const observeMutations = () => {
    if (!mutationObserver) return;
    mutationObserver.disconnect();
    if (host) mutationObserver.observe(host, { childList: true });
    if (viewport) mutationObserver.observe(viewport, { childList: true });
  };

  const releaseDrag = () => {
    if (!drag) return;
    const { pointerId } = drag;
    drag = null;
    try {
      if (rail.hasPointerCapture(pointerId))
        rail.releasePointerCapture(pointerId);
      if (thumb.hasPointerCapture(pointerId)) {
        thumb.releasePointerCapture(pointerId);
      }
    } catch {
      // 이미 해제된 포인터
    }
  };

  const refresh = () => {
    if (destroyed) return;
    const next = pickViewport();
    const changed = next !== viewport;
    if (changed) {
      viewport?.removeEventListener('scroll', onScroll);
      releaseDrag();
      viewport = next;
      viewport?.addEventListener('scroll', onScroll, { passive: true });
      syncLenis();
      observeMutations();
    }
    syncObservation();
    // 열림·탭 전환에는 드러내지 않는다 - 선택마다 패널이 다시 그려져 깜빡임이 소음이 된다.
    // 막대는 스크롤할 때와 가장자리에 포인터가 닿을 때만 나타난다
    measure();
    applyState();
  };

  const railScale = () => {
    const rect = rail.getBoundingClientRect();
    return rail.offsetHeight > 0 && rect.height > 0
      ? rect.height / rail.offsetHeight
      : 1;
  };

  const startDrag = (
    event: PointerEvent,
    target: HTMLElement,
    startScroll: number,
  ) => {
    drag = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startScroll,
      scale: railScale(),
    };
    try {
      target.setPointerCapture(event.pointerId);
    } catch {
      // 캡처를 못 잡아도 레일 위에서는 계속 끌린다
    }
    applyState();
  };

  const canInteract = () =>
    !options.inert && viewport !== null && !!geometry?.overflow;

  const onThumbPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || !canInteract() || !viewport) return;
    event.preventDefault();
    event.stopPropagation();
    startDrag(event, thumb, viewport.scrollTop);
  };

  const onTrackPointerDown = (event: PointerEvent) => {
    if (event.target !== rail || event.button !== 0) return;
    if (!canInteract() || !viewport || !geometry) return;
    event.preventDefault();
    const rect = rail.getBoundingClientRect();
    const scale = railScale();
    const pointer = (event.clientY - rect.top) / scale - pad;
    // macOS는 ⌥, Windows는 Shift - 각 OS의 "누른 자리로 이동" 관례
    const jumpToSpot = isMac() ? event.altKey : event.shiftKey;
    const target = resolveTrackPressTarget({
      pointer,
      geometry,
      scrollOffset: viewport.scrollTop,
      viewportSize,
      jumpToSpot,
    });
    if (target === null) return;
    if (jumpToSpot) {
      // 썸이 포인터 아래로 오고, 놓기 전까지 그대로 끌 수 있다
      scrollLenisTo(viewport, target, { immediate: true });
      startDrag(event, rail, target);
      return;
    }
    const reducedMotion = doc.documentElement.hasAttribute(
      'data-dmn-reduced-motion',
    );
    scrollLenisTo(viewport, target, { immediate: reducedMotion });
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId || !viewport || !geometry) {
      return;
    }
    const target = scrollOffsetForThumbDrag({
      startScroll: drag.startScroll,
      pointerDelta: (event.clientY - drag.startY) / drag.scale,
      range: geometry.range,
      travel: geometry.travel,
    });
    scrollLenisTo(viewport, target, { immediate: true });
  };

  const onPointerEnter = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return;
    syncContentSize();
    hovering = true;
    applyState();
  };

  const onPointerLeave = () => {
    hovering = false;
    if (drag) {
      applyState();
      return;
    }
    // 띠를 떠나면 바로 숨지 않고 대기 시간만큼 얇게 남는다
    if (geometry?.overflow) reveal();
    else applyState();
  };

  const onPointerEnd = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    releaseDrag();
    const rect = rail.getBoundingClientRect();
    hovering =
      event.pointerType !== 'touch' &&
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;
    reveal();
  };

  // 막대는 포커스를 가져가지 않는다 - 편집 중인 입력의 blur 커밋을 일으키지 않게
  const onMouseDown = (event: MouseEvent) => event.preventDefault();

  const onWheel = (event: WheelEvent) => {
    if (!viewport || event.ctrlKey) return;
    event.preventDefault();
    event.stopPropagation();
    if (forwardWheelToLenis(viewport, event)) return;
    viewport.scrollBy({
      left: wheelDeltaToPixels(
        event.deltaX,
        event.deltaMode,
        viewport.clientWidth,
      ),
      top: wheelDeltaToPixels(
        event.deltaY,
        event.deltaMode,
        viewport.clientHeight,
      ),
    });
  };

  thumb.addEventListener('pointerdown', onThumbPointerDown);
  rail.addEventListener('pointerdown', onTrackPointerDown);
  rail.addEventListener('pointermove', onPointerMove);
  rail.addEventListener('pointerup', onPointerEnd);
  rail.addEventListener('pointercancel', onPointerEnd);
  rail.addEventListener('lostpointercapture', onPointerEnd);
  rail.addEventListener('pointerenter', onPointerEnter);
  rail.addEventListener('pointerleave', onPointerLeave);
  rail.addEventListener('mousedown', onMouseDown);
  rail.addEventListener('wheel', onWheel, { passive: false });
  host?.addEventListener('wheel', onHostWheelCapture, {
    capture: true,
    passive: true,
  });

  refresh();

  return {
    setOptions: (next) => {
      if (
        next.inert === options.inert &&
        next.railLeft === options.railLeft &&
        next.placement === options.placement
      ) {
        return;
      }
      options = next;
      rail.toggleAttribute('data-inert', next.inert);
      if (next.inert) {
        hovering = false;
        releaseDrag();
      }
      measure();
      applyState();
    },
    destroy: () => {
      destroyed = true;
      if (hideTimer !== undefined) view.clearTimeout(hideTimer);
      releaseDrag();
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      unsubscribeLenis?.();
      viewport?.removeEventListener('scroll', onScroll);
      thumb.removeEventListener('pointerdown', onThumbPointerDown);
      rail.removeEventListener('pointerdown', onTrackPointerDown);
      rail.removeEventListener('pointermove', onPointerMove);
      rail.removeEventListener('pointerup', onPointerEnd);
      rail.removeEventListener('pointercancel', onPointerEnd);
      rail.removeEventListener('lostpointercapture', onPointerEnd);
      rail.removeEventListener('pointerenter', onPointerEnter);
      rail.removeEventListener('pointerleave', onPointerLeave);
      rail.removeEventListener('mousedown', onMouseDown);
      rail.removeEventListener('wheel', onWheel);
      host?.removeEventListener('wheel', onHostWheelCapture, { capture: true });
    },
  };
};
