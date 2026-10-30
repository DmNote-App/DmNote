'use no memo';
// useSignals 컴포넌트 - React Compiler 메모 제외
import React, { useRef } from 'react';
import { useSignals } from '@preact/signals-react/runtime';
import type { KeyCounterSettings } from '@src/types/key/keys';
import { useCounterSettings } from '@hooks/overlay/useCounterSettings';
import { useFailedImageSrcs } from '@hooks/overlay/useFailedImageSrcs';
import {
  computeKeyElementStyles,
  type KeyElementPosition,
} from '@hooks/overlay/useKeyElementStyles';
import { useGradientPreviewSession } from '@stores/grid/useGradientEditStore';
import { useEditStatePreviewActive } from '@stores/grid/useEditStatePreviewStore';
import InsideCounterLayout from '@components/overlay/counters/InsideCounterLayout';
import { KeyElementContent } from '@components/shared/key/KeyElementFace';
import { useCounterAxisAnchor } from '@hooks/shared/useCounterAxisAnchor';
import { elementRotationTransform } from '@utils/element/rotation';

// counter가 KeyCounterSettings 타입인 확장 position
export interface KeyFacePosition extends KeyElementPosition {
  counter?: KeyCounterSettings;
}

interface KeyFaceViewProps {
  /** 그라디언트 프리뷰 앵커 종류. id 문자열 모양으로 추론하지 않는다 */
  anchorKind: 'key' | 'stat';
  elementId: string;
  // 겉모습과 축 핸들 원점(dx·dy·rotation - 요소의 저장 좌표)
  position: KeyFacePosition;
  keyName: string;
  isSelected: boolean;
  counterEnabled?: boolean;
  counterPreviewValue?: number;
  counterValueSignal?: { value: number };
  // 그리는 자리 - 옛 키 요소는 자기 상자, 트리 요소는 감싸는 상자 안 0,0
  placement: { dx: number; dy: number; rotation?: number; zIndex: number };
  attachRef?: (node: HTMLElement | null) => void;
  editing?: boolean;
  onClick?: (event: React.MouseEvent) => void;
  onDoubleClick?: (event: React.MouseEvent) => void;
  onPointerDown?: (event: React.PointerEvent<HTMLElement>) => void;
  onContextMenu?: (event: React.MouseEvent) => void;
}

