import React, { useRef, useState } from 'react';

import Checkbox from '@components/main/common/checkbox/Checkbox';
import {
  captureBatchElementBinding,
  useBatchElementBinding,
} from '@hooks/pickers/useBatchElementBinding';
import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import { bundleFieldViewOf } from '@src/renderer/elementKinds/runtime/bundleFieldView';
import { isNativeElementId } from '@src/renderer/editor/model/elementId';
import { paintDescriptor, type GradientSpec } from '@src/types/color';
import type { SurfaceStyledElementType } from '@src/types/elementKinds';
import type { KeyPosition } from '@src/types/key/keys';
import { supportsActiveVisualState } from '@stores/grid/useGradientEditStore';
import { ACTION_BUTTON_CHROME_CLASS } from '@utils/cardRecipes';
import { resolveElementBorder } from '@utils/element/elementBorder';
import {
  DEFAULT_ELEMENT_BG,
  DEFAULT_ELEMENT_RADIUS,
} from '@utils/element/elementDefaults';
import { aggregateMixedValue } from '../batch/mixedValue';
import {
  commitBoundActiveImage,
  commitBoundActiveTransparent,
  commitBoundIdleTransparent,
  commitBoundInactiveImage,
} from '../batch/batchPanelShared';
import BatchCustomCssSection from '../batch/style/BatchCustomCssSection';
import BatchImagePickerPopup from '../batch/style/BatchImagePickerPopup';
import {
  BatchImageButtonRow,
  BatchSurfaceRows,
} from '../batch/style/BatchSurfaceRows';
import {
  ColorInput,
  NumberInput,
  PropertyRow,
  PropertySection,
  TextInput,
} from '../controls/PropertyInputs';
import SingleImagePickerPopup from '../single/SingleImagePickerPopup';
import type { PanelWriter } from './documentPanelWriter';
import type { Translate } from './documentPanelModel';

// 옛 종류의 기능 묶음 칸 - 옛 단일·일괄 패널과 같은 부품·칸 이름·기본값으로 그리고 옛 패널 처리기로 쓴다

interface SurfaceFields {
  backgroundColor?: string;
  borderColor?: string;
  backgroundGradient?: GradientSpec | null;
  borderGradient?: GradientSpec | null;
  borderWidth?: number;
  borderRadius?: number;
}

interface LegacyRowsProps {
  sceneId: string;
  element: ElementNode;
  writer: PanelWriter;
  panelElement: HTMLElement | null;
  t: Translate;
}

/** 표면 묶음 - 배경·테두리 칠(그라데이션·캔버스 각도 손잡이), 두께, 반경 */
export const LegacySurfaceRows = ({
  sceneId,
  element,
  writer,
  panelElement,
  t,
}: LegacyRowsProps) => {
  const surface = (element.bundles?.surface ?? {}) as SurfaceFields;
  // 미지정 테두리는 앱 기본 립을 그대로 보여 준다 (렌더와 같은 해석기)
  const border = resolveElementBorder(surface, false);
  const anchor = isNativeElementId(element.id)
    ? { kind: element.kind as SurfaceStyledElementType, id: element.id }
    : undefined;
  return (
    <>
      <PropertyRow
        label={t('propertiesPanel.backgroundColor') || 'Background Color'}
      >
        <ColorInput
          value={surface.backgroundColor || DEFAULT_ELEMENT_BG}
          onChange={() => {}}
          onChangeComplete={() => {}}
          gradientValue={surface.backgroundGradient ?? null}
          canvasAnchor={anchor}
          onModePreview={(_state, modeValue) =>
            writer.previewPaint({
              property: 'backgroundPaint',
              value: paintDescriptor(modeValue),
            })
          }
          onModeCommit={(_state, modeValue) =>
            writer.commitPaint({
              property: 'backgroundPaint',
              value: paintDescriptor(modeValue),
            })
          }
          onCancel={writer.cancelPreview}
          colorId={`${element.kind}-bg-color-${sceneId}-${element.id}`}
          panelElement={panelElement}
        />
      </PropertyRow>

      <PropertyRow label={t('propertiesPanel.borderColor') || 'Border Color'}>
        <ColorInput
          value={border.color}
          onChange={() => {}}
          onChangeComplete={() => {}}
          gradientValue={border.gradient}
          canvasAnchor={anchor}
          onModePreview={(_state, modeValue) =>
            writer.previewPaint({
              property: 'borderPaint',
              value: paintDescriptor(modeValue),
            })
          }
          onModeCommit={(_state, modeValue) =>
            writer.commitPaint({
              property: 'borderPaint',
              value: paintDescriptor(modeValue),
            })
          }
          onCancel={writer.cancelPreview}
          colorId={`${element.kind}-border-color-${sceneId}-${element.id}`}
          gradientSurface="border"
          panelElement={panelElement}
        />
      </PropertyRow>

      <PropertyRow label={t('propertiesPanel.borderWidth') || 'Border Width'}>
        <NumberInput
          value={Math.round(surface.borderWidth ?? 1)}
          onChange={(value) =>
            writer.commitStyle({
              property: 'borderWidth',
              value: Math.max(0, Math.min(20, value)),
            })
          }
          min={0}
          max={20}
          suffix="px"
        />
      </PropertyRow>

      <PropertyRow label={t('propertiesPanel.borderRadius') || 'Border Radius'}>
        <NumberInput
          value={Math.round(surface.borderRadius ?? DEFAULT_ELEMENT_RADIUS)}
          onChange={(value) =>
            writer.commitStyle({
              property: 'borderRadius',
              value: Math.max(0, Math.min(100, value)),
            })
          }
          min={0}
          max={100}
          suffix="px"
        />
      </PropertyRow>
    </>
  );
};

