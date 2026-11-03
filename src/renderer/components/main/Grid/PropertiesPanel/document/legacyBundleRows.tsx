import React, { useRef, useState } from 'react';

import Checkbox from '@components/main/common/checkbox/Checkbox';
import {
  captureBatchElementBinding,
  useBatchElementBinding,
} from '@hooks/pickers/useBatchElementBinding';
import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import { isNativeElementId } from '@src/renderer/editor/model/elementId';
import { paintDescriptor } from '@src/types/color';
import type { SurfaceStyledElementType } from '@src/types/elementKinds';
import type { KeyPosition } from '@src/types/key/keys';
import type { KnobItemPosition } from '@src/types/key/knobs';
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
import BatchShadowSection from '../batch/style/BatchShadowSection';
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
import { isKeyStatKind, type Translate } from './documentPanelModel';
import LegacyKnobStyle from './legacyKnobStyle';
import {
  KeyNoteTab,
  KeyStatCounterTab,
  KeyStatStyle,
} from './legacyKeyStatSections';

// 옛 종류의 겉모습 섹션 - 옛 패널마다 칸 배치가 달라 종류별로 옛 패널 그대로 그린다. 값은 옛 패널이 보던
// 옛 칸 모양 보기(트리 값 + 편집 미리보기)를 읽고, 쓰기는 옛 패널 처리기(documentPanelWriter)로 한다

interface SingleStyleProps {
  sceneId: string;
  // 옛 패널이 보던 값 - 트리 값 + 편집 미리보기 (옛 칸 모양)
  position: KeyPosition;
  writer: PanelWriter;
  panelElement: HTMLElement | null;
  t: Translate;
}

