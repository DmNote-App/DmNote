import { useEffect, useRef } from 'react';

import { usePanelHost } from '@contexts/PanelHostContext';

import {
  createOverlayScrollbarController,
  type OverlayScrollbarController,
  type OverlayScrollbarPlacement,
} from './overlayScrollbarController';

interface OverlayScrollbarProps {
  /** 끌어 정렬처럼 뷰포트 위 히트 판정이 필요한 동안 막대 입력을 끈다 */
  inert?: boolean;
  /** 레일 왼쪽 위치(뷰포트 기준 px). edge 배치에서만 쓴다 */
  railLeft?: number;
  /** edge는 뷰포트 오른쪽 끝 안쪽, outside는 부모 상자 바깥 오른쪽 여백 */
  placement?: OverlayScrollbarPlacement;
  className?: string;
}

/**
 * 오버레이 스크롤 막대. 스크롤 뷰포트와 같은 부모(위치 지정 요소) 안 마지막 자식으로 둔다.
 * 네이티브 막대는 전역에서 숨긴 채, 스크롤할 때와 가장자리에 포인터가 닿을 때만 드러난다.
 * 레일 자리(오른쪽 띠)에는 버튼이 없어야 한다 - 쓰는 쪽 레이아웃이 그 띠를 비워 둔다
 */
const OverlayScrollbar = ({
  inert = false,
  railLeft,
  placement = 'edge',
  className,
}: OverlayScrollbarProps) => {
  // 분리 패널로 옮겨지면 그 창 기준으로 관찰자를 다시 만든다
  const { window: ownerWindow } = usePanelHost();
  const railRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<OverlayScrollbarController | null>(null);

  useEffect(() => {
    const rail = railRef.current;
    const thumb = thumbRef.current;
    if (!rail || !thumb) return undefined;
    const view = (rail.ownerDocument.defaultView ?? ownerWindow) as Window &
      typeof globalThis;
    const controller = createOverlayScrollbarController(rail, thumb, view);
    controllerRef.current = controller;
    return () => {
      controller.destroy();
      controllerRef.current = null;
    };
  }, [ownerWindow]);

  useEffect(() => {
    controllerRef.current?.setOptions({ inert, railLeft, placement });
  }, [inert, railLeft, placement, ownerWindow]);

  return (
    <div
      ref={railRef}
      aria-hidden="true"
      className={className ? `dmn-scrollbar ${className}` : 'dmn-scrollbar'}
    >
      <div ref={thumbRef} className="dmn-scrollbar-thumb" />
    </div>
  );
};

export default OverlayScrollbar;
