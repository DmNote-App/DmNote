import React, { useEffect, useRef, useState, type ComponentProps } from 'react';

import { useDocumentElement } from '@src/renderer/editor/document/elementDocumentRuntime';
import { legacyPositionOf } from '@src/renderer/elementKinds/runtime/legacyPosition';
import { useKnobItemStore } from '@stores/data/useKnobItemStore';
import type { KnobItemPosition } from '@src/types/key/knobs';
import { setDocumentCommon } from '../../document/documentEditActions';
import { useDocumentFramePreviewStore } from '../../document/useDocumentFramePreviewStore';
import { SingleKnobPanel } from '../single/SingleKnobPanel';
import { treeLegacyPanelHandlers } from './treeLegacyPanelHandlers';

type SingleKnobPanelProps = ComponentProps<typeof SingleKnobPanel>;

// 겉모습 칸은 옛 노브 패널 처리기를 그대로 쓴다 (옛 경로로 낙관 반영, 편집 화면 얼굴이 그 값을 그린다)
type StyleHandlers = Pick<
  SingleKnobPanelProps,
  | 'onElementPropertyCommit'
  | 'onInactiveImageCommit'
  | 'onActiveImageCommit'
  | 'onIdleTransparentCommit'
  | 'onActiveTransparentCommit'
  | 'onIdleImageFitCommit'
  | 'onActiveImageFitCommit'
  | 'onStylePropertyPreview'
  | 'onStylePropertyCommit'
  | 'onPaintPreview'
  | 'onPaintCommit'
  | 'onShadowCommit'
>;

interface TreeKnobPanelProps extends StyleHandlers {
  sceneId: string;
  elementId: string;
  setPanelElement: SingleKnobPanelProps['setPanelElement'];
  panelElement: SingleKnobPanelProps['panelElement'];
  singleScrollRefFor: SingleKnobPanelProps['singleScrollRefFor'];
  useCustomCSS: boolean;
  t: (key: string) => string;
}

/** 트리로 옮긴 노브 - 옛 노브 패널을 그대로 그린다. 위치·크기·이름은 트리로, 겉모습 칸은 옛 경로로 */
const TreeKnobPanel = ({
  sceneId,
  elementId,
  setPanelElement,
  panelElement,
  singleScrollRefFor,
  useCustomCSS,
  t,
  ...styleHandlers
}: TreeKnobPanelProps) => {
  const element = useDocumentElement(sceneId, elementId);
  const legacy = useKnobItemStore((state) =>
    state.positions[sceneId]?.find(({ id }) => id === elementId),
  );
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
  const geometry = treeLegacyPanelHandlers(sceneId, elementId);
  const position = {
    ...(legacy ?? legacyPositionOf(element)),
    dx: element.frame.x,
    dy: element.frame.y,
    width: element.frame.width,
    height: element.frame.height,
    rotation: element.frame.rotation,
    layerName: element.name ?? undefined,
  } as KnobItemPosition;
  return (
    <SingleKnobPanel
      {...styleHandlers}
      setPanelElement={setPanelElement}
      singleKnobPosition={position}
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
      handleGeometryPreview={geometry.handleGeometryPreview}
      handleGeometryCommit={geometry.handleGeometryCommit}
      singleScrollRefFor={singleScrollRefFor}
      panelElement={panelElement}
      useCustomCSS={useCustomCSS}
      t={t}
    />
  );
};

export default TreeKnobPanel;
