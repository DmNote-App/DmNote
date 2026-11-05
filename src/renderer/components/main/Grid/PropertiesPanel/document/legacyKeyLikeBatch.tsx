'use no memo';
// 편집 미리보기(모듈 상태)를 담은 보이는 칸을 렌더 중에 읽어서 컴파일러 메모 제외
// 여러 옛 종류를 고른 일괄 패널 - 고른 종류들 선언의 합을 탭마다 그리되 겉모습(표면·이미지·그림자·글자·
// 사용자 CSS·사운드)·노트·카운터는 옛 일괄 부품으로, 종류마다 칸 묶음은 그 종류 요소에만, 색·이미지 피커는
// 패널 뿌리에. 섹션은 그 묶음을 가진 종류끼리 읽고 쓴다. 섞인 값은 옛 일괄 패널과 같은 모델
// (createBatchSelectionModel)을 같은 트리 찾기(요소·보이는 칸)로 만든다
import React, { type ReactNode, type RefObject } from 'react';

import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import { editGestureController } from '@src/renderer/editor/runtime/gesture/editGestureController';
import type {
  BundleName,
  PanelTab,
} from '@src/renderer/elementKinds/defineElementKind';
import {
  sceneElementLookup,
  viewFieldsLookup,
} from '@src/renderer/elementKinds/runtime/viewFields';
import {
  isEditorElementType,
  type EditorCounterFillPropertyPatchV1,
} from '@src/types/editor';
import type { Scene } from '@src/types/generated/elementDocument';
import {
  createDefaultCounterSettings,
  normalizeCounterSettings,
  type KeyPosition,
  type NoteColor,
} from '@src/types/key/keys';
import {
  captureBatchElementBinding,
  useBatchElementBinding,
} from '@hooks/pickers/useBatchElementBinding';
import { useEditStatePreviewPublisher } from '@stores/grid/useEditStatePreviewStore';
import { hexWithAlphaPercent } from '@utils/color/colorUtils';
import BatchCounterTabContent, {
  BATCH_COUNTER_ANIMATION_PAGE_KEY,
} from '../batch/BatchCounterTabContent';
import {
  commitBoundActiveImage,
  commitBoundActiveTransparent,
  commitBoundIdleTransparent,
  commitBoundInactiveImage,
  commitBoundSoundPath,
  createPaintHandlers,
  createShadowCommitHandler,
  createStylePropertyHandlers,
  type BatchLocalColors,
  type BatchPickerTarget,
} from '../batch/batchPanelShared';
import { createBatchSelectionModel } from '../batch/batchSelectionModel';
import BatchNoteTabContent from '../batch/note/BatchNoteTabContent';
import {
  useBatchNotePaint,
  type BatchNoteSurface,
} from '../batch/note/useBatchNotePaint';
import BatchColorPickerPopup from '../batch/style/BatchColorPickerPopup';
import BatchImagePickerPopup from '../batch/style/BatchImagePickerPopup';
import BatchStyleBody from '../batch/style/BatchStyleBody';
import { useBatchKeyLikeCommitRuntime } from '../batch/useBatchKeyLikeCommitRuntime';
import { usePropertiesPanelBatchCommitHandlers } from '../batch/usePropertiesPanelBatchCommitHandlers';
import { aggregateMixedValue } from '../batch/mixedValue';
import { usePanelNav } from '../navigation/PanelNavContext';
import EditSessionBoundary from '../selection/EditSessionBoundary';
import KindBatchRows from './KindBatchRows';
import {
  sectionsOfTab,
  type Translate,
  type Values,
} from './documentPanelModel';
import { PanelSections, type PanelSectionRenderers } from './documentPanelRows';
import { canEditBundleField, type UnionSection } from './documentPanelUnion';

