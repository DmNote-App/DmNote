import React, { useState, useEffect, useMemo } from 'react';
import type { KeyPosition } from '@src/types/key/keys';
import { PropertySection } from '../../controls/PropertyInputs';
import { useKeyStore } from '@stores/data/useKeyStore';
import { usePanelSelection } from '../../../document/treeEditedSelection';
import {
  EMPTY_BATCH_ELEMENT_BINDING,
  type BatchElementBinding,
} from '@hooks/pickers/useBatchElementBinding';
import type {
  EditorPaintPropertyPatchV1,
  EditorPreviewStylePropertyPatchV1,
  EditorStylePropertyPreviewPatchV1,
  EditorShadowPropertyPatchV1,
} from '@src/types/editor';
import type { BatchElementPropertyUpdate } from '../../types';
import BatchSoundSection from './BatchSoundSection';
import BatchShadowSection from './BatchShadowSection';
import BatchTypographySection, {
  type BatchTypographyKeyData,
} from './BatchTypographySection';
import BatchCustomCssSection from './BatchCustomCssSection';
import { BatchImageButtonRow, BatchSurfaceRows } from './BatchSurfaceRows';

// 일괄 겉모습 본문 - 표면·이미지·그림자·글자·사용자 CSS·사운드 (위치·크기 아래, 선언 일괄 패널이 그린다)
export interface BatchStyleBodyProps {
  // 사운드 완료의 시작 시점 결합. 소유자는 EditSessionBoundary 밖 부모다 -
  // 이 컴포넌트는 선택 변경 시 리마운트되어 open 중 재캡처가 일어난다
  soundBinding?: BatchElementBinding;
  onSoundPathCommit?: (soundPath: string) => void;
  onSoundEnabledCommit?: (soundEnabled: boolean) => void;
  onSoundVolumeCommit?: (soundVolume: number) => void;
  onStylePropertyPreview?: (patch: EditorStylePropertyPreviewPatchV1) => void;
  onStylePropertyCommit?: (patch: EditorPreviewStylePropertyPatchV1) => void;
  onPaintPreview?: (patch: EditorPaintPropertyPatchV1) => void;
  onPaintCommit?: (patch: EditorPaintPropertyPatchV1) => void;
  onFontColorPreview?: (patch: EditorPaintPropertyPatchV1) => void;
  onFontColorCommit?: (patch: EditorPaintPropertyPatchV1) => void;
  onShadowCommit?: (patch: EditorShadowPropertyPatchV1) => void;
  hideDisplayText?: boolean;
  hideFontControls?: boolean;
  // 이미지 묶음을 가진 요소가 없다 - 커스텀 이미지 줄을 그리지 않는다
  hideImage?: boolean;
  // 피커 형식 기억·드래그 소유권을 나누는 선택 구성 - 패널이 편집하는 요소 (없으면 패널 선택)
  selectionKey?: string;
  showSoundControls?: boolean;
  showShadowControls?: boolean;
  // 선택에 키·노브가 없으면(통계뿐) 그림자 대기만 편집
  shadowActiveState?: boolean;
  shadowKind?: 'key' | 'knob';
  /** 이미지가 기본 립을 억제하는 요소인지 - 키·통계만 (그래프·노브 렌더는 억제하지 않는다).
   * 여러 종류가 섞이면 요소마다 */
  imageSuppressesDefaultBorder?: boolean | ((position: KeyPosition) => boolean);
  // getMixedValue 함수
  getMixedValue: <T>(
    getter: (pos: KeyPosition) => T | undefined,
    defaultValue: T,
  ) => { isMixed: boolean; value: T };
  // getSelectedKeysData 함수 (displayText Mixed 판단용)
  getSelectedKeysData: () => BatchTypographyKeyData[];
  onElementPropertyCommit?: (
    updates: BatchElementPropertyUpdate,
    options?: { gestureId?: string },
  ) => void;
  // 키 전용 (사운드 등)
  getKeyOnlyMixedValue?: <T>(
    getter: (pos: KeyPosition) => T | undefined,
    defaultValue: T,
  ) => { isMixed: boolean; value: T };
  // 눌림 가능(키·노브) — active 상태 집계·쓰기가 통계만 제외
  getActiveCapableMixedValue?: <T>(
    getter: (pos: KeyPosition) => T | undefined,
    defaultValue: T,
  ) => { isMixed: boolean; value: T };
  // 이미지 피커
  showBatchImagePicker: boolean;
  onToggleBatchImagePicker: () => void;
  batchImageButtonRef: React.RefObject<HTMLButtonElement>;
  // 기타
  panelElement: HTMLElement | null;
  useCustomCSS: boolean;
  t: (key: string) => string;
  // 여러 종류를 고른 일괄 - 글자 섹션은 글자 묶음이 있는 종류(키·스탯)끼리 읽고 쓴다
  typography?: {
    getMixedValue: BatchStyleBodyProps['getMixedValue'];
    getActiveMixedValue: BatchStyleBodyProps['getMixedValue'];
    getSelectedKeysData: BatchStyleBodyProps['getSelectedKeysData'];
    showActiveState: boolean;
    onStylePropertyPreview?: BatchStyleBodyProps['onStylePropertyPreview'];
    onStylePropertyCommit?: BatchStyleBodyProps['onStylePropertyCommit'];
    onElementPropertyCommit?: BatchStyleBodyProps['onElementPropertyCommit'];
  };
  // 그림자 섹션은 그림자를 그리는 종류끼리 읽는다
  getShadowMixedValue?: BatchStyleBodyProps['getMixedValue'];
  // 겉모습(배경·테두리) 칸 - 표면을 가진 트리에만 있는 종류가 섞이면 그 요소까지 읽고 쓴다 (미리보기는 옛 종류)
  surface?: {
    getMixedValue: BatchStyleBodyProps['getMixedValue'];
    onPaintCommit?: (patch: EditorPaintPropertyPatchV1) => void;
    onStylePropertyCommit?: (patch: EditorPreviewStylePropertyPatchV1) => void;
  };
}

