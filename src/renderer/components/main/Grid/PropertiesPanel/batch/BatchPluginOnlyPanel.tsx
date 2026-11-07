import React from 'react';
import { PANEL_ROOT_CLASS } from '../navigation/panelChrome';
import { PropertySection } from '../controls/PropertyInputs';
import { TABS, type TabType } from '../types';
import BatchGeometrySection from './geometry/BatchGeometrySection';
import { BatchSizeRow, type BatchGeometry } from './geometry/BatchGeometryRows';
import EditSessionBoundary from '../selection/EditSessionBoundary';
import BatchPanelHeader from './BatchPanelHeader';
import type { MixedValueResult } from './batchPanelShared';
import OverlayScrollbar from '@components/main/common/overlayScrollbar/OverlayScrollbar';

interface BatchPluginOnlyPanelProps {
  setPanelElement: (el: HTMLDivElement | null) => void;
  // 플러그인 단독 다중 선택 개수
  totalCount: number;
  selectedGroupInfo: { id: string; name: string; memberCount: number } | null;
  isRenaming: boolean;
  renameInputRef: React.RefObject<HTMLInputElement | null>;
  renameValue: string;
  setRenameValue: (value: string) => void;
  renameCancelledRef: React.MutableRefObject<boolean>;
  handleRenameCommit: (value: string) => void;
  handleRenameCancel: () => void;
  handleRenameStart: () => void;
  handleBatchAlign: (
    direction: 'left' | 'centerH' | 'right' | 'top' | 'centerV' | 'bottom',
  ) => void;
  handleBatchDistribute: (direction: 'horizontal' | 'vertical') => void;
  handleBatchSpacing: (
    spacing: number,
    options?: { gestureId?: string; deferSave?: boolean },
  ) => void;
  handleBatchSpacingCommit: (
    spacing: number,
    options?: { gestureId?: string; deferSave?: boolean },
  ) => void;
  getBatchSpacingValue: () => MixedValueResult<number>;
  batchScrollRefFor: (tab: TabType) => (node: HTMLDivElement | null) => void;
  // 크기를 정하는 플러그인 요소가 있으면 크기 일괄 (그 요소들만)
  sizeGeometry?: Pick<
    BatchGeometry,
    'getBatchSizeValue' | 'handleBatchResize' | 'handleBatchResizePreview'
  >;
  // 크기 입력 Escape - 플러그인은 크기 조절 중 미리보기가 없어 거둘 것이 없다
  onCancelResize?: () => void;
  // 고른 플러그인 요소의 설정 - 정의마다 섹션 하나 (그 플러그인 스키마로)
  pluginSettings?: React.ReactNode;
  t: (key: string) => string | undefined;
}

// 정렬·분배·간격, 크기는 크기를 정하는 플러그인(resizable)만 - 나머지 크기는 내용이 정한다.
// 겉모습 일괄 칸은 플러그인 스키마 소유라 대상이 아니고, 설정은 정의마다 그 스키마로 고친다
const BatchPluginOnlyPanel: React.FC<BatchPluginOnlyPanelProps> = ({
  setPanelElement,
  totalCount,
  selectedGroupInfo,
  isRenaming,
  renameInputRef,
  renameValue,
  setRenameValue,
  renameCancelledRef,
  handleRenameCommit,
  handleRenameCancel,
  handleRenameStart,
  handleBatchAlign,
  handleBatchDistribute,
  handleBatchSpacing,
  handleBatchSpacingCommit,
  getBatchSpacingValue,
  batchScrollRefFor,
  sizeGeometry,
  onCancelResize = () => {},
  pluginSettings,
  t,
}) => {
  const batchPluginSpacing = getBatchSpacingValue();

  return (
    <div ref={setPanelElement} className={PANEL_ROOT_CLASS}>
      <div className="flex-shrink-0">
        <BatchPanelHeader
          totalCount={totalCount}
          selectedGroupInfo={selectedGroupInfo}
          isRenaming={isRenaming}
          renameInputRef={renameInputRef}
          renameValue={renameValue}
          setRenameValue={setRenameValue}
          renameCancelledRef={renameCancelledRef}
          handleRenameCommit={handleRenameCommit}
          handleRenameCancel={handleRenameCancel}
          handleRenameStart={handleRenameStart}
          t={t}
        />
      </div>

      <div className="flex-1 properties-panel-overlay-scroll">
        <div
          ref={batchScrollRefFor(TABS.STYLE)}
          className="properties-panel-overlay-viewport"
        >
          <EditSessionBoundary>
            <PropertySection>
              <BatchGeometrySection
                totalCount={totalCount}
                handleBatchAlign={handleBatchAlign}
                handleBatchDistribute={handleBatchDistribute}
                handleBatchSpacing={handleBatchSpacing}
                handleBatchSpacingCommit={handleBatchSpacingCommit}
                batchSpacing={batchPluginSpacing}
                t={t}
              />
              {sizeGeometry && (
                <BatchSizeRow
                  geometry={sizeGeometry}
                  onCancelResize={onCancelResize}
                  t={t}
                />
              )}
            </PropertySection>
            {pluginSettings}
          </EditSessionBoundary>
        </div>
        <OverlayScrollbar />
      </div>
    </div>
  );
};

export default BatchPluginOnlyPanel;
