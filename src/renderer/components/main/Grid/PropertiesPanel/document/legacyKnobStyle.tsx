import React, { useRef, useState } from 'react';
import { ACTION_BUTTON_CHROME_CLASS } from '@utils/cardRecipes';
import { editGestureController } from '@src/renderer/editor/runtime/gesture/editGestureController';
import { isNativeElementId } from '@src/renderer/editor/model/elementId';
import type { EditStateAnchor } from '@stores/grid/useEditStatePreviewStore';
import type { KnobItemPosition } from '@src/types/key/knobs';
import { gradientToCss } from '@src/types/color';
import {
  DEFAULT_ELEMENT_BORDER_WIDTH,
  DEFAULT_ELEMENT_SHADOW_SPEC,
  DEFAULT_ELEMENT_ACTIVE_SHADOW_SPEC,
} from '@utils/element/elementDefaults';
import {
  elementShadowLeafFromPartial,
  resolveElementShadowForPosition,
} from '@src/types/key/shadows';
import Checkbox from '@components/main/common/checkbox/Checkbox';
import ColorPicker from '@components/main/Modal/content/pickers/color/ColorPicker';
import PopupExit from '@components/main/Modal/PopupExit';
import { ColorSwatchButton } from '@components/main/Modal/content/pickers/color/ColorSwatch';
import {
  NumberInput,
  PropertyRow,
  PropertySection,
  TextInput,
} from '../controls/PropertyInputs';
import ShadowControls from '../controls/ShadowControls';
import SingleImagePickerPopup from '../single/SingleImagePickerPopup';
import { useSingleStyleColorController } from '../single/useSingleStyleColorController';
import type { PanelWriter } from './documentPanelWriter';
import type { Translate } from './documentPanelModel';

interface LegacyKnobStyleProps {
  sceneId: string;
  // 옛 노브 패널이 보던 값 - 트리 값 + 편집 미리보기 (옛 칸 모양)
  position: KnobItemPosition;
  writer: PanelWriter;
  panelElement: HTMLElement | null;
  useCustomCSS: boolean;
  t: Translate;
}

/** 노브 겉모습 - 옛 노브 패널 그대로: 대기·입력 색 견본과 피커, 두께, 반경(미지정 시 원형), 사용자 이미지,
 * 사용자 CSS(같은 섹션 안), 그림자 */