/** 이미지 묶음 - 사용자 이미지 버튼과 이미지 피커 (대기 상태만 쓰는 종류) */
export const LegacyImageRow = ({
  element,
  writer,
  panelElement,
  t,
}: LegacyRowsProps) => {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <PropertyRow label={t('propertiesPanel.customImage') || 'Custom Image'}>
        <button
          ref={buttonRef}
          type="button"
          className={`${ACTION_BUTTON_CHROME_CLASS} ${
            open ? 'shadow-focus-ring' : ''
          } text-fg text-body`}
          onClick={() => setOpen(!open)}
        >
          {t('propertiesPanel.configure') || 'Configure'}
        </button>
      </PropertyRow>
      <SingleImagePickerPopup
        open={open}
        keyPosition={bundleFieldViewOf(element) as unknown as KeyPosition}
        imageButtonRef={buttonRef as React.RefObject<HTMLButtonElement>}
        panelElement={panelElement}
        showActiveState={false}
        showTransformControls={false}
        bindActiveState={false}
        fallbackEmptyImageFit
        requireMountedReference
        onToggle={() => setOpen(false)}
        onInactiveImageCommit={writer.commitInactiveImage}
        onIdleTransparentCommit={writer.commitIdleTransparent}
        onIdleImageFitCommit={writer.commitIdleImageFit}
      />
    </>
  );
};

/** 사용자 CSS - 인라인 스타일 우선·클래스 (설정에서 사용자 CSS를 켰을 때) */
export const LegacyCustomCssSection = ({
  element,
  writer,
  t,
}: Omit<LegacyRowsProps, 'sceneId' | 'panelElement'>) => {
  const className = element.className ?? '';
  const [draft, setDraft] = useState({ source: className, value: className });
  // 저장된 클래스가 바뀌면(되돌리기·다른 창) 입력 중 값도 따라간다 (옛 패널과 같다)
  if (draft.source !== className) {
    setDraft({ source: className, value: className });
  }
  return (
    <PropertySection>
      <div className="flex justify-between items-center w-full min-h-[32px]">
        <p className="text-fg-muted text-label">
          {t('propertiesPanel.useInlineStyles') || '인라인 스타일 우선'}
        </p>
        <Checkbox
          commitStrategy="after-paint"
          checked={element.useInlineStyles ?? false}
          onChange={() =>
            writer.commitField(
              'useInlineStyles',
              !(element.useInlineStyles ?? false),
            )
          }
        />
      </div>

      <PropertyRow label={t('propertiesPanel.className') || '클래스'}>
        <TextInput
          value={draft.value}
          onChange={(value) => setDraft({ source: className, value })}
          onBlur={(value) =>
            writer.commitStyle({ property: 'className', value })
          }
          placeholder="className"
          width="90px"
        />
      </PropertyRow>
    </PropertySection>
  );
};

// 여러 개 - 고른 요소들의 옛 칸 모양 보기 위에서 섞인 값을 모은다 (옛 일괄 패널의 getMixedValue와 같다)
const mixedValueOf =
  (elements: readonly ElementNode[]) =>
  <T,>(getter: (position: KeyPosition) => T | undefined, defaultValue: T) =>
    aggregateMixedValue(
      elements.map(
        (element) => bundleFieldViewOf(element) as unknown as KeyPosition,
      ),
      getter,
      defaultValue,
    );

// 이미지가 기본 립을 억제하는 종류 - 키·통계만 (그래프·노브 그리기는 억제하지 않는다)
const IMAGE_SUPPRESSES_DEFAULT_BORDER: ReadonlySet<string> = new Set([
  'key',
  'stat',
]);

interface LegacyBatchRowsProps {
  elements: readonly ElementNode[];
  writer: PanelWriter;
  // 선택 구성 시그니처 - 형식 왕복 기억·드래그 소유권이 다른 배치 선택과 교차하지 않게
  selectionKey: string;
  panelElement: HTMLElement | null;
  t: Translate;
}