const BatchStyleBody = ({
  hideDisplayText = false,
  hideFontControls = false,
  hideImage = false,
  selectionKey,
  soundBinding = EMPTY_BATCH_ELEMENT_BINDING,
  onSoundPathCommit,
  onSoundEnabledCommit,
  onSoundVolumeCommit,
  onStylePropertyPreview,
  onStylePropertyCommit,
  onPaintPreview,
  onPaintCommit,
  onFontColorPreview,
  onFontColorCommit,
  onShadowCommit,
  showSoundControls = false,
  showShadowControls = true,
  shadowActiveState = true,
  shadowKind = 'key',
  imageSuppressesDefaultBorder = true,
  getMixedValue,
  getSelectedKeysData,
  onElementPropertyCommit,
  getKeyOnlyMixedValue,
  getActiveCapableMixedValue,
  showBatchImagePicker,
  onToggleBatchImagePicker,
  batchImageButtonRef,
  panelElement,
  useCustomCSS,
  typography,
  getShadowMixedValue,
  surface,
  t,
}: BatchStyleBodyProps) => {
  const [colorState, setColorState] = useState<'idle' | 'active'>('idle');
  const effectiveColorState = shadowActiveState ? colorState : 'idle';
  const activeMixedValue =
    getActiveCapableMixedValue ?? getKeyOnlyMixedValue ?? getMixedValue;
  const selectedKeyType = useKeyStore((state) => state.selectedKeyType);
  // 트리로 옮긴 옛 종류(노브 등)까지 - 패널이 함께 보는 선택
  const selectedElements = usePanelSelection(selectedKeyType);
  // 선택 구성 시그니처 — 형식 왕복 기억·드래그 소유권이 다른 배치 선택과
  // 교차하지 않게 keyType + 정렬된 대상 목록을 키에 포함
  const panelSelectionKey = useMemo(
    () =>
      `${selectedKeyType}:${selectedElements
        .map((el) => el.id)
        .sort()
        .join(',')}`,
    [selectedKeyType, selectedElements],
  );
  const batchSelectionKey = selectionKey ?? panelSelectionKey;
  useEffect(() => {
    // 눌림 상태 편집 능력이 사라지면 저장된 active 탭 선택도 리셋
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!shadowActiveState) setColorState('idle');
  }, [shadowActiveState]);

  return (
    <>
      <PropertySection>
        <BatchSurfaceRows
          getMixedValue={surface?.getMixedValue ?? getMixedValue}
          activeMixedValue={activeMixedValue}
          effectiveColorState={effectiveColorState}
          showStateTabs={shadowActiveState}
          onStateModeChange={setColorState}
          imageSuppressesDefaultBorder={imageSuppressesDefaultBorder}
          batchSelectionKey={batchSelectionKey}
          onStylePropertyPreview={onStylePropertyPreview}
          onStylePropertyCommit={
            surface?.onStylePropertyCommit ?? onStylePropertyCommit
          }
          onPaintPreview={onPaintPreview}
          onPaintCommit={surface?.onPaintCommit ?? onPaintCommit}
          panelElement={panelElement}
          t={t}
        />
        {hideImage ? null : (
          <BatchImageButtonRow
            showBatchImagePicker={showBatchImagePicker}
            onToggleBatchImagePicker={onToggleBatchImagePicker}
            batchImageButtonRef={batchImageButtonRef}
            t={t}
          />
        )}
      </PropertySection>

      {showShadowControls ? (
        <BatchShadowSection
          getMixedValue={getShadowMixedValue ?? getMixedValue}
          getActiveMixedValue={activeMixedValue}
          showActiveState={shadowActiveState}
          shadowKind={shadowKind}
          onShadowCommit={onShadowCommit}
          onStylePropertyPreview={onStylePropertyPreview}
          panelElement={panelElement}
          t={t}
        />
      ) : null}

      {(!hideDisplayText || !hideFontControls) && (
        <BatchTypographySection
          hideDisplayText={hideDisplayText}
          hideFontControls={hideFontControls}
          getMixedValue={typography?.getMixedValue ?? getMixedValue}
          getActiveMixedValue={
            typography?.getActiveMixedValue ?? activeMixedValue
          }
          getSelectedKeysData={
            typography?.getSelectedKeysData ?? getSelectedKeysData
          }
          effectiveColorState={
            typography?.showActiveState ?? shadowActiveState
              ? effectiveColorState
              : 'idle'
          }
          showActiveState={typography?.showActiveState ?? shadowActiveState}
          onColorStateChange={setColorState}
          batchSelectionKey={batchSelectionKey}
          onStylePropertyPreview={
            typography?.onStylePropertyPreview ?? onStylePropertyPreview
          }
          onStylePropertyCommit={
            typography?.onStylePropertyCommit ?? onStylePropertyCommit
          }
          onFontColorPreview={onFontColorPreview}
          onFontColorCommit={onFontColorCommit}
          onElementPropertyCommit={
            typography?.onElementPropertyCommit ?? onElementPropertyCommit
          }
          panelElement={panelElement}
          t={t}
        />
      )}

      {/* 커스텀 CSS 활성화 시에만 클래스명 및 CSS 우선순위 표시 */}
      {useCustomCSS && (
        <BatchCustomCssSection
          getMixedValue={getMixedValue}
          onUseInlineStylesCommit={(useInlineStyles) =>
            onElementPropertyCommit?.({ useInlineStyles })
          }
          onStylePropertyPreview={onStylePropertyPreview}
          onStylePropertyCommit={onStylePropertyCommit}
          t={t}
        />
      )}

      {showSoundControls ? (
        <BatchSoundSection
          soundBinding={soundBinding}
          onSoundPathCommit={onSoundPathCommit}
          onSoundEnabledCommit={onSoundEnabledCommit}
          onSoundVolumeCommit={onSoundVolumeCommit}
          getMixedValue={getMixedValue}
          getKeyOnlyMixedValue={getKeyOnlyMixedValue}
          t={t}
        />
      ) : null}
    </>
  );
};

export default BatchStyleBody;
