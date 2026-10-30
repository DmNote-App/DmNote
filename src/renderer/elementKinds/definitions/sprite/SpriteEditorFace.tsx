'use no memo';
// 프리뷰 오버레이(모듈 상태)를 previewVersion으로 다시 읽어야 해서 컴파일러 메모 제외
import { useSyncExternalStore } from 'react';

import SpriteFaceView from '@components/main/Grid/layers/SpriteFaceView';
import { useKeyStore } from '@stores/data/useKeyStore';
import { useSpriteStore } from '@stores/data/useSpriteStore';
import {
  composePreviewPositions,
  getPreviewOverlayVersion,
  subscribePreviewOverlay,
} from '@src/renderer/editor/runtime/gesture/previewOverlay';
import { legacyPositionOf } from '@src/renderer/elementKinds/runtime/legacyPosition';
import type { ElementRenderProps } from '@src/renderer/elementKinds/runtime/renderTypes';
import type { CanonicalReactiveSpritePosition } from '@src/types/editor';
import { projectSpriteResize } from '@utils/sprite/resizeProjection';

// 편집 화면 스프라이트 - 위치·크기·회전·클래스는 트리(감싸는 상자), 그림·기준점·자세는 옛 패널이
// 낙관 반영하는 옛 모양 보기와 그 미리보기에서 그린다 (스타일 칸 쓰기는 아직 옛 경로 - 4단계에서 트리로)
const SpriteEditorFace = ({
  element,
  selected,
}: ElementRenderProps<Record<string, unknown>>) => {
  useSyncExternalStore(subscribePreviewOverlay, getPreviewOverlayVersion);
  const mode = useKeyStore((state) => state.selectedKeyType);
  const positions = useSpriteStore((state) => state.positions);
  const composed = composePreviewPositions('spritePosition', positions)[
    mode
  ]?.find(({ id }) => id === element.id);
  const position = (composed ??
    legacyPositionOf(element)) as CanonicalReactiveSpritePosition;
  const { frame } = element;
  return (
    <SpriteFaceView
      // 그림 배치는 상자 크기 기준 - 끄는 중·반영 전 크기 변경도 이동값을 같은 비율로 (커밋과 같은 projection)
      position={projectSpriteResize(position, {
        dx: frame.x,
        dy: frame.y,
        width: frame.width,
        height: frame.height,
      })}
      elementId={element.id}
      isSelected={selected === true}
    />
  );
};

export default SpriteEditorFace;
