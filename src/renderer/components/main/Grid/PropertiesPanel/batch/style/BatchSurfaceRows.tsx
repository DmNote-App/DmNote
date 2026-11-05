import React from 'react';
import type { KeyPosition } from '@src/types/key/keys';
import { paintDescriptor, resolveStatePair } from '@src/types/color';
import { parseAlphaPercent, toRgbHexColor } from '@utils/color/colorUtils';
import {
  ColorInput,
  NumberInput,
  PropertyRow,
} from '../../controls/PropertyInputs';
import {
  DEFAULT_ELEMENT_BG,
  DEFAULT_ELEMENT_ACTIVE_BG,
  DEFAULT_ELEMENT_BORDER,
  DEFAULT_ELEMENT_ACTIVE_BORDER,
  DEFAULT_ELEMENT_BORDER_WIDTH,
  DEFAULT_ELEMENT_RADIUS,
} from '@utils/element/elementDefaults';
import {
  elementImageReplacesSurface,
  resolveElementBorder,
} from '@utils/element/elementBorder';
import { editGestureController } from '@src/renderer/editor/runtime/gesture/editGestureController';
import { ACTION_BUTTON_CHROME_CLASS } from '@utils/cardRecipes';
import type {
  EditorPaintPropertyPatchV1,
  EditorPreviewStylePropertyPatchV1,
  EditorStylePropertyPreviewPatchV1,
} from '@src/types/editor';

// 일괄 스타일 탭의 표면 칸(배경·테두리 칠, 두께, 반경)과 사용자 이미지 버튼 - 옛 일괄 패널과
// 선언 일괄 패널이 같이 쓴다

type MixedValueGetter = <T>(
  getter: (pos: KeyPosition) => T | undefined,
  defaultValue: T,
) => { isMixed: boolean; value: T };

interface BatchSurfaceRowsProps {
  getMixedValue: MixedValueGetter;
  // 눌림 상태 집계 (키·노브) - 없으면 getMixedValue
  activeMixedValue: MixedValueGetter;
  effectiveColorState: 'idle' | 'active';
  showStateTabs: boolean;
  onStateModeChange: (state: 'idle' | 'active') => void;
  /** 이미지가 기본 립을 억제하는 요소인지 - 키·통계만 (그래프·노브 렌더는 억제하지 않는다).
   * 여러 종류가 섞이면 요소마다 */
  imageSuppressesDefaultBorder: boolean | ((position: KeyPosition) => boolean);
  // 선택 구성 시그니처 - 형식 왕복 기억·드래그 소유권이 다른 배치 선택과 교차하지 않게
  batchSelectionKey: string;
  onStylePropertyPreview?: (patch: EditorStylePropertyPreviewPatchV1) => void;
  onStylePropertyCommit?: (patch: EditorPreviewStylePropertyPatchV1) => void;
  onPaintPreview?: (patch: EditorPaintPropertyPatchV1) => void;
  onPaintCommit?: (patch: EditorPaintPropertyPatchV1) => void;
  panelElement: HTMLElement | null;
  t: (key: string) => string;
}