// 속성 패널이 갖는 일괄 피커 상태 - 선택이 바뀌면 속성 패널이 닫는다
export interface LegacyKeyLikeHost {
  batchScrollRefFor: (tab: PanelTab) => (node: HTMLDivElement | null) => void;
  batchNoteColorButtonRef: RefObject<HTMLButtonElement | null>;
  batchGlowColorButtonRef: RefObject<HTMLButtonElement | null>;
  batchBorderColorButtonRef: RefObject<HTMLButtonElement | null>;
  batchCounterFillButtonRef: RefObject<HTMLButtonElement | null>;
  batchImageButtonRef: RefObject<HTMLButtonElement | null>;
  showBatchImagePicker: boolean;
  setShowBatchImagePicker: (value: boolean) => void;
  batchPickerFor: BatchPickerTarget;
  setBatchPickerFor: (value: BatchPickerTarget) => void;
  batchCounterColorState: 'idle' | 'active';
  setBatchCounterColorState: (value: 'idle' | 'active') => void;
  batchLocalColors: BatchLocalColors;
  setBatchLocalColors: React.Dispatch<React.SetStateAction<BatchLocalColors>>;
  handleBatchPickerToggle: (target: BatchPickerTarget) => void;
  handleBatchPickerColorChange: (newColor: NoteColor) => void;
  handleBatchPickerColorChangeComplete: (newColor: NoteColor) => void;
  handleBatchFillPickerColorChangeComplete: (
    newColor: string,
    onCounterFillCommit: (patch: EditorCounterFillPropertyPatchV1) => void,
  ) => void;
  getBatchPickerColor: () => NoteColor | string;
  getBatchPickerRef: () => RefObject<HTMLButtonElement | null> | null;
  batchColorPickerInteractiveRefs: RefObject<HTMLButtonElement | null>[];
}

interface LegacyKeyLikeBatchBodyProps {
  sceneId: string;
  scene: Scene | undefined;
  // 고른 옛 종류 요소 - 고른 순서
  elements: readonly ElementNode[];
  tabs: readonly PanelTab[];
  activeTab: PanelTab;
  // 고른 종류들 선언의 합 - 섹션마다 가진 종류
  sections: readonly UnionSection[];
  items: readonly Values[];
  // 위치·크기·칸 묶음 섹션은 패널이 그린다
  renderers: PanelSectionRenderers;
  host: LegacyKeyLikeHost;
  // 함께 고른 플러그인 요소의 설정 - 스타일 탭 끝
  pluginSettings?: ReactNode;
  panelElement: HTMLElement | null;
  useCustomCSS: boolean;
  t: Translate;
}

const ofType = <Type extends string>(
  selected: readonly { type: string; id: string }[],
  ...types: Type[]
) =>
  selected.filter((element): element is { type: Type; id: string } =>
    types.includes(element.type as Type),
  );

