import React, { useState, useEffect, useMemo } from 'react';
import type { KeyPosition } from '@src/types/key/keys';
import {
  PropertyRow,
  NumberInput,
  PropertySection,
} from '../../controls/PropertyInputs';
import { useKeyStore } from '@stores/data/useKeyStore';
import { usePanelSelection } from '../../../document/treeEditedSelection';
import {
  EMPTY_BATCH_ELEMENT_BINDING,
  type BatchElementBinding,
} from '@hooks/pickers/useBatchElementBinding';
import BatchGeometrySection from '../geometry/BatchGeometrySection';
import { editGestureController } from '@src/renderer/editor/runtime/gesture/editGestureController';
import { AXIS_FIELD_WIDTH } from '@utils/cardRecipes';
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
import SelectionRotationInput from '../geometry/SelectionRotationInput';
import BatchCustomCssSection from './BatchCustomCssSection';
import { BatchImageButtonRow, BatchSurfaceRows } from './BatchSurfaceRows';

export { BATCH_STYLE_SOUND_PAGE_KEY } from './BatchSoundSection';

interface BatchStyleTabContentProps {
  // 다중 선택 정보
  selectedCount: number;
  // native+plugin 합산 개수 - 분배 게이트 판정용 (미전달 시 selectedCount)
  totalCount?: number;
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
  showSoundControls?: boolean;
  showShadowControls?: boolean;
  // 선택에 키·노브가 없으면(통계뿐) 그림자 대기만 편집
  shadowActiveState?: boolean;
  shadowKind?: 'key' | 'knob';
  /** 이미지가 기본 립을 억제하는 요소인지 - 키·통계만 (그래프·노브 렌더는 억제하지 않는다) */
  imageSuppressesDefaultBorder?: boolean;
  afterSizeContent?: React.ReactNode;
  // getMixedValue 함수
  getMixedValue: <T>(
    getter: (pos: KeyPosition) => T | undefined,
    defaultValue: T,
  ) => { isMixed: boolean; value: T };
  // 크기 전용 - 스타일 필드와 조절 대상이 다르다 (스프라이트는 스타일이 없지만
  // 크기는 조절된다). 표시와 조절이 갈리면 대표값에 가린 채 덮인다
  getMixedValueSize: <T>(
    getter: (pos: KeyPosition) => T | undefined,
    defaultValue: T,
  ) => { isMixed: boolean; value: T };
  // getSelectedKeysData 함수 (displayText Mixed 판단용)
  getSelectedKeysData: () => BatchTypographyKeyData[];
  // 핸들러
  handleBatchAlign: (
    direction: 'left' | 'centerH' | 'right' | 'top' | 'centerV' | 'bottom',
  ) => void;
  handleBatchDistribute: (direction: 'horizontal' | 'vertical') => void;
  handleBatchSpacing: (
    spacing: number,
    options?: { gestureId?: string },
  ) => void;
  handleBatchSpacingPreview?: (spacing: number) => void;
  handleBatchSpacingCommit?: (
    spacing: number,
    options?: { gestureId?: string },
  ) => void;
  batchSpacing: { isMixed: boolean; value: number };
  handleBatchResize: (dimension: 'width' | 'height', value: number) => void;
  handleBatchResizePreview: (
    dimension: 'width' | 'height',
    value: number,
  ) => void;
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
}

// 위치·크기 아래 겉모습 본문 - 표면·이미지·그림자·글자·사용자 CSS·사운드 (선언 일괄 패널도 이것을 그린다)
export type BatchStyleBodyProps = Omit<
  BatchStyleTabContentProps,
  | 'selectedCount'
  | 'totalCount'
  | 'afterSizeContent'
  | 'getMixedValueSize'
  | 'handleBatchAlign'
  | 'handleBatchDistribute'
  | 'handleBatchSpacing'
  | 'handleBatchSpacingPreview'
  | 'handleBatchSpacingCommit'
  | 'batchSpacing'
  | 'handleBatchResize'
  | 'handleBatchResizePreview'
>;

