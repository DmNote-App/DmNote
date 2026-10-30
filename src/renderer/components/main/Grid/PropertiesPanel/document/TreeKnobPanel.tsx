import React, { useEffect, useRef, useState } from 'react';

import { useDocumentElement } from '@src/renderer/editor/document/elementDocumentRuntime';
import { legacyPositionOf } from '@src/renderer/elementKinds/runtime/legacyPosition';
import type {
  EditorPaintPropertyPatchV1,
  EditorStylePropertyPreviewPatchV1,
} from '@src/types/editor';
import type { KnobItemPosition } from '@src/types/key/knobs';
import { setDocumentCommon } from '../../document/documentEditActions';
import { useDocumentFramePreviewStore } from '../../document/useDocumentFramePreviewStore';
import { SingleKnobPanel } from '../single/SingleKnobPanel';
import type { TabType } from '../types';
import { treeLegacyPanelHandlers } from './treeLegacyPanelHandlers';

interface TreeKnobPanelProps {
  sceneId: string;
  elementId: string;
  setPanelElement: (element: HTMLDivElement | null) => void;
  panelElement: HTMLDivElement | null;
  singleScrollRefFor: (tab: TabType) => (node: HTMLDivElement | null) => void;
  useCustomCSS: boolean;
  // 미리보기는 옛 패널과 같은 편집 제스처 (옛 모양 보기 위에서 그린다)
  onStylePropertyPreview?: (patch: EditorStylePropertyPreviewPatchV1) => void;
  onPaintPreview?: (patch: EditorPaintPropertyPatchV1) => void;
  t: (key: string) => string;
}

/** 트리로 옮긴 노브 - 옛 노브 패널을 그대로 그리고 커밋은 트리 연산으로 보낸다 */
const TreeKnobPanel = ({
  sceneId,
  elementId,
  setPanelElement,
  panelElement,
  singleScrollRefFor,
  useCustomCSS,
  onStylePropertyPreview,
  onPaintPreview,
  t,
}: TreeKnobPanelProps) => {
  const element = useDocumentElement(sceneId, elementId);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const renameCancelledRef = useRef(false);
  // 다른 요소로 바뀌거나 패널이 닫히면 확정 안 된 위치 미리보기를 걷는다
  useEffect(
    () => () => useDocumentFramePreviewStore.getState().clear(elementId),
    [elementId],
  );
  if (!element) return null;
  const handlers = treeLegacyPanelHandlers(sceneId, elementId, 'knob');
  return (
    <SingleKnobPanel
      setPanelElement={setPanelElement}
      singleKnobPosition={legacyPositionOf(element) as KnobItemPosition}
      selectedKeyType={sceneId}
      isRenaming={isRenaming}
      renameInputRef={renameInputRef}
      renameValue={renameValue}
      setRenameValue={setRenameValue}
      renameCancelledRef={renameCancelledRef}
      handleRenameStart={() => {
        renameCancelledRef.current = false;
        setRenameValue(element.name ?? '');
        setIsRenaming(true);
      }}
      handleRenameCommit={(value) => {
        setIsRenaming(false);
        const trimmed = value.trim();
        void setDocumentCommon(sceneId, element.id, {
          name: trimmed ? trimmed : null,
        });
      }}
      handleRenameCancel={() => setIsRenaming(false)}
      onElementPropertyCommit={handlers.onElementPropertyCommit}
      onInactiveImageCommit={handlers.onInactiveImageCommit}
      onActiveImageCommit={handlers.onActiveImageCommit}
      onIdleTransparentCommit={handlers.onIdleTransparentCommit}
      onActiveTransparentCommit={handlers.onActiveTransparentCommit}
      onIdleImageFitCommit={handlers.onIdleImageFitCommit}
      onActiveImageFitCommit={handlers.onActiveImageFitCommit}
      onStylePropertyPreview={onStylePropertyPreview}
      onStylePropertyCommit={handlers.onStylePropertyCommit}
      onPaintPreview={onPaintPreview}
      onPaintCommit={handlers.onPaintCommit}
      onShadowCommit={handlers.onShadowCommit}
      handleGeometryPreview={handlers.handleGeometryPreview}
      handleGeometryCommit={handlers.handleGeometryCommit}
      singleScrollRefFor={singleScrollRefFor}
      panelElement={panelElement}
      useCustomCSS={useCustomCSS}
      t={t}
    />
  );
};

export default TreeKnobPanel;
