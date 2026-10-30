import React from 'react';
import { useSpriteEditPreview } from '@stores/grid/useSpriteEditPreviewStore';
import { isSameSpriteTransform } from '@utils/sprite/spriteGeometry';
import {
  isErrorForCurrentSrc,
  useFailedImageSrcs,
} from '@hooks/overlay/useFailedImageSrcs';
import {
  resolveImageSource,
  toRenderableImageRef,
} from '@utils/media/imageSource';
import { computeSpriteImageStyle } from '@utils/sprite/spriteImageStyles';
import SpriteImagePlaceholder from '@components/main/common/SpriteImagePlaceholder';
import { resolvePoseImage } from '@utils/sprite/poseResolver';
import {
  placeSpriteVisual,
  spriteIdleVisual,
  spritePoseVisual,
} from '@utils/sprite/spritePlacement';
import type { CanonicalReactiveSpritePosition } from '@src/types/editor';

interface SpriteFaceViewProps {
  position: CanonicalReactiveSpritePosition;
  elementId: string;
  isSelected: boolean;
}

// 자세 편집 중 기본 자세를 뒤에 남기는 고스트의 투명도
const IDLE_GHOST_OPACITY = 0.3;

/** 편집 화면 스프라이트 겉모습(상자를 채운다) - 옛 스프라이트 요소와 트리 요소가 같이 쓴다 (자세 미리보기 포함) */
const SpriteFaceView = ({
  position,
  elementId,
  isSelected,
}: SpriteFaceViewProps) => {
  const posePreview = useSpriteEditPreview(elementId);
  const previewPose = posePreview
    ? posePreview.preferFallback
      ? posePreview.fallbackPose
      : position.poses.find((pose) => pose.poseId === posePreview.poseId) ??
        posePreview.fallbackPose
    : null;
  const effectivePosition =
    posePreview?.referenceNaturalSize &&
    toRenderableImageRef(position.baseImage) === null &&
    !position.referenceNaturalSize
      ? {
          ...position,
          referenceNaturalSize: posePreview.referenceNaturalSize,
        }
      : position;

  // 유실 이미지를 그대로 두면 캔버스에 깨진 아이콘이 박히고, 송출 화면(오버레이)은
  // 폴백을 그려 미리보기가 결과와 어긋난다. 폴백 규칙은 오버레이와 같다.
  // 훅 인자는 저장된 경로로 고정 - 편집 중 draft override를 넣으면 스크럽마다
  // 키가 바뀌어 실패 집합이 초기화된다
  const { failedImageSrcs, markFailed } = useFailedImageSrcs(
    position.baseImage,
    ...position.poses.map((pose) => pose.imageOverride),
  );
  const baseSrc = resolveImageSource(position.baseImage);
  const fallbackSrc = baseSrc && !failedImageSrcs.has(baseSrc) ? baseSrc : null;
  let imageSrc = resolveImageSource(
    resolvePoseImage(previewPose?.imageOverride, position.baseImage),
  );
  // 이미지·원본 크기는 한 벌로 움직인다 - 폴백도 기본 이미지 배치로 함께 간다
  let visual = previewPose
    ? spritePoseVisual(effectivePosition, previewPose)
    : spriteIdleVisual(position);
  if (imageSrc && failedImageSrcs.has(imageSrc)) {
    imageSrc = fallbackSrc;
    visual = spriteIdleVisual(position);
  }
  const placement = placeSpriteVisual(effectivePosition, visual);
  const transform = previewPose
    ? previewPose.transform
    : position.idleTransform;

  // 자세 편집 중에는 기본 자세를 반투명 고스트로 뒤에 남겨 "어디서 얼마나
  // 움직였는지"가 보인다. 기본 자세와 같은 그림이면 겹쳐 그릴 이유가 없다
  const idlePlacement = placeSpriteVisual(position, spriteIdleVisual(position));
  const showIdleGhost =
    previewPose !== null &&
    fallbackSrc !== null &&
    (imageSrc !== fallbackSrc ||
      !isSameSpriteTransform(transform, position.idleTransform));

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
      }}
      data-sprite-element="true"
      data-selected={isSelected ? 'true' : undefined}
    >
      {showIdleGhost ? (
        <img
          src={fallbackSrc}
          alt=""
          draggable={false}
          data-sprite-idle-ghost="true"
          style={{
            ...computeSpriteImageStyle(
              position,
              position.idleTransform,
              undefined,
              idlePlacement,
            ),
            opacity: IDLE_GHOST_OPACITY,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        />
      ) : null}
      {imageSrc ? (
        <img
          src={imageSrc}
          alt=""
          draggable={false}
          style={{
            // 정적 렌더라 transition 채널 없음, 외관 채널 규칙은 오버레이와 동일
            ...computeSpriteImageStyle(
              position,
              transform,
              undefined,
              placement,
            ),
            pointerEvents: 'auto',
            userSelect: 'none',
          }}
          onError={(event) => {
            if (!isErrorForCurrentSrc(event.currentTarget, imageSrc)) return;
            markFailed(imageSrc);
          }}
        />
      ) : (
        <SpriteImagePlaceholder />
      )}
    </div>
  );
};

export default SpriteFaceView;