export const BatchSurfaceRows = ({
  getMixedValue,
  activeMixedValue,
  effectiveColorState,
  showStateTabs,
  onStateModeChange,
  imageSuppressesDefaultBorder,
  batchSelectionKey,
  onStylePropertyPreview,
  onStylePropertyCommit,
  onPaintPreview,
  onPaintCommit,
  panelElement,
  t,
}: BatchSurfaceRowsProps) => {
  const colorPairFor = (
    position: KeyPosition,
    target: 'backgroundColor' | 'borderColor',
    active: boolean,
  ) => {
    if (target === 'backgroundColor') {
      return resolveStatePair(
        active,
        {
          color: position.backgroundColor,
          gradient: position.backgroundGradient,
        },
        {
          color: position.activeBackgroundColor,
          gradient: position.activeBackgroundGradient,
        },
      );
    }
    // 테두리는 미지정 시 앱 기본 립이 들어가므로 렌더와 같은 해석기로 읽는다
    const border = resolveElementBorder(position, active, {
      suppressDefault:
        (typeof imageSuppressesDefaultBorder === 'function'
          ? imageSuppressesDefaultBorder(position)
          : imageSuppressesDefaultBorder) &&
        elementImageReplacesSurface(position, active),
    });
    return { color: border.color, gradient: border.gradient };
  };

  // 피커 칸은 hex와 알파를 따로 판단한다. 색이 같고 알파만 갈리면 hex는 공통값이다
  const mixedColorParts = (
    getColor: (position: KeyPosition) => string | undefined,
    fallback: string,
  ) => {
    const mixedFn =
      effectiveColorState === 'active' ? activeMixedValue : getMixedValue;
    return {
      hexMixed: mixedFn((pos) => toRgbHexColor(getColor(pos) ?? fallback), '')
        .isMixed,
      alphaMixed: mixedFn(
        (pos) => parseAlphaPercent(getColor(pos) ?? fallback),
        100,
      ).isMixed,
    };
  };

  return (
    <>
      {/* 배경색 */}
      <PropertyRow label={t('propertiesPanel.backgroundColor') || '배경색'}>
        {(
          effectiveColorState === 'active'
            ? activeMixedValue(
                (pos) => colorPairFor(pos, 'backgroundColor', true).color,
                DEFAULT_ELEMENT_ACTIVE_BG,
              ).isMixed
            : getMixedValue(
                (pos) => colorPairFor(pos, 'backgroundColor', false).color,
                DEFAULT_ELEMENT_BG,
              ).isMixed
        ) ? (
          <span className="text-fg-faint text-body italic">Mixed</span>
        ) : null}
        <ColorInput
          colorId={`batch-background:${batchSelectionKey}`}
          {...mixedColorParts(
            (pos) =>
              colorPairFor(
                pos,
                'backgroundColor',
                effectiveColorState === 'active',
              ).color,
            effectiveColorState === 'active'
              ? DEFAULT_ELEMENT_ACTIVE_BG
              : DEFAULT_ELEMENT_BG,
          )}
          value={
            getMixedValue(
              (pos) => colorPairFor(pos, 'backgroundColor', false).color,
              DEFAULT_ELEMENT_BG,
            ).value
          }
          activeValue={
            activeMixedValue(
              (pos) => colorPairFor(pos, 'backgroundColor', true).color,
              DEFAULT_ELEMENT_ACTIVE_BG,
            ).value
          }
          showStateTabs={showStateTabs}
          stateMode={effectiveColorState}
          onStateModeChange={onStateModeChange}
          onChange={() => {}}
          onChangeComplete={() => {}}
          onActiveChangeComplete={() => {}}
          onCancel={() => editGestureController.cancel()}
          panelElement={panelElement}
          canvasAnchor={{ kind: 'batch' }}
          gradientValue={
            getMixedValue(
              (pos) =>
                colorPairFor(pos, 'backgroundColor', false).gradient ?? null,
              null,
            ).value
          }
          activeGradientValue={
            activeMixedValue(
              (pos) =>
                colorPairFor(pos, 'backgroundColor', true).gradient ?? null,
              null,
            ).value
          }
          onModePreview={(state, modeValue) =>
            onPaintPreview?.(
              state === 'active'
                ? {
                    property: 'activeBackgroundPaint',
                    value: paintDescriptor(modeValue),
                  }
                : {
                    property: 'backgroundPaint',
                    value: paintDescriptor(modeValue),
                  },
            )
          }
          onModeCommit={(state, modeValue) =>
            onPaintCommit?.(
              state === 'active'
                ? {
                    property: 'activeBackgroundPaint',
                    value: paintDescriptor(modeValue),
                  }
                : {
                    property: 'backgroundPaint',
                    value: paintDescriptor(modeValue),
                  },
            )
          }
        />
      </PropertyRow>

      {/* 테두리 색상 */}
      <PropertyRow label={t('propertiesPanel.borderColor') || '테두리 색상'}>
        {(
          effectiveColorState === 'active'
            ? activeMixedValue(
                (pos) => colorPairFor(pos, 'borderColor', true).color,
                DEFAULT_ELEMENT_ACTIVE_BORDER,
              ).isMixed
            : getMixedValue(
                (pos) => colorPairFor(pos, 'borderColor', false).color,
                DEFAULT_ELEMENT_BORDER,
              ).isMixed
        ) ? (
          <span className="text-fg-faint text-body italic">Mixed</span>
        ) : null}
        <ColorInput
          colorId={`batch-border:${batchSelectionKey}`}
          {...mixedColorParts(
            (pos) =>
              colorPairFor(pos, 'borderColor', effectiveColorState === 'active')
                .color,
            effectiveColorState === 'active'
              ? DEFAULT_ELEMENT_ACTIVE_BORDER
              : DEFAULT_ELEMENT_BORDER,
          )}
          gradientSurface="border"
          value={
            getMixedValue(
              (pos) => colorPairFor(pos, 'borderColor', false).color,
              DEFAULT_ELEMENT_BORDER,
            ).value
          }
          activeValue={
            activeMixedValue(
              (pos) => colorPairFor(pos, 'borderColor', true).color,
              DEFAULT_ELEMENT_ACTIVE_BORDER,
            ).value
          }
          showStateTabs={showStateTabs}
          stateMode={effectiveColorState}
          onStateModeChange={onStateModeChange}
          onChange={() => {}}
          onChangeComplete={() => {}}
          onActiveChangeComplete={() => {}}
          onCancel={() => editGestureController.cancel()}
          panelElement={panelElement}
          canvasAnchor={{ kind: 'batch' }}
          gradientValue={
            getMixedValue(
              (pos) => colorPairFor(pos, 'borderColor', false).gradient ?? null,
              null,
            ).value
          }
          activeGradientValue={
            activeMixedValue(
              (pos) => colorPairFor(pos, 'borderColor', true).gradient ?? null,
              null,
            ).value
          }
          onModePreview={(state, modeValue) =>
            onPaintPreview?.(
              state === 'active'
                ? {
                    property: 'activeBorderPaint',
                    value: paintDescriptor(modeValue),
                  }
                : {
                    property: 'borderPaint',
                    value: paintDescriptor(modeValue),
                  },
            )
          }
          onModeCommit={(state, modeValue) =>
            onPaintCommit?.(
              state === 'active'
                ? {
                    property: 'activeBorderPaint',
                    value: paintDescriptor(modeValue),
                  }
                : {
                    property: 'borderPaint',
                    value: paintDescriptor(modeValue),
                  },
            )
          }
        />
      </PropertyRow>

      {/* 테두리 두께 */}
      <PropertyRow label={t('propertiesPanel.borderWidth') || '테두리 두께'}>
        {getMixedValue(
          (pos) => pos.borderWidth ?? DEFAULT_ELEMENT_BORDER_WIDTH,
          DEFAULT_ELEMENT_BORDER_WIDTH,
        ).isMixed ? (
          <span className="text-fg-faint text-body italic">Mixed</span>
        ) : null}
        <NumberInput
          value={
            getMixedValue(
              (pos) => pos.borderWidth ?? DEFAULT_ELEMENT_BORDER_WIDTH,
              DEFAULT_ELEMENT_BORDER_WIDTH,
            ).value
          }
          onChange={(value) =>
            onStylePropertyCommit?.({ property: 'borderWidth', value: value })
          }
          onPreview={(value) =>
            onStylePropertyPreview?.({
              property: 'borderWidth',
              value: value,
            })
          }
          onCancel={() => editGestureController.cancel()}
          suffix="px"
          min={0}
          max={20}
          allowDecimal
          decimalScale={1}
        />
      </PropertyRow>

      {/* 모서리 반경 */}
      <PropertyRow label={t('propertiesPanel.borderRadius') || '모서리 반경'}>
        {getMixedValue((pos) => pos.borderRadius, DEFAULT_ELEMENT_RADIUS)
          .isMixed ? (
          <span className="text-fg-faint text-body italic">Mixed</span>
        ) : null}
        <NumberInput
          value={
            getMixedValue((pos) => pos.borderRadius, DEFAULT_ELEMENT_RADIUS)
              .value
          }
          onChange={(value) =>
            onStylePropertyCommit?.({
              property: 'borderRadius',
              value: value,
            })
          }
          onPreview={(value) =>
            onStylePropertyPreview?.({
              property: 'borderRadius',
              value: value,
            })
          }
          onCancel={() => editGestureController.cancel()}
          suffix="px"
          min={0}
          max={100}
          allowDecimal
          decimalScale={1}
        />
      </PropertyRow>
    </>
  );
};

interface BatchImageButtonRowProps {
  showBatchImagePicker: boolean;
  onToggleBatchImagePicker: () => void;
  batchImageButtonRef: React.RefObject<HTMLButtonElement>;
  t: (key: string) => string;
}

export const BatchImageButtonRow = ({
  showBatchImagePicker,
  onToggleBatchImagePicker,
  batchImageButtonRef,
  t,
}: BatchImageButtonRowProps) => (
  <PropertyRow label={t('propertiesPanel.customImage') || '커스텀 이미지'}>
    <button
      ref={batchImageButtonRef}
      type="button"
      className={`${ACTION_BUTTON_CHROME_CLASS} ${
        showBatchImagePicker ? 'shadow-focus-ring' : ''
      } text-fg text-body`}
      onClick={onToggleBatchImagePicker}
    >
      {t('propertiesPanel.configure') || '설정하기'}
    </button>
  </PropertyRow>
);