/** 여러 개의 표면 묶음 - 옛 일괄 스타일 탭과 같은 칸 (캔버스 일괄 각도 손잡이) */
export const LegacyBatchSurfaceRows = ({
  elements,
  writer,
  selectionKey,
  panelElement,
  t,
}: LegacyBatchRowsProps) => {
  const [colorState, setColorState] = useState<'idle' | 'active'>('idle');
  // 눌림 상태 편집은 고른 요소가 모두 눌림 그림이 있을 때 (키·노브)
  const activeState = elements.every((element) =>
    supportsActiveVisualState(element.kind),
  );
  const getMixedValue = mixedValueOf(elements);
  return (
    <BatchSurfaceRows
      getMixedValue={getMixedValue}
      activeMixedValue={getMixedValue}
      effectiveColorState={activeState ? colorState : 'idle'}
      showStateTabs={activeState}
      onStateModeChange={setColorState}
      imageSuppressesDefaultBorder={elements.every((element) =>
        IMAGE_SUPPRESSES_DEFAULT_BORDER.has(element.kind),
      )}
      batchSelectionKey={selectionKey}
      onStylePropertyPreview={writer.previewStyle}
      onStylePropertyCommit={writer.commitStyle}
      onPaintPreview={writer.previewPaint}
      onPaintCommit={writer.commitPaint}
      panelElement={panelElement}
      t={t as (key: string) => string}
    />
  );
};

/** 여러 개의 이미지 묶음 - 사용자 이미지 버튼과 일괄 이미지 피커 (열 때 고른 요소로 쓰기를 묶는다) */
export const LegacyBatchImageRow = ({
  elements,
  panelElement,
  t,
}: Omit<LegacyBatchRowsProps, 'writer' | 'selectionKey'>) => {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const groups = () =>
    Object.fromEntries(
      (['key', 'stat', 'graph', 'knob'] as const).map((type) => [
        type,
        elements
          .filter((element) => element.kind === type)
          .map(({ id }) => ({ type, id })),
      ]),
    );
  // 피커를 연 시점의 선택을 id로 고정 - 열린 채 선택이 바뀌어도 그 요소들에 쓴다
  const imageBinding = useBatchElementBinding(open, () =>
    captureBatchElementBinding(groups()),
  );
  const transparencyBinding = captureBatchElementBinding(groups());
  const activeState = elements.every((element) =>
    supportsActiveVisualState(element.kind),
  );
  const getMixedValue = mixedValueOf(elements);
  const idleImage = getMixedValue((pos) => pos.inactiveImage, '');
  const activeImage = getMixedValue((pos) => pos.activeImage, '');
  return (
    <>
      <BatchImageButtonRow
        showBatchImagePicker={open}
        onToggleBatchImagePicker={() => setOpen(!open)}
        batchImageButtonRef={buttonRef as React.RefObject<HTMLButtonElement>}
        t={t as (key: string) => string}
      />
      <BatchImagePickerPopup
        open={open}
        referenceRef={buttonRef}
        panelElement={panelElement as HTMLDivElement | null}
        publishBatchPreview={activeState}
        showActiveState={activeState}
        idleImage={idleImage.isMixed ? '' : idleImage.value}
        activeImage={activeImage.isMixed ? '' : activeImage.value}
        idleTransparent={
          getMixedValue((pos) => pos.idleTransparent, false).value
        }
        activeTransparent={
          getMixedValue((pos) => pos.activeTransparent, false).value
        }
        completionBinding={imageBinding.binding}
        onIdleImageChange={(imageUrl) =>
          commitBoundInactiveImage(imageBinding.selection, imageUrl)
        }
        onIdleTransparentChange={(value) =>
          commitBoundIdleTransparent(transparencyBinding.selection, value)
        }
        onIdleImageReset={() =>
          commitBoundInactiveImage(imageBinding.selection, '')
        }
        {...(activeState
          ? {
              onActiveImageChange: (imageUrl: string) =>
                commitBoundActiveImage(imageBinding.selection, imageUrl),
              onActiveTransparentChange: (value: boolean) =>
                commitBoundActiveTransparent(
                  transparencyBinding.selection,
                  value,
                ),
              onActiveImageReset: () =>
                commitBoundActiveImage(imageBinding.selection, ''),
            }
          : {})}
        onClose={() => setOpen(false)}
      />
    </>
  );
};

/** 여러 개의 사용자 CSS - 인라인 스타일 우선·클래스 (섞인 값) */
export const LegacyBatchCustomCssSection = ({
  elements,
  writer,
  t,
}: Omit<LegacyBatchRowsProps, 'selectionKey' | 'panelElement'>) => (
  <BatchCustomCssSection
    getMixedValue={mixedValueOf(elements)}
    onUseInlineStylesCommit={(useInlineStyles) =>
      writer.commitField('useInlineStyles', useInlineStyles)
    }
    onStylePropertyPreview={writer.previewStyle}
    onStylePropertyCommit={writer.commitStyle}
    t={t as (key: string) => string}
  />
);