const LegacyKnobStyle = ({
  sceneId,
  position,
  writer,
  panelElement,
  useCustomCSS,
  t: translate,
}: LegacyKnobStyleProps) => {
  const t = (key: string) => translate(key) ?? '';
  const imageButtonRef = useRef<HTMLButtonElement | null>(null);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const className = position.className || '';
  const [classNameDraft, setClassNameDraft] = useState({
    source: className,
    value: className,
  });
  // 저장된 클래스가 바뀌면(되돌리기·다른 창) 입력 중 값도 따라간다
  if (classNameDraft.source !== className) {
    setClassNameDraft({ source: className, value: className });
  }

  // 그림자·이미지 피커의 캔버스 상태 프리뷰 대상 (색 피커는 세션 훅이 발행)
  const knobPreviewAnchor: EditStateAnchor | null =
    position.id && isNativeElementId(position.id)
      ? { kind: 'knob', id: position.id }
      : null;

  const {
    pickerFor,
    setPickerFor,
    effectiveColorState: colorState,
    setColorState,
    backgroundColorButtonRef: bgColorBtnRef,
    borderColorButtonRef: borderColorBtnRef,
    handlePickerToggle,
    colorValueFor,
    handleColorChange,
    gradientSpecFor,
    gradientState: knobGradientState,
  } = useSingleStyleColorController({
    keyPosition: position,
    shadowActiveState: true,
    canvasAnchor: knobPreviewAnchor ?? undefined,
    contextSelectedKeyType: sceneId,
    pickerResetScope: sceneId,
    pickerResetTarget: position.id,
    onPickerReset: setShowImagePicker,
    suppressDefaultBorderForImage: false,
    onPaintPreview: writer.previewPaint,
    onPaintCommit: writer.commitPaint,
  });

  // 라운딩 기본값: 미지정 시 원형(짧은 변의 절반)
  const effectiveBorderRadius =
    position.borderRadius ??
    Math.round(Math.min(position.width || 60, position.height || 60) / 2);
  const knobIdleShadow = resolveElementShadowForPosition({
    position,
    elementType: 'knob',
    active: false,
    defaultShadow: DEFAULT_ELEMENT_SHADOW_SPEC,
    defaultActiveShadow: DEFAULT_ELEMENT_ACTIVE_SHADOW_SPEC,
  });
  const knobActiveShadow = resolveElementShadowForPosition({
    position,
    elementType: 'knob',
    active: true,
    defaultShadow: DEFAULT_ELEMENT_SHADOW_SPEC,
    defaultActiveShadow: DEFAULT_ELEMENT_ACTIVE_SHADOW_SPEC,
  });

  return (
    <>
      <PropertySection>
        {/* 배경색 (대기/입력 상태 전환은 피커 내부 토글) */}
        <PropertyRow label={t('propertiesPanel.backgroundColor') || '배경색'}>
          <ColorSwatchButton
            ref={bgColorBtnRef}
            type="button"
            onClick={() => handlePickerToggle('backgroundColor')}
            open={pickerFor === 'backgroundColor'}
            className="w-[23px] h-[23px] rounded-md cursor-pointer transition-shadow flex-shrink-0"
            surfaceClassName="rounded-md"
            color={colorValueFor('backgroundColor')}
            image={(() => {
              const spec = gradientSpecFor('backgroundColor');
              return spec ? gradientToCss(spec) : undefined;
            })()}
          />
        </PropertyRow>

        {/* 테두리 색상 */}
        <PropertyRow label={t('propertiesPanel.borderColor') || '테두리 색상'}>
          <ColorSwatchButton
            ref={borderColorBtnRef}
            type="button"
            onClick={() => handlePickerToggle('borderColor')}
            open={pickerFor === 'borderColor'}
            className="w-[23px] h-[23px] rounded-md cursor-pointer transition-shadow flex-shrink-0"
            surfaceClassName="rounded-md"
            color={colorValueFor('borderColor')}
            image={(() => {
              const spec = gradientSpecFor('borderColor');
              return spec ? gradientToCss(spec) : undefined;
            })()}
          />
        </PropertyRow>

        {/* 테두리 두께 */}
        <PropertyRow label={t('propertiesPanel.borderWidth') || '테두리 두께'}>
          <NumberInput
            value={position.borderWidth ?? DEFAULT_ELEMENT_BORDER_WIDTH}
            onChange={(value) =>
              writer.commitStyle({ property: 'borderWidth', value: value })
            }
            suffix="px"
            min={0}
            max={20}
          />
        </PropertyRow>

        {/* 모서리 반경 (미지정 시 원형) */}
        <PropertyRow label={t('propertiesPanel.borderRadius') || '모서리 반경'}>
          <NumberInput
            value={effectiveBorderRadius}
            onChange={(value) =>
              writer.commitStyle({ property: 'borderRadius', value: value })
            }
            suffix="px"
            min={0}
            max={999}
          />
        </PropertyRow>

        <PropertyRow label={t('propertiesPanel.customImage') || 'Custom Image'}>
          <button
            ref={imageButtonRef}
            type="button"
            className={`${ACTION_BUTTON_CHROME_CLASS} ${
              showImagePicker ? 'shadow-focus-ring' : ''
            } text-fg text-body`}
            onClick={() => setShowImagePicker(!showImagePicker)}
          >
            {t('propertiesPanel.configure') || 'Configure'}
          </button>
        </PropertyRow>

        {useCustomCSS && (
          <>
            <div className="flex justify-between items-center w-full min-h-[32px]">
              <p className="text-fg-muted text-label">
                {t('propertiesPanel.useInlineStyles') || '인라인 스타일 우선'}
              </p>
              <Checkbox
                commitStrategy="after-paint"
                checked={position.useInlineStyles ?? false}
                onChange={() =>
                  writer.commitField(
                    'useInlineStyles',
                    !(position.useInlineStyles ?? false),
                  )
                }
              />
            </div>

            <PropertyRow label={t('propertiesPanel.className') || '클래스'}>
              <TextInput
                value={classNameDraft.value}
                onChange={(value) =>
                  setClassNameDraft({ source: className, value })
                }
                onBlur={(value) =>
                  writer.commitStyle({ property: 'className', value: value })
                }
                placeholder="className"
                width="90px"
              />
            </PropertyRow>
          </>
        )}
      </PropertySection>

      <ShadowControls
        idleShadow={knobIdleShadow}
        activeShadow={knobActiveShadow}
        previewAnchor={knobPreviewAnchor}
        onChange={(state, _shadow, patch) => {
          const leaf = elementShadowLeafFromPartial(patch);
          if (!leaf) return;
          writer.commitShadow(
            state === 'active'
              ? { property: 'activeShadow', value: leaf }
              : { property: 'shadow', value: leaf },
          );
        }}
        onPreview={(state, leaf) =>
          writer.previewStyle({
            property: state === 'active' ? 'activeShadow' : 'shadow',
            value: leaf,
          })
        }
        onPreviewCancel={() => editGestureController.cancel()}
        onEnabledChange={(enabled) => {
          writer.commitShadow({ property: 'shadowEnabled', value: enabled });
        }}
        panelElement={panelElement}
        t={t}
      />

      <SingleImagePickerPopup
        open={showImagePicker}
        keyPosition={position}
        imageButtonRef={imageButtonRef as React.RefObject<HTMLButtonElement>}
        panelElement={panelElement}
        canvasAnchor={knobPreviewAnchor ?? undefined}
        showActiveState
        showTransformControls={false}
        fallbackEmptyImageFit
        requireMountedReference
        onToggle={() => setShowImagePicker(false)}
        onInactiveImageCommit={writer.commitInactiveImage}
        onActiveImageCommit={writer.commitActiveImage}
        onIdleTransparentCommit={writer.commitIdleTransparent}
        onActiveTransparentCommit={writer.commitActiveTransparent}
        onIdleImageFitCommit={writer.commitIdleImageFit}
        onActiveImageFitCommit={writer.commitActiveImageFit}
      />

      {/* 대기/입력 색상 ColorPicker (키 패널과 동일한 stateMode 토글) */}
      <PopupExit open={Boolean(pickerFor)}>
        {pickerFor ? (
          <ColorPicker
            open={!!pickerFor}
            referenceRef={
              pickerFor === 'backgroundColor'
                ? bgColorBtnRef
                : borderColorBtnRef
            }
            panelElement={panelElement}
            color={knobGradientState.pickerColor}
            onColorChange={(c: string) =>
              knobGradientState.handlePickerColorChange(c, false)
            }
            onColorChangeComplete={(c: string) =>
              knobGradientState.handlePickerColorChange(c, true)
            }
            onInputCancel={(_target, restoredColor) => {
              knobGradientState.cancelPreview();
              if (pickerFor && typeof restoredColor === 'string') {
                handleColorChange(pickerFor, restoredColor);
              }
              editGestureController.cancel();
            }}
            onClose={() => setPickerFor(null)}
            solidOnly={true}
            stateMode={colorState}
            onStateModeChange={setColorState}
            interactiveRefs={[bgColorBtnRef, borderColorBtnRef]}
            headerSlot={knobGradientState.headerSlot}
            footerSlot={knobGradientState.footerSlot}
            gradientSpec={knobGradientState.paletteGradientSpec}
            onGradientSpecSelect={knobGradientState.handleGradientSpecSelect}
          />
        ) : null}
      </PopupExit>
    </>
  );
};

export default LegacyKnobStyle;
