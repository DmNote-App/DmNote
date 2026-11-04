import React, { useEffect, useSyncExternalStore } from 'react';

import { useTranslation } from '@contexts/useTranslation';
import { isNativeElementId } from '@src/renderer/editor/model/elementId';
import type { PanelFieldControlProps } from '../../defineElementKind';
import {
  knobAxisCaptureKey,
  knobAxisCaptureTarget,
  retainKnobAxisCapture,
  startKnobAxisCapture,
  stopKnobAxisCapture,
  subscribeKnobAxisCapture,
} from './knobAxisCapture';

/** 노브 축 매핑 - 버튼을 누르고 노브를 돌리면 가장 많이 움직인 축으로 묶는다 (키 매핑과 같은 라벨·버튼 구조).
 * 감지는 시작한 노브들(여럿이면 고른 노브 모두)에 묶이고, 감지 중 표시도 그 노브들의 칸에만 보인다 */
const KnobAxisControl = ({
  value,
  isMixed = false,
  elementIds,
}: PanelFieldControlProps) => {
  const { t } = useTranslation();
  const target = useSyncExternalStore(
    subscribeKnobAxisCapture,
    knobAxisCaptureTarget,
    knobAxisCaptureTarget,
  );
  useEffect(() => retainKnobAxisCapture(), []);
  const capturing =
    elementIds.length > 0 && target === knobAxisCaptureKey(elementIds);
  // 노브마다 축이 다르면 감지 안내만 (칸 이름 옆에 Mixed)
  const axisId = !isMixed && typeof value === 'string' ? value : '';

  const axisLabel =
    axisId === 'WHEEL:VERTICAL'
      ? t('propertiesPanel.knobAxisWheelVertical')
      : axisId === 'WHEEL:HORIZONTAL'
      ? t('propertiesPanel.knobAxisWheelHorizontal')
      : axisId.replace(/^HIDA:/, '');

  return (
    <button
      type="button"
      onClick={() => {
        // 이 노브가 대기 중일 때만 토글 해제. 다른 노브의 잔여 대기는 취소가 아니라 이 노브로 옮긴다
        if (
          capturing ||
          elementIds.length === 0 ||
          !elementIds.every((id) => isNativeElementId(id))
        ) {
          stopKnobAxisCapture();
        } else startKnobAxisCapture(elementIds);
      }}
      className={`flex items-center justify-center h-[23px] min-w-[0px] px-[8px] bg-fill hover:bg-fill-hover active:bg-fill-active transition-colors duration-fast rounded-md ${
        capturing ? 'shadow-focus-ring' : ''
      } text-fg text-body`}
      title={axisId}
    >
      <span className="truncate max-w-[120px]">
        {capturing
          ? t('propertiesPanel.knobCapturing') || '감지 중…'
          : axisId
          ? axisLabel
          : t('propertiesPanel.knobCapture') || '노브 돌려서 감지'}
      </span>
    </button>
  );
};

export default KnobAxisControl;