/** 편집 화면 키·스탯 겉모습 - 옛 요소와 트리 요소가 같이 쓴다 (편집 미리보기 세션·상태 미리보기·안쪽 카운터 포함) */
const KeyFaceView = ({
  anchorKind,
  elementId,
  position,
  keyName,
  isSelected,
  counterEnabled = false,
  counterPreviewValue = 0,
  counterValueSignal,
  placement,
  attachRef,
  editing = false,
  onClick,
  onDoubleClick,
  onPointerDown,
  onContextMenu,
}: KeyFaceViewProps) => {
  useSignals();

  // keyName은 호출부에서 합성이 끝난 표시 라벨
  const displayName = keyName;
  const { className, counter } = position;

  const counterSettings = useCounterSettings(counter);

  const showInsideCounter =
    counterEnabled &&
    counterSettings.enabled &&
    counterSettings.placement === 'inside';

  // 편집 세션 일시 페인트 — 드래그 프리뷰가 저장·히스토리를 거치지 않고
  // 해당 표면의 spec과 대기/입력 상태 전체를 함께 그린다
  const previewSession = useGradientPreviewSession(
    anchorKind,
    elementId,
    isSelected,
  );
  // 상태 프리뷰는 전용 스토어가 유일한 원천 - 단색·그림자·이미지 편집도
  // 같은 규칙으로 대기/입력 시각을 뒤집는다 (세션은 spec 페인트 전용)
  const previewActive = useEditStatePreviewActive(
    anchorKind,
    elementId,
    isSelected,
  );
  const previewFillSpec =
    previewSession?.surface === 'counterFill' ? previewSession.spec : null;

  const keyRootRef = useRef<HTMLElement | null>(null);
  const anchorOrigin = { x: position.dx, y: position.dy };
  useCounterAxisAnchor(
    previewSession,
    keyRootRef,
    counterPreviewValue,
    '.counter',
    'counterFill',
    anchorOrigin,
    position.rotation,
  );
  useCounterAxisAnchor(
    previewSession,
    keyRootRef,
    position.displayText || displayName,
    '[data-key-label]',
    'font',
    anchorOrigin,
    position.rotation,
  );

  // 뷰포트 이동은 그리드 부모가 이미 합성 레이어를 소유
  // 키까지 중첩 승격하면 DOM 글자가 흐리게 래스터화됨
  const previewPosition: KeyFacePosition = {
    ...position,
    dx: placement.dx,
    dy: placement.dy,
    ...(previewSession?.surface === 'background'
      ? previewActive
        ? { activeBackgroundGradient: previewSession.spec }
        : { backgroundGradient: previewSession.spec }
      : {}),
    ...(previewSession?.surface === 'border'
      ? previewActive
        ? { activeBorderGradient: previewSession.spec }
        : { borderGradient: previewSession.spec }
      : {}),
    ...(previewSession?.surface === 'font'
      ? previewActive
        ? { activeFontGradient: previewSession.spec }
        : { fontGradient: previewSession.spec }
      : {}),
  };
  const { failedImageSrcs, markFailed } = useFailedImageSrcs(
    previewPosition.inactiveImage,
    previewPosition.activeImage,
  );
  const computedStyles = computeKeyElementStyles({
    position: previewPosition,
    active: previewActive,
    label: displayName,
    failedImageSrcs,
  });
  const {
    keyStyle: computedKeyStyle,
    textStyle,
    labelPaintStyle,
    labelHasGradient,
    labelMetricsDep,
    labelText,
    hasCurrentImage,
    imageMode,
  } = computedStyles;
  // 그리드(스케일 레이어) 안에서는 승격 금지 - WebKit은 합성 자식이 하나라도
  // 생기면 스케일 컨테이너 자체를 레이어로 만들어 내용 전체가 흐려진다.
  // 이동 키는 매 프레임 손상 영역만 재페인트하는 쪽이 선명하고 충분히 싸다
  const keyStyle: React.CSSProperties = {
    ...computedKeyStyle,
    transform: `translate(calc(${
      placement.dx
    }px + var(--key-offset-x, 0px)), calc(${
      placement.dy
    }px + var(--key-offset-y, 0px)))${elementRotationTransform(
      placement.rotation,
    )}`,
    willChange: 'auto',
    backfaceVisibility: 'visible',
    transformStyle: 'flat',
    contain: 'layout style',
    zIndex: placement.zIndex,
    cursor: undefined,
  };

  // 오버레이와 동일 컴포넌트로 렌더 — 에디터/오버레이 텍스트 배치 싱크 보장
  const renderInsideCounterPreview = () => {
    if (!showInsideCounter) {
      return null;
    }

    const displayValue =
      (counterValueSignal?.value ?? counterPreviewValue ?? 0) | 0;

    return (
      <InsideCounterLayout
        count={displayValue}
        labelText={labelText}
        textStyle={textStyle}
        labelPaintStyle={labelPaintStyle}
        labelHasGradient={labelHasGradient}
        labelMetricsDep={labelMetricsDep}
        active={previewActive}
        counterSettings={
          previewFillSpec
            ? previewActive
              ? { ...counterSettings, fillActiveGradient: previewFillSpec }
              : { ...counterSettings, fillIdleGradient: previewFillSpec }
            : counterSettings
        }
        useInlineStyles={position.useInlineStyles === true}
      />
    );
  };

  const attachRootRef = (node: HTMLElement | null) => {
    keyRootRef.current = node;
    attachRef?.(node);
  };

  return (
    <div
      ref={attachRootRef}
      className={`absolute dmn-grabbable ${className || ''}`}
      style={keyStyle}
      data-state={previewActive ? 'active' : 'inactive'}
      data-editing={editing ? 'true' : undefined}
      data-key-element="true"
      data-key-image={hasCurrentImage ? 'true' : undefined}
      data-key-image-mode={hasCurrentImage ? imageMode : undefined}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onPointerDown={onPointerDown}
      onContextMenu={onContextMenu}
      onDragStart={(e) => e.preventDefault()}
    >
      <KeyElementContent
        styles={{ ...computedStyles, keyStyle }}
        insideContent={
          showInsideCounter ? renderInsideCounterPreview() : undefined
        }
        markImageFailed={markFailed}
      />
    </div>
  );
};

export default KeyFaceView;
