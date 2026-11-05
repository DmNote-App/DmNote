import React from 'react';

import { AXIS_FIELD_WIDTH } from '@utils/cardRecipes';
import { NumberInput, PropertyRow } from '../../controls/PropertyInputs';
import BatchGeometrySection from './BatchGeometrySection';
import SelectionRotationInput from './SelectionRotationInput';

type AlignDirection =
  | 'left'
  | 'centerH'
  | 'right'
  | 'top'
  | 'centerV'
  | 'bottom';

// 일괄 정렬·분배·간격·크기 처리기 - 옛 종류 선택은 속성 패널이 플러그인 요소와 함께 만든다
export interface BatchGeometry {
  handleBatchAlign: (direction: AlignDirection) => void;
  handleBatchDistribute: (direction: 'horizontal' | 'vertical') => void;
  handleBatchSpacing: (
    spacing: number,
    options?: { gestureId?: string },
  ) => void;
  handleBatchSpacingCommit: (
    spacing: number,
    options?: { gestureId?: string },
  ) => void;
  getBatchSpacingValue: () => { isMixed: boolean; value: number };
  // 크기 표시 - 크기 조절이 고치는 대상 전부(스프라이트·플러그인 요소 포함)의 값
  getBatchSizeValue: (dimension: 'width' | 'height') => {
    isMixed: boolean;
    value: number;
  };
  handleBatchResize: (dimension: 'width' | 'height', value: number) => void;
  handleBatchResizePreview: (
    dimension: 'width' | 'height',
    value: number,
  ) => void;
}

interface BatchGeometryRowsProps {
  totalCount: number;
  geometry: BatchGeometry;
  // 크기 입력 Escape - 진행 중 미리보기를 거둔다
  onCancelResize: () => void;
  t: (key: string) => string | undefined;
}

interface BatchSizeRowProps {
  geometry: Pick<
    BatchGeometry,
    'getBatchSizeValue' | 'handleBatchResize' | 'handleBatchResizePreview'
  >;
  onCancelResize: () => void;
  t: (key: string) => string | undefined;
}

/** 일괄 크기(W·H) 칸 - 크기 조절이 고치는 대상 전부의 값 */
export const BatchSizeRow = ({
  geometry,
  onCancelResize,
  t,
}: BatchSizeRowProps) => (
  <PropertyRow label={t('propertiesPanel.size') || '크기'}>
    {(['width', 'height'] as const).map((dimension) => {
      const state = geometry.getBatchSizeValue(dimension);
      return (
        <NumberInput
          key={dimension}
          value={state.value}
          onChange={(value) => geometry.handleBatchResize(dimension, value)}
          onPreview={(value) =>
            geometry.handleBatchResizePreview(dimension, value)
          }
          onCancel={onCancelResize}
          prefix={dimension === 'width' ? 'W' : 'H'}
          width={AXIS_FIELD_WIDTH}
          min={10}
          max={9999}
          allowDecimal
          decimalScale={1}
          isMixed={state.isMixed}
        />
      );
    })}
  </PropertyRow>
);

/** 일괄 위치·크기 섹션 본문 - 정렬·분배·간격, 크기(W·H), 회전 (섹션 상자는 부르는 쪽) */
const BatchGeometryRows = ({
  totalCount,
  geometry,
  onCancelResize,
  t,
}: BatchGeometryRowsProps) => (
  <>
    <BatchGeometrySection
      totalCount={totalCount}
      handleBatchAlign={geometry.handleBatchAlign}
      handleBatchDistribute={geometry.handleBatchDistribute}
      handleBatchSpacing={geometry.handleBatchSpacing}
      handleBatchSpacingCommit={geometry.handleBatchSpacingCommit}
      batchSpacing={geometry.getBatchSpacingValue()}
      t={t}
    />
    <BatchSizeRow geometry={geometry} onCancelResize={onCancelResize} t={t} />
    <SelectionRotationInput label={t('propertiesPanel.rotation') || '회전'} />
  </>
);

export default BatchGeometryRows;
