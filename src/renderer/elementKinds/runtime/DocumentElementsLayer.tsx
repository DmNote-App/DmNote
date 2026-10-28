import React, { useEffect } from 'react';

import {
  loadElementDocumentStore,
  useElementDocumentScene,
} from '@src/renderer/editor/document/elementDocumentRuntime';
import { elementRotationTransform } from '@utils/element/rotation';
import { documentElementSlots } from './documentElementOrder';
import { elementKindDefinition } from './elementKindRegistry';
import type { ElementRenderInputs } from './renderTypes';
import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import type { SurfaceBundle } from './ElementSurface';

interface DocumentElementViewProps {
  element: ElementNode;
  zIndex: number;
  offset: { x: number; y: number };
  live: boolean;
  inputs: ElementRenderInputs;
}

const DocumentElementView = React.memo(
  ({ element, zIndex, offset, live, inputs }: DocumentElementViewProps) => {
    const definition = elementKindDefinition(element.kind);
    const Render = definition?.render;
    // 모르는 종류는 오버레이에 그리지 않는다 (편집 화면은 자리 표시 상자)
    if (!Render) return null;
    const { x, y, width, height, rotation } = element.frame;
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
  live: boolean;
  inputs: ElementRenderInputs;
  offset?: { x: number; y: number };
}

const NO_OFFSET = { x: 0, y: 0 };

/** 트리 문서에만 있는 종류(커서 트래커 등)를 옛 종류 요소와 같은 쌓임 맥락에 그린다 */
const DocumentElementsLayer = ({
  sceneId,
  live,
  inputs,
  offset = NO_OFFSET,
}: DocumentElementsLayerProps) => {
  useEffect(() => {
    void loadElementDocumentStore().catch((error) =>
      console.error('[ElementDocument] failed to load', error),
    );
  }, []);
  const scene = useElementDocumentScene(sceneId);
  return (
    <>
      {documentElementSlots(scene).map(({ element, zIndex }) => (
        <DocumentElementView
          key={element.id}
          element={element}
          zIndex={zIndex}
          offset={offset}
          live={live}
          inputs={inputs}
        />
      ))}
    </>
  );
};

export default DocumentElementsLayer;