/** 그래프 표면 - 배경·테두리 칠(그라데이션·캔버스 각도 손잡이), 두께, 반경 */
const GraphSurfaceRows = ({
  sceneId,
  kind,
  position,
  writer,
  panelElement,
  t,
}: SingleStyleProps & { kind: string }) => {
  // 미지정 테두리는 앱 기본 립을 그대로 보여 준다 (렌더와 같은 해석기)
  const border = resolveElementBorder(position, false);
  const anchor =
    position.id && isNativeElementId(position.id)
      ? { kind: kind as SurfaceStyledElementType, id: position.id }
      : undefined;
  return (
    <>
      <PropertyRow
        label={t('propertiesPanel.backgroundColor') || 'Background Color'}
      >
        <ColorInput
          value={position.backgroundColor || DEFAULT_ELEMENT_BG}
          onChange={() => {}}
          onChangeComplete={() => {}}
          gradientValue={position.backgroundGradient ?? null}
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
          colorId={`${kind}-bg-color-${sceneId}-${position.id}`}
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
          colorId={`${kind}-border-color-${sceneId}-${position.id}`}
          gradientSurface="border"
          panelElement={panelElement}
        />
      </PropertyRow>

      <PropertyRow label={t('propertiesPanel.borderWidth') || 'Border Width'}>
        <NumberInput
          value={Math.round(position.borderWidth ?? 1)}
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
          value={Math.round(position.borderRadius ?? DEFAULT_ELEMENT_RADIUS)}
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

/** 그래프 이미지 - 사용자 이미지 버튼과 이미지 피커 (대기 상태만) */
const GraphImageRow = ({
  position,
  writer,
  panelElement,
  t,
}: Omit<SingleStyleProps, 'sceneId'>) => {
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
        keyPosition={position}
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

// 사용자 CSS를 겉모습 섹션 안에 그리는 종류 (옛 노브·키·스탯 패널)
const CUSTOM_CSS_IN_STYLE: ReadonlySet<string> = new Set([
  'knob',
  'key',
  'stat',
]);

/** 하나 - 기능 묶음 섹션 무리 하나. 키·스탯은 탭마다 무리가 하나다 (스타일 탭 겉모습·노트·카운터) */
export const LegacySingleStyle = ({
  kind,
  element,
  bundles,
  useCustomCSS,
  ...props
}: SingleStyleProps & {
  kind: string;
  element: ElementNode;
  bundles: readonly string[];
  useCustomCSS: boolean;
}) => {
  if (isKeyStatKind(kind)) {
    const section = {
      element,
      position: props.position,
      panelElement: props.panelElement,
      t: props.t,
    };
    if (bundles.includes('note')) return <KeyNoteTab {...section} />;
    if (bundles.includes('counter')) return <KeyStatCounterTab {...section} />;
    return <KeyStatStyle {...section} useCustomCSS={useCustomCSS} />;
  }
  return kind === 'knob' ? (
    <LegacyKnobStyle
      {...props}
      position={props.position as unknown as KnobItemPosition}
      useCustomCSS={useCustomCSS}
    />
  ) : (
    <PropertySection>
      <GraphSurfaceRows {...props} kind={kind} />
      <GraphImageRow {...props} />
    </PropertySection>
  );
};

/** 하나 - 사용자 CSS: 인라인 스타일 우선·클래스 (설정에서 사용자 CSS를 켰을 때).
 * 옛 노브·키·스탯 패널은 겉모습 섹션 안에 그려 따로 그리지 않는다 */
export const LegacyCustomCssSection = ({
  kind,
  ...props
}: Omit<SingleStyleProps, 'sceneId' | 'panelElement'> & { kind: string }) =>
  CUSTOM_CSS_IN_STYLE.has(kind) ? null : <CustomCssRows {...props} />;

const CustomCssRows = ({
  position,
  writer,
  t,
}: Omit<SingleStyleProps, 'sceneId' | 'panelElement'>) => {
  const className = position.className ?? '';
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

// 여러 개 - 고른 요소의 종류와 옛 패널이 보던 값
export interface LegacyBatchItem {
  kind: string;
  position: KeyPosition;
}

// 옛 일괄 패널의 getMixedValue와 같다 - 고른 요소들의 옛 칸 모양 위에서 섞인 값을 모은다
const mixedValueOf =
  (items: readonly LegacyBatchItem[]) =>
  <T,>(getter: (position: KeyPosition) => T | undefined, defaultValue: T) =>
    aggregateMixedValue(
      items.map(({ position }) => position),
      getter,
      defaultValue,
    );

// 이미지가 기본 립을 억제하는 종류 - 키·통계만 (그래프·노브 그리기는 억제하지 않는다)
const IMAGE_SUPPRESSES_DEFAULT_BORDER: ReadonlySet<string> = new Set([
  'key',
  'stat',
]);

interface BatchStyleProps {
  items: readonly LegacyBatchItem[];
  writer: PanelWriter;
  // 선택 구성 시그니처 - 형식 왕복 기억·드래그 소유권이 다른 배치 선택과 교차하지 않게
  selectionKey: string;
  panelElement: HTMLElement | null;
  t: Translate;
}

/** 여러 개의 이미지 - 사용자 이미지 버튼과 일괄 이미지 피커 (열 때 고른 요소로 쓰기를 묶는다) */
const BatchImageRow = ({
  items,
  panelElement,
  t,
}: Omit<BatchStyleProps, 'writer' | 'selectionKey'>) => {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const groups = () =>
    Object.fromEntries(
      (['key', 'stat', 'graph', 'knob'] as const).map((type) => [
        type,
        items
          .filter((item) => item.kind === type)
          .map(({ position }) => ({ type, id: position.id })),
      ]),
    );
  // 피커를 연 시점의 선택을 id로 고정 - 열린 채 선택이 바뀌어도 그 요소들에 쓴다
  const imageBinding = useBatchElementBinding(open, () =>
    captureBatchElementBinding(groups()),
  );
  const transparencyBinding = captureBatchElementBinding(groups());
  const activeState = items.every((item) =>
    supportsActiveVisualState(item.kind),
  );
  const getMixedValue = mixedValueOf(items);
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

/** 여러 개 - 겉모습(표면·이미지 묶음) 섹션과 그림자 (옛 일괄 스타일 탭과 같은 칸, 캔버스 일괄 각도 손잡이) */
export const LegacyBatchStyle = ({
  items,
  writer,
  selectionKey,
  panelElement,
  t,
}: BatchStyleProps) => {
  const [colorState, setColorState] = useState<'idle' | 'active'>('idle');
  // 눌림 상태 편집은 눌림 그림이 있는 요소(키·노브)가 있을 때 - 눌림 값은 그 요소끼리 모은다
  const activeItems = items.filter((item) =>
    supportsActiveVisualState(item.kind),
  );
  const activeState = activeItems.length > 0;
  const getMixedValue = mixedValueOf(items);
  const getActiveMixedValue = activeState
    ? mixedValueOf(activeItems)
    : getMixedValue;
  // 그림자는 그래프가 섞이면 닫는다 (그래프는 그림자가 없다)
  const showShadow = !items.some((item) => item.kind === 'graph');
  const tr = t as (key: string) => string;
  return (
    <>
      <PropertySection>
        <BatchSurfaceRows
          getMixedValue={getMixedValue}
          activeMixedValue={getActiveMixedValue}
          effectiveColorState={activeState ? colorState : 'idle'}
          showStateTabs={activeState}
          onStateModeChange={setColorState}
          imageSuppressesDefaultBorder={items.every((item) =>
            IMAGE_SUPPRESSES_DEFAULT_BORDER.has(item.kind),
          )}
          batchSelectionKey={selectionKey}
          onStylePropertyPreview={writer.previewStyle}
          onStylePropertyCommit={writer.commitStyle}
          onPaintPreview={writer.previewPaint}
          onPaintCommit={writer.commitPaint}
          panelElement={panelElement}
          t={tr}
        />
        <BatchImageRow items={items} panelElement={panelElement} t={t} />
      </PropertySection>
      {showShadow ? (
        <BatchShadowSection
          getMixedValue={getMixedValue}
          getActiveMixedValue={getActiveMixedValue}
          showActiveState={activeState}
          shadowKind={
            items.every((item) => item.kind === 'knob') ? 'knob' : 'key'
          }
          onShadowCommit={writer.commitShadow}
          onStylePropertyPreview={writer.previewStyle}
          panelElement={panelElement}
          t={tr}
        />
      ) : null}
    </>
  );
};

/** 여러 개의 사용자 CSS - 인라인 스타일 우선·클래스 (섞인 값) */
export const LegacyBatchCustomCssSection = ({
  items,
  writer,
  t,
}: Omit<BatchStyleProps, 'selectionKey' | 'panelElement'>) => (
  <BatchCustomCssSection
    getMixedValue={mixedValueOf(items)}
    onUseInlineStylesCommit={(useInlineStyles) =>
      writer.commitField('useInlineStyles', useInlineStyles)
    }
    onStylePropertyPreview={writer.previewStyle}
    onStylePropertyCommit={writer.commitStyle}
    t={t as (key: string) => string}
  />
);