/** 키·스탯이 든 일괄 선택의 탭 본문과 피커 - 패널 머리·탭 줄 아래 */
export const LegacyKeyLikeBatchBody = ({
  sceneId,
  scene,
  elements,
  tabs,
  activeTab,
  sections,
  items,
  renderers,
  host,
  pluginSettings,
  panelElement,
  useCustomCSS,
  t,
}: LegacyKeyLikeBatchBodyProps) => {
  const tr = t as (key: string) => string;
  const selected = elements.map(({ kind, id }) => ({ type: kind, id }));
  const selectedKeyElements = ofType(selected, 'key');
  const selectedStatElements = ofType(selected, 'stat');
  const selectedGraphElements = ofType(selected, 'graph');
  const selectedKnobElements = ofType(selected, 'knob');
  const selectedKeyLikeElements = ofType(selected, 'key', 'stat');
  const selectedBatchStyleElements = ofType(
    selected,
    'key',
    'stat',
    'graph',
    'knob',
  );
  const {
    getMixedValue,
    getMixedValueCanonical,
    getMixedValueBatch,
    getMixedValueKeysOnly,
    getMixedValueActiveCapable,
    getSelectedKeysData,
    getSelectedBatchStyleData,
    getSelectedKeyOnlyPositions,
  } = createBatchSelectionModel({
    elementOf: sceneElementLookup(scene),
    viewOf: viewFieldsLookup(scene, sceneId),
    selectedKeyElements,
    selectedKeyLikeElements,
    selectedGraphElements,
    selectedKnobElements,
    selectedBatchStyleElements,
    // 크기는 패널의 일괄 기하가 맡는다 (스프라이트·플러그인 요소 포함)
    selectedBatchGeometryElements: selectedBatchStyleElements,
  });
  const {
    handleBatchElementPropertyCommit,
    handleBatchNoteElementPropertyCommit,
  } = usePropertiesPanelBatchCommitHandlers({
    selectedBatchStyleElements,
    selectedKeyElements,
  });
  // 글자 묶음이 있는 종류(키·스탯)의 글꼴 쓰기
  const { handleBatchElementPropertyCommit: commitFontElementProperty } =
    usePropertiesPanelBatchCommitHandlers({
      selectedBatchStyleElements: selectedKeyLikeElements,
      selectedKeyElements,
    });

  // 피커 open 시점의 선택을 ID로 고정 - 대기 중 재정렬·모드 전환에도 완료가 시작 시점 요소들에 적용된다.
  // 결합 소유자는 탭 바깥이다 - EditSessionBoundary 안(탭 내용)에 두면 같은 개수 선택 교체 시
  // 리마운트로 open 중 재캡처가 일어난다
  const batchImageBinding = useBatchElementBinding(
    host.showBatchImagePicker,
    () =>
      captureBatchElementBinding({
        key: selectedKeyElements,
        stat: selectedStatElements,
        graph: selectedGraphElements,
        knob: selectedKnobElements,
      }),
  );
  const idleTransparencyBinding = captureBatchElementBinding({
    key: selectedKeyElements,
    stat: selectedStatElements,
    graph: selectedGraphElements,
    knob: selectedKnobElements,
  });
  const activeTransparencyBinding = captureBatchElementBinding({
    key: selectedKeyElements,
    knob: selectedKnobElements,
  });
  // open 판정은 activePageKey다. renderPageKey는 exit 애니메이션 동안 유지되는 마운트 상태라,
  // 닫고 250ms 안에 재열면 전환이 감지되지 않아 이전 결합이 재사용된다
  const { activePageKey } = usePanelNav();
  const animationBinding = useBatchElementBinding(
    activePageKey === BATCH_COUNTER_ANIMATION_PAGE_KEY,
    () =>
      captureBatchElementBinding({
        key: selectedKeyElements,
        stat: selectedStatElements,
      }),
  );
  const {
    previewStyleProperty,
    commitStyleProperty,
    previewPaint,
    commitPaint,
    commitShadow,
    commitNoteStyleProperty,
    notePaintIds,
    bindNotePaintFailureRestore,
    commitNotePaint,
    previewNotePaint,
    counterFillTargets,
    commitCounterFill,
    commitSoundEnabled,
    commitSoundVolume,
    commitCounterEnabled,
    commitCounterAnimationEnabled,
    commitCounterLayout,
    commitCounterTypography,
    soundBinding,
  } = useBatchKeyLikeCommitRuntime({
    selectedBatchStyleElements,
    selectedKeyElements,
    selectedStatElements,
    selectedKnobElements,
    selectedKeyType: sceneId,
    batchCounterColorState: host.batchCounterColorState,
    activePageKey,
  });

  // 표시값·Mixed 판정은 고치는 대상 집합(그 묶음을 가진 종류)과 같아야 한다.
  // 노브만 섞여도 키 전용 getter를 쓰면 노브 값이 대표값에 가려진 채 덮인다
  const hasBatchStyleOnlySelection =
    selectedGraphElements.length > 0 || selectedKnobElements.length > 0;
  const styleMixedValueGetter = hasBatchStyleOnlySelection
    ? getMixedValueBatch
    : getMixedValue;
  const styleSelectedDataGetter = hasBatchStyleOnlySelection
    ? getSelectedBatchStyleData
    : getSelectedKeysData;
  // 섹션을 보일지·누구 값을 모을지 - 고른 종류가 그 묶음 칸을 가졌는지 (선언)
  const owns = (
    bundle: BundleName,
    options?: { active?: boolean; shadow?: boolean },
  ) =>
    elements.filter((element) =>
      canEditBundleField(element.kind, bundle, options),
    );
  const fontOwners = owns('font');
  const shadowOwners = owns('surface', { shadow: true });
  // 그림자 - 그리는 종류끼리 고른 순서로 (모두 노브면 노브 기본 그림자)
  const shadowItems = shadowOwners.map(
    (owner) => items[elements.indexOf(owner)],
  );
  const getShadowMixedValue = <T,>(
    getter: (position: KeyPosition) => T | undefined,
    defaultValue: T,
  ) =>
    aggregateMixedValue(
      shadowItems as unknown as KeyPosition[],
      getter,
      defaultValue,
    );
  const shadowKind = shadowOwners.every((owner) => owner.kind === 'knob')
    ? 'knob'
    : 'key';
  // 표면을 가진 트리에만 있는 종류(커서 추적기 등)가 섞이면 겉모습·그림자 칸을 그 요소까지 읽고 커밋 하나로 쓴다
  // (편집 미리보기 영역이 없어 그 요소는 커밋 때 반영)
  const isTreeOnly = (element: ElementNode) =>
    !isEditorElementType(element.kind);
  const surfaceOwners = owns('surface');
  const treeSurfaceOwners = surfaceOwners.filter(isTreeOnly);
  const treeShadowOwners = shadowOwners.filter(isTreeOnly);
  const targetsOf = (owners: readonly ElementNode[]) =>
    owners.map(({ kind, id }) => ({ elementType: kind, id }));
  const surfaceItems = surfaceOwners.map(
    (owner) => items[elements.indexOf(owner)],
  );
  const surface =
    treeSurfaceOwners.length > 0
      ? {
          getMixedValue: <T,>(
            getter: (position: KeyPosition) => T | undefined,
            defaultValue: T,
          ) =>
            aggregateMixedValue(
              surfaceItems as unknown as KeyPosition[],
              getter,
              defaultValue,
            ),
          onPaintCommit: createPaintHandlers(targetsOf(surfaceOwners), sceneId)
            .commitPaint,
          onStylePropertyCommit: createStylePropertyHandlers(
            targetsOf(surfaceOwners),
            sceneId,
          ).commitStyleProperty,
        }
      : undefined;
  const shadowCommit =
    treeShadowOwners.length > 0
      ? createShadowCommitHandler(targetsOf(shadowOwners))
      : commitShadow;
  // 글자 - 키·스탯끼리 (눌림 글자는 키)
  const fontStyle = createStylePropertyHandlers(
    selectedKeyLikeElements.map(({ type, id }) => ({ elementType: type, id })),
    sceneId,
  );

  const keysData = getSelectedKeysData();
  const keyOnlyPositions = getSelectedKeyOnlyPositions();

  // 일괄 노트 페인트 - GradientSpec 집계·편집 (본체·글로우·테두리)
  const { batchPickerFor, batchCounterColorState } = host;
  const openNoteSurface: BatchNoteSurface | null =
    batchPickerFor === 'noteColor'
      ? 'note'
      : batchPickerFor === 'glowColor'
      ? 'glow'
      : batchPickerFor === 'borderColor'
      ? 'border'
      : null;
  const batchNotePositions =
    selectedKeyElements.length > 0
      ? keyOnlyPositions.map(({ position }) => position)
      : keysData
          .map(({ position }) => position)
          .filter((position): position is KeyPosition => position != null);
  // 선택 구성 시그니처 - 형식 왕복 기억·세션 소유가 다른 선택과 교차하지 않게
  const batchNoteSelectionKey = `${sceneId}:${[...notePaintIds]
    .sort()
    .join(',')}`;
  const batchNotePaint = useBatchNotePaint({
    positions: batchNotePositions,
    open: openNoteSurface,
    selectionKey: batchNoteSelectionKey,
    commitNotePaint,
    previewNotePaint,
  });
  // 영구 실패는 canonical 재반영 신호(commitTick)가 오지 않는다. 열린 피커의
  // 로컬 대표값을 canonical에서 다시 읽어 옛 편집값이 다음 커밋에 실리지 않게
  bindNotePaintFailureRestore((patch) => {
    if (editGestureController.activeGestureId() !== null) return;
    const surface: BatchNoteSurface =
      patch.property === 'notePaint'
        ? 'note'
        : patch.property === 'noteGlowPaint'
        ? 'glow'
        : 'border';
    const state = batchNotePaint.states[surface];
    if (state.format === 'gradient') {
      // 스톱 초안만 버리면 저장값 spec이 다시 제시된다
      state.cancelPreview();
      return;
    }
    if (surface === 'border') {
      batchNotePaint.previewBorderSolid(
        hexWithAlphaPercent(
          getMixedValueCanonical((pos) => pos.noteBorderColor, '#FFFFFF').value,
          getMixedValueCanonical((pos) => pos.noteBorderOpacity, 100).value,
        ),
      );
      return;
    }
    const color = getMixedValueCanonical(
      (pos) =>
        surface === 'note' ? pos.noteColor : pos.noteGlowColor ?? pos.noteColor,
      '#FFFFFF' as NoteColor,
    ).value;
    if (typeof color === 'string') state.handlePickerColorChange(color, false);
    if (surface === 'note') {
      batchNotePaint.setNoteOpacity(
        getMixedValueCanonical((pos) => pos.noteOpacity, 80).value,
      );
    } else {
      batchNotePaint.setGlowOpacity(
        getMixedValueCanonical((pos) => pos.noteGlowOpacity, 70).value,
      );
    }
  });
  const firstCounterPosition =
    keyOnlyPositions[0]?.position ?? keysData[0]?.position;
  const batchCounterSettings = firstCounterPosition
    ? normalizeCounterSettings(firstCounterPosition.counter)
    : createDefaultCounterSettings();
  const selectedCounterSettings = keysData.map(({ position }) =>
    normalizeCounterSettings(position.counter),
  );
  const firstPos = keysData[0]?.position;
  const batchKeyVisual = firstPos
    ? {
        ...firstPos,
        displayName: keysData[0]?.keyInfo?.displayName,
        isStat: selectedKeyLikeElements[0]?.type === 'stat',
      }
    : undefined;
  // 노트 탭은 키만 고치므로 Mixed도 키 기준. 스탯이 섞인 선택에서 스탯 값이 Mixed를 만들지 않게
  const noteMixedFn =
    selectedKeyElements.length > 0 ? getMixedValueKeysOnly : getMixedValue;
  // 일괄 카운터 채움은 세션 훅 없는 ColorPicker 직결 경로 - 상태 프리뷰 직접 발행
  useEditStatePreviewPublisher(
    batchPickerFor === 'fill' && selectedKeyElements.length > 0
      ? { kind: 'batch' }
      : null,
    batchCounterColorState,
  );
  const getCounterColorDisplay = (target: 'fill') => {
    const key = batchCounterColorState === 'active' ? 'fillActive' : 'fillIdle';
    if (batchPickerFor === target) return host.batchLocalColors[key];
    return batchCounterColorState === 'active'
      ? batchCounterSettings.fill.active
      : batchCounterSettings.fill.idle;
  };

  // 이미지가 기본 립을 억제하는 요소인지 - 키·스탯만 (그래프·노브는 립을 그대로 그린다). 섞인 선택은 요소마다
  const kindById = new Map(elements.map(({ id, kind }) => [id, kind]));
  const imageSuppressesDefaultBorderOf = (position: KeyPosition) => {
    const kind = kindById.get(position.id ?? '');
    return kind === 'key' || kind === 'stat';
  };

  // 기능 묶음 - 겉모습 묶음은 사용자 CSS를 글자와 사운드 사이에 함께 그리는 옛 스타일 본문 하나
  const bundles = (names: readonly BundleName[]) => {
    if (names.includes('note')) {
      return (
        <BatchNoteTabContent
          getMixedValue={getMixedValueKeysOnly}
          onElementPropertyCommit={handleBatchNoteElementPropertyCommit}
          onStylePropertyCommit={commitNoteStyleProperty}
          getBatchNoteColorDisplay={() => batchNotePaint.displays.note}
          getBatchGlowColorDisplay={() => batchNotePaint.displays.glow}
          getBatchBorderColorDisplay={() => batchNotePaint.displays.border}
          onNoteColorPickerToggle={() =>
            host.handleBatchPickerToggle('noteColor')
          }
          onGlowColorPickerToggle={() =>
            host.handleBatchPickerToggle('glowColor')
          }
          onBorderColorPickerToggle={() =>
            host.handleBatchPickerToggle('borderColor')
          }
          isNoteColorPickerOpen={batchPickerFor === 'noteColor'}
          isGlowColorPickerOpen={batchPickerFor === 'glowColor'}
          isBorderColorPickerOpen={batchPickerFor === 'borderColor'}
          batchNoteColorButtonRef={host.batchNoteColorButtonRef}
          batchGlowColorButtonRef={host.batchGlowColorButtonRef}
          batchBorderColorButtonRef={host.batchBorderColorButtonRef}
          t={tr}
        />
      );
    }
    if (names.includes('counter')) {
      return (
        <BatchCounterTabContent
          batchCounterSettings={batchCounterSettings}
          selectedCounterSettings={selectedCounterSettings}
          keyVisual={batchKeyVisual}
          onCounterEnabledCommit={commitCounterEnabled}
          onCounterAnimationEnabledCommit={commitCounterAnimationEnabled}
          onCounterLayoutCommit={commitCounterLayout}
          onCounterTypographyCommit={commitCounterTypography}
          colorState={batchCounterColorState}
          getCounterColorDisplay={getCounterColorDisplay}
          onFillPickerToggle={() => host.handleBatchPickerToggle('fill')}
          batchCounterFillButtonRef={host.batchCounterFillButtonRef}
          isFillPickerOpen={batchPickerFor === 'fill'}
          animationBinding={animationBinding}
          t={tr}
        />
      );
    }
    return (
      <BatchStyleBody
        imageSuppressesDefaultBorder={imageSuppressesDefaultBorderOf}
        soundBinding={soundBinding}
        onSoundPathCommit={(soundPath) =>
          commitBoundSoundPath(soundBinding.selection, soundPath)
        }
        onSoundEnabledCommit={commitSoundEnabled}
        onSoundVolumeCommit={commitSoundVolume}
        onStylePropertyPreview={previewStyleProperty}
        onStylePropertyCommit={commitStyleProperty}
        onPaintPreview={previewPaint}
        onPaintCommit={commitPaint}
        onFontColorPreview={previewPaint}
        onFontColorCommit={commitPaint}
        onShadowCommit={shadowCommit}
        surface={surface}
        showSoundControls={selectedKeyElements.length > 0}
        showShadowControls={shadowOwners.length > 0}
        shadowKind={shadowKind}
        getShadowMixedValue={getShadowMixedValue}
        hideDisplayText={fontOwners.length === 0}
        hideFontControls={fontOwners.length === 0}
        hideImage={owns('image').length === 0}
        selectionKey={`${sceneId}:${elements
          .map(({ id }) => id)
          .sort()
          .join(',')}`}
        typography={{
          getMixedValue,
          getActiveMixedValue: getMixedValueKeysOnly,
          getSelectedKeysData,
          showActiveState: selectedKeyElements.length > 0,
          onStylePropertyPreview: fontStyle.previewStyleProperty,
          onStylePropertyCommit: fontStyle.commitStyleProperty,
          onElementPropertyCommit: commitFontElementProperty,
        }}
        shadowActiveState={
          selectedKeyElements.length > 0 || selectedKnobElements.length > 0
        }
        getMixedValue={styleMixedValueGetter}
        getSelectedKeysData={styleSelectedDataGetter}
        onElementPropertyCommit={handleBatchElementPropertyCommit}
        getKeyOnlyMixedValue={getMixedValueKeysOnly}
        getActiveCapableMixedValue={getMixedValueActiveCapable}
        showBatchImagePicker={host.showBatchImagePicker}
        onToggleBatchImagePicker={() =>
          host.setShowBatchImagePicker(!host.showBatchImagePicker)
        }
        batchImageButtonRef={
          host.batchImageButtonRef as RefObject<HTMLButtonElement>
        }
        panelElement={panelElement}
        // 사용자 CSS 섹션을 가진 종류가 고른 종류에 있을 때만
        useCustomCSS={
          useCustomCSS &&
          sections.some(
            ({ section }) =>
              'common' in section && section.common === 'customCss',
          )
        }
        t={tr}
      />
    );
  };
  // 섹션마다 가진 종류
  const kindsOf = new Map(
    sections.map(({ section, kinds }) => [section, kinds]),
  );
  const tabRenderers: PanelSectionRenderers = {
    ...renderers,
    bundles,
    // 사용자 CSS는 겉모습 본문 안에서 그린다
    customCss: () => null,
    // 직접 만든 섹션 - 그 섹션을 가진 종류 요소만 넘긴다 (예: 스탯 종류는 스탯에만)
    custom: (component, section) => {
      const kinds = kindsOf.get(section) ?? [];
      return renderers.custom(
        component,
        section,
        elements
          .filter((element) => kinds.includes(element.kind))
          .map(({ id }) => id),
      );
    },
    // 종류마다 칸 묶음 - 그 종류 요소만 고친다
    rows: (section) => {
      const kinds = kindsOf.get(section) ?? [];
      return (
        <KindBatchRows
          sceneId={sceneId}
          elementIds={elements
            .filter((element) => kinds.includes(element.kind))
            .map(({ id }) => id)}
          section={section}
          panelElement={panelElement}
          t={t}
        />
      );
    },
  };

  const tabBody = (tab: PanelTab) => (
    <EditSessionBoundary>
      <PanelSections
        sections={sectionsOfTab(
          sections.map(({ section }) => section),
          tab,
        )}
        items={items}
        batch
        renderers={tabRenderers}
      />
      {tab === 'style' ? pluginSettings : null}
    </EditSessionBoundary>
  );

  return (
    <>
      <div className="flex-1 properties-panel-overlay-scroll">
        {tabs.length > 1 ? (
          tabs.map((tab) => (
            <div
              key={tab}
              ref={host.batchScrollRefFor(tab)}
              className={`properties-panel-overlay-viewport ${
                activeTab === tab ? '' : 'hidden'
              }`}
            >
              {tabBody(tab)}
            </div>
          ))
        ) : (
          <div
            ref={host.batchScrollRefFor('style')}
            className="properties-panel-overlay-viewport"
          >
            {tabBody('style')}
          </div>
        )}
      </div>

      <BatchColorPickerPopup
        batchPickerFor={batchPickerFor}
        setBatchPickerFor={host.setBatchPickerFor}
        openNoteSurface={openNoteSurface}
        batchNotePaint={batchNotePaint}
        batchCounterSettings={batchCounterSettings}
        batchCounterColorState={batchCounterColorState}
        setBatchCounterColorState={host.setBatchCounterColorState}
        setBatchLocalColors={host.setBatchLocalColors}
        handleBatchPickerColorChange={host.handleBatchPickerColorChange}
        handleBatchPickerColorChangeComplete={
          host.handleBatchPickerColorChangeComplete
        }
        handleBatchFillPickerColorChangeComplete={
          host.handleBatchFillPickerColorChangeComplete
        }
        getBatchPickerColor={host.getBatchPickerColor}
        getBatchPickerRef={host.getBatchPickerRef}
        batchColorPickerInteractiveRefs={host.batchColorPickerInteractiveRefs}
        panelElement={panelElement as HTMLDivElement | null}
        selectedKeyCount={selectedKeyElements.length}
        counterFillTargetCount={counterFillTargets.length}
        commitCounterFill={commitCounterFill}
        previewNotePaint={previewNotePaint}
        commitNotePaint={commitNotePaint}
        noteMixedValueGetter={noteMixedFn}
        getMixedValue={getMixedValue}
        getMixedValueActiveCapable={getMixedValueActiveCapable}
        getMixedValueCanonical={getMixedValueCanonical}
        t={tr}
      />

      {/* 다중 선택용 ImagePicker */}
      <BatchImagePickerPopup
        open={host.showBatchImagePicker}
        referenceRef={host.batchImageButtonRef}
        panelElement={panelElement as HTMLDivElement | null}
        publishBatchPreview
        showActiveState={
          selectedKeyElements.length > 0 || selectedKnobElements.length > 0
        }
        idleImage={
          styleMixedValueGetter((pos) => pos.inactiveImage, '').isMixed
            ? ''
            : styleMixedValueGetter((pos) => pos.inactiveImage, '').value
        }
        activeImage={
          getMixedValueActiveCapable((pos) => pos.activeImage, '').isMixed
            ? ''
            : getMixedValueActiveCapable((pos) => pos.activeImage, '').value
        }
        idleTransparent={
          styleMixedValueGetter((pos) => pos.idleTransparent, false).value
        }
        activeTransparent={
          getMixedValueActiveCapable((pos) => pos.activeTransparent, false)
            .value
        }
        completionBinding={batchImageBinding.binding}
        onIdleImageChange={(imageUrl) => {
          commitBoundInactiveImage(batchImageBinding.selection, imageUrl);
        }}
        onActiveImageChange={(imageUrl) => {
          commitBoundActiveImage(batchImageBinding.selection, imageUrl);
        }}
        onIdleTransparentChange={(value) => {
          commitBoundIdleTransparent(idleTransparencyBinding.selection, value);
        }}
        onActiveTransparentChange={(value) => {
          commitBoundActiveTransparent(
            activeTransparencyBinding.selection,
            value,
          );
        }}
        onIdleImageReset={() => {
          commitBoundInactiveImage(batchImageBinding.selection, '');
        }}
        onActiveImageReset={() => {
          commitBoundActiveImage(batchImageBinding.selection, '');
        }}
        onClose={() => host.setShowBatchImagePicker(false)}
      />
    </>
  );
};