export const BatchStyleBody = ({
  hideDisplayText = false,
  hideFontControls = false,
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
  const batchSelectionKey = useMemo(
    () =>
      `${selectedKeyType}:${selectedElements
        .map((el) => el.id)
        .sort()
        .join(',')}`,
    [selectedKeyType, selectedElements],
  );
  useEffect(() => {
    // 눌림 상태 편집 능력이 사라지면 저장된 active 탭 선택도 리셋
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!shadowActiveState) setColorState('idle');
  }, [shadowActiveState]);

  return (
    <>
      <PropertySection>
        <BatchSurfaceRows
          getMixedValue={getMixedValue}
          activeMixedValue={activeMixedValue}
          effectiveColorState={effectiveColorState}
          showStateTabs={shadowActiveState}
          onStateModeChange={setColorState}
          imageSuppressesDefaultBorder={imageSuppressesDefaultBorder}
          batchSelectionKey={batchSelectionKey}
          onStylePropertyPreview={onStylePropertyPreview}
          onStylePropertyCommit={onStylePropertyCommit}
          onPaintPreview={onPaintPreview}
          onPaintCommit={onPaintCommit}
          panelElement={panelElement}
          t={t}
        />
        <BatchImageButtonRow
          showBatchImagePicker={showBatchImagePicker}
          onToggleBatchImagePicker={onToggleBatchImagePicker}
          batchImageButtonRef={batchImageButtonRef}
          t={t}
        />
      </PropertySection>

      {showShadowControls ? (
        <BatchShadowSection
          getMixedValue={getMixedValue}
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
          getMixedValue={getMixedValue}
          getActiveMixedValue={activeMixedValue}
          getSelectedKeysData={getSelectedKeysData}
          effectiveColorState={effectiveColorState}
          showActiveState={shadowActiveState}
          onColorStateChange={setColorState}
          batchSelectionKey={batchSelectionKey}
          onStylePropertyPreview={onStylePropertyPreview}
          onStylePropertyCommit={onStylePropertyCommit}
          onFontColorPreview={onFontColorPreview}
          onFontColorCommit={onFontColorCommit}
          onElementPropertyCommit={onElementPropertyCommit}
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

const BatchStyleTabContent: React.FC<BatchStyleTabContentProps> = ({
  selectedCount,
  totalCount,
  afterSizeContent,
  getMixedValueSize,
  handleBatchAlign,
  handleBatchDistribute,
  handleBatchSpacing,
  handleBatchSpacingCommit,
  batchSpacing,
  handleBatchResize,
  handleBatchResizePreview,
  t,
  ...body
}) => (
  <>
    <PropertySection>
      {/* 정렬·분배·간격 - 공통 기하 섹션 */}
      <BatchGeometrySection
        totalCount={totalCount ?? selectedCount}
        handleBatchAlign={handleBatchAlign}
        handleBatchDistribute={handleBatchDistribute}
        handleBatchSpacing={handleBatchSpacing}
        handleBatchSpacingCommit={handleBatchSpacingCommit}
        batchSpacing={batchSpacing}
        t={t}
      />

      {/* 크기 */}
      <PropertyRow label={t('propertiesPanel.size') || '크기'}>
        <NumberInput
          value={getMixedValueSize((pos) => pos.width, 60).value}
          onChange={(value) => handleBatchResize('width', value)}
          onPreview={(value) => handleBatchResizePreview('width', value)}
          onCancel={() => editGestureController.cancel()}
          prefix="W"
          width={AXIS_FIELD_WIDTH}
          min={10}
          max={9999}
          allowDecimal
          decimalScale={1}
          isMixed={getMixedValueSize((pos) => pos.width, 60).isMixed}
        />
        <NumberInput
          value={getMixedValueSize((pos) => pos.height, 60).value}
          onChange={(value) => handleBatchResize('height', value)}
          onPreview={(value) => handleBatchResizePreview('height', value)}
          onCancel={() => editGestureController.cancel()}
          prefix="H"
          width={AXIS_FIELD_WIDTH}
          min={10}
          max={9999}
          allowDecimal
          decimalScale={1}
          isMixed={getMixedValueSize((pos) => pos.height, 60).isMixed}
        />
      </PropertyRow>

      <SelectionRotationInput label={t('propertiesPanel.rotation') || '회전'} />
    </PropertySection>

    {afterSizeContent ? (
      <PropertySection>{afterSizeContent}</PropertySection>
    ) : null}

    <BatchStyleBody t={t} {...body} />
  </>
);

export default BatchStyleTabContent;
