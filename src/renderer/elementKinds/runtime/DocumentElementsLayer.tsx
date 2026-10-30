import React, { useEffect, useMemo } from 'react';

import {
  loadElementDocumentStore,
  useElementDocumentScene,
} from '@src/renderer/editor/document/elementDocumentRuntime';
import { elementRotationTransform } from '@utils/element/rotation';
import { TREE_EDITED_KINDS, TREE_OVERLAY_KINDS } from '@src/types/elementKinds';
import { documentElementSlots } from './documentElementOrder';
import { elementKindDefinition } from './elementKindRegistry';
import { legacyPositionOf } from './legacyPosition';
import type { ElementRenderInputs } from './renderTypes';
import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import type { SurfaceBundle } from './ElementSurface';
import type { OverlayItemContext } from '@components/overlay/counters/overlayItemRenderers';

interface DocumentElementViewProps {
  element: ElementNode;
  zIndex: number;
  offset: { x: number; y: number };
  live: boolean;
  inputs: ElementRenderInputs;
  overlayContext: OverlayItemContext;
}

const DocumentElementView = React.memo(
  ({
    element,
    zIndex,
    offset,
    live,
    inputs,
    overlayContext,
  }: DocumentElementViewProps) => {
    const definition = elementKindDefinition(element.kind);
    const Render = definition?.render;
    const { x, y, width, height, rotation } = element.frame;
    const LegacyOverlay = definition?.legacyOverlay;
    if (live && LegacyOverlay) {
      return (
        <LegacyOverlay
          position={{
            ...legacyPositionOf(element),
            dx: x + offset.x,
            dy: y + offset.y,
            zIndex,
          }}
          context={overlayContext}
          element={element}
        />
      );
    }
    // 모르는 종류는 오버레이에 그리지 않는다 (편집 화면은 자리 표시 상자)
    if (!Render) return null;
    return (
      <div
        className={element.className ?? undefined}
        data-element-kind={element.kind}
        data-element-id={element.id}
        style={{
          position: 'absolute',
          left: x + offset.x,
          top: y + offset.y,
          width,
          height,
          zIndex,
          transform: elementRotationTransform(rotation),
        }}
      >
        <Render
          element={element}
          // 규칙표로 검사한 값 - 종류 정의의 값 타입과 같다
          values={(element.values ?? {}) as never}
          bundles={{ surface: element.bundles?.surface as SurfaceBundle }}
          live={live}
          inputs={inputs}
        />
      </div>
    );
  },
);
DocumentElementView.displayName = 'DocumentElementView';

interface DocumentElementsLayerProps {
  sceneId: string;
  // bottom: 아래에 옛 종류 요소가 없는 요소 - 옛 요소보다 먼저 그리는 자리에 둔다
  placement: 'bottom' | 'stacked';
  live: boolean;
  inputs: ElementRenderInputs;
  offset?: { x: number; y: number };
  // 오버레이가 트리에서 그리는 옛 종류에 넘기는 맥락 (스프라이트 트리거 키 등)
  overlayContext?: OverlayItemContext;
}

const NO_OFFSET = { x: 0, y: 0 };
const NO_OVERLAY_CONTEXT: OverlayItemContext = {
  spriteKeyCanonicalMap: new Map(),
};

/** 트리 문서에만 있는 종류(커서 트래커 등)를 옛 종류 요소와 같은 쌓임 맥락에 그린다 */
const DocumentElementsLayer = ({
  sceneId,
  placement,
  live,
  inputs,
  offset = NO_OFFSET,
  overlayContext = NO_OVERLAY_CONTEXT,
}: DocumentElementsLayerProps) => {
  useEffect(() => {
    void loadElementDocumentStore().catch((error) =>
      console.error('[ElementDocument] failed to load', error),
    );
  }, []);
  const scene = useElementDocumentScene(sceneId);
  // 창 오프셋은 레이아웃을 다시 셀 때마다 새 객체 - 값이 같으면 요소 뷰 메모를 지킨다
  // (키 하나가 바뀌어도 오버레이 키가 전부 다시 그려지지 않게)
  const stableOffset = useMemo(
    () => ({ x: offset.x, y: offset.y }),
    [offset.x, offset.y],
  );
  return (
    <>
      {documentElementSlots(scene, {
        legacyKinds: live ? TREE_OVERLAY_KINDS : TREE_EDITED_KINDS,
        ownZIndex: live,
      })
        .filter(({ aboveLegacy }) => aboveLegacy === (placement === 'stacked'))
        .map(({ element, zIndex }) => (
          <DocumentElementView
            key={element.id}
            element={element}
            zIndex={zIndex}
            offset={stableOffset}
            live={live}
            inputs={inputs}
            overlayContext={overlayContext}
          />
        ))}
    </>
  );
};

export default DocumentElementsLayer;
