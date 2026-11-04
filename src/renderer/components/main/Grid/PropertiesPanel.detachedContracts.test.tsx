import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  createFakeElementDocumentBackend,
  type FakeElementDocumentBackend,
} from '@src/renderer/__tests__/fakeElementDocumentBackend';
import { legacyShapedSeed } from '@src/renderer/__tests__/treeNodes';
import { loadElementDocumentStore } from '@src/renderer/editor/document/elementDocumentRuntime';
import { useKeyStore } from '@stores/data/useKeyStore';
import { useDocumentSelectionStore } from '@stores/grid/useDocumentSelectionStore';
import { usePropertiesPanelStore } from '@stores/grid/usePropertiesPanelStore';
import { usePluginDisplayElementStore } from '@stores/plugin/usePluginDisplayElementStore';
import { useKeySlotCapture } from '@hooks/useKeySlotCapture';
import { createDefaultKeyPosition } from '@src/renderer/editor/model/keys';
import {
  cancelPluginSettingsSessionForPlugin,
  openPluginSettingsSession,
} from '@plugins/runtime/pluginSettingsSession';
import {
  makeCanonicalSpritePosition,
  makeSpritePose,
} from '@utils/sprite/spriteFixtures';

type MixedGetter = <T>(
  getter: (pos: { width?: number; height?: number }) => T | undefined,
  defaultValue: T,
) => { isMixed: boolean; value: T };

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const {
  batchKeyLikePropsMock,
  batchPluginPropsMock,
  batchPropsMock,
  graphUpdatePositionsMock,
  knobUpdatePositionsMock,
  keyLegacyUpdateMock,
  legacyBatchStyleCommitMock,
  legacyBatchCounterUpdateMock,
  patchGraphColorMock,
  patchGraphColorsMock,
  patchGraphColorsViaAuthorityMock,
  patchGraphPropertiesMock,
  patchGraphPropertiesViaAuthorityMock,
  patchGraphTypeMock,
  patchGraphTypesMock,
  patchGraphTypesViaAuthorityMock,
  patchFontStyleMock,
  patchFontStyleTargetsMock,
  patchFontStyleViaAuthorityMock,
  patchFontFamilyMock,
  patchFontFamilyTargetsMock,
  patchFontFamilyViaAuthorityMock,
  patchDisplayTextMock,
  patchElementPropertyMock,
  patchDisplayTextViaAuthorityMock,
  patchInactiveImageMock,
  patchInactiveImageViaAuthorityMock,
  patchActiveImageMock,
  patchIdleTransparentMock,
  patchActiveTransparentMock,
  patchIdleImageFitMock,
  patchActiveImageFitMock,
  patchSoundPathMock,
  patchSoundPathViaAuthorityMock,
  patchSoundEnabledMock,
  patchSoundEnabledViaAuthorityMock,
  patchSoundVolumeMock,
  patchSoundVolumeViaAuthorityMock,
  patchCounterEnabledMock,
  patchCounterAnimationEnabledMock,
  patchCounterEnabledViaAuthorityMock,
  patchCounterAnimationEnabledViaAuthorityMock,
  patchCounterBooleanByTargetsViaAuthorityMock,
  patchCounterLayoutMock,
  patchCounterLayoutViaAuthorityMock,
  patchCounterTypographyMock,
  patchCounterTypographyViaAuthorityMock,
  patchCounterFillMock,
  patchCounterFillViaAuthorityMock,
  patchFontColorMock,
  patchFontColorViaAuthorityMock,
  patchPaintMock,
  patchPaintViaAuthorityMock,
  patchShadowMock,
  patchShadowViaAuthorityMock,
  patchNotePaintMock,
  patchNotePaintViaAuthorityMock,
  patchKnobPropertiesMock,
  patchKnobPropertiesViaAuthorityMock,
  patchKnobPropertyMock,
  patchNotePropertyMock,
  patchStatTypeMock,
  patchNotePropertiesMock,
  patchNotePropertiesViaAuthorityMock,
  patchUseInlineStylesMock,
  patchUseInlineStylesTargetsMock,
  patchUseInlineStylesViaAuthorityMock,
  previewMock,
  patchLayerNameMock,
  renameLayerGroupMock,
  renameLayerGroupViaAuthorityMock,
  patchPropertyViaAuthorityMock,
  patchBoundsViaAuthorityMock,
  patchBatchGeometryViaAuthorityMock,
  patchBatchGeometryMock,
  commitMixedBatchGeometryMock,
  patchGeometryMock,
  statUpdatePositionsMock,
  settleCommitMock,
  activeGestureIdMock,
  documentElementPropsMock,
  reportElementOpSkippedMock,
} = vi.hoisted(() => ({
  batchKeyLikePropsMock: vi.fn(),
  batchPluginPropsMock: vi.fn(),
  batchPropsMock: vi.fn(),
  graphUpdatePositionsMock: vi.fn(() => Promise.resolve()),
  knobUpdatePositionsMock: vi.fn(() => Promise.resolve()),
  keyLegacyUpdateMock: vi.fn(),
  legacyBatchStyleCommitMock: vi.fn(),
  legacyBatchCounterUpdateMock: vi.fn(),
  patchGraphColorMock: vi.fn(() => Promise.resolve(true)),
  patchGraphColorsMock: vi.fn(() => Promise.resolve(true)),
  patchGraphColorsViaAuthorityMock: vi.fn(() => Promise.resolve(true)),
  patchGraphPropertiesMock: vi.fn(() => Promise.resolve(true)),
  patchGraphPropertiesViaAuthorityMock: vi.fn(() => Promise.resolve(true)),
  patchGraphTypeMock: vi.fn(() => Promise.resolve(true)),
  patchGraphTypesMock: vi.fn(() => Promise.resolve(true)),
  patchGraphTypesViaAuthorityMock: vi.fn(() => Promise.resolve(true)),
  patchFontStyleMock: vi.fn(() => Promise.resolve(true)),
  patchFontStyleTargetsMock: vi.fn(() => Promise.resolve(true)),
  patchFontStyleViaAuthorityMock: vi.fn(() => Promise.resolve(true)),
  patchFontFamilyMock: vi.fn(() => Promise.resolve(true)),
  patchFontFamilyTargetsMock: vi.fn(() => Promise.resolve(true)),
  patchFontFamilyViaAuthorityMock: vi.fn(() => Promise.resolve(true)),
  patchDisplayTextMock: vi.fn(() => Promise.resolve(true)),
  patchElementPropertyMock: vi.fn(() => Promise.resolve(true)),
  patchDisplayTextViaAuthorityMock: vi.fn(() => Promise.resolve(true)),
  patchInactiveImageMock: vi.fn(() => Promise.resolve(true)),
  patchInactiveImageViaAuthorityMock: vi.fn(() => Promise.resolve(true)),
  patchActiveImageMock: vi.fn(() => Promise.resolve(true)),
  patchIdleTransparentMock: vi.fn(() => Promise.resolve(true)),
  patchActiveTransparentMock: vi.fn(() => Promise.resolve(true)),
  patchIdleImageFitMock: vi.fn(() => Promise.resolve(true)),
  patchActiveImageFitMock: vi.fn(() => Promise.resolve(true)),
  patchSoundPathMock: vi.fn(() => Promise.resolve(true)),
  patchSoundPathViaAuthorityMock: vi.fn(() => Promise.resolve(true)),
  patchSoundEnabledMock: vi.fn(() => Promise.resolve(true)),
  patchSoundEnabledViaAuthorityMock: vi.fn(() => Promise.resolve(true)),
  patchSoundVolumeMock: vi.fn(() => Promise.resolve(true)),
  patchSoundVolumeViaAuthorityMock: vi.fn(() => Promise.resolve(true)),
  patchCounterEnabledMock: vi.fn(() => Promise.resolve(true)),
  patchCounterAnimationEnabledMock: vi.fn(() => Promise.resolve(true)),
  patchCounterEnabledViaAuthorityMock: vi.fn(() => Promise.resolve(true)),
  patchCounterBooleanByTargetsViaAuthorityMock: vi.fn(() =>
    Promise.resolve(true),
  ),
  patchCounterAnimationEnabledViaAuthorityMock: vi.fn(() =>
    Promise.resolve(true),
  ),
  patchCounterLayoutMock: vi.fn(() => Promise.resolve(true)),
  patchCounterLayoutViaAuthorityMock: vi.fn(() => Promise.resolve(true)),
  patchCounterTypographyMock: vi.fn(() => Promise.resolve(true)),
  patchCounterTypographyViaAuthorityMock: vi.fn(() => Promise.resolve(true)),
  patchCounterFillMock: vi.fn(() => Promise.resolve(true)),
  patchCounterFillViaAuthorityMock: vi.fn(() => Promise.resolve(true)),
  patchFontColorMock: vi.fn(() => Promise.resolve(true)),
  patchFontColorViaAuthorityMock: vi.fn(() => Promise.resolve(true)),
  patchPaintMock: vi.fn(() => Promise.resolve(true)),
  patchPaintViaAuthorityMock: vi.fn(() => Promise.resolve(true)),
  patchShadowMock: vi.fn(() => Promise.resolve(true)),
  patchShadowViaAuthorityMock: vi.fn(() => Promise.resolve(true)),
  patchNotePaintMock: vi.fn(() => Promise.resolve(true)),
  patchNotePaintViaAuthorityMock: vi.fn(() => Promise.resolve(true)),
  patchKnobPropertiesMock: vi.fn(() => Promise.resolve(true)),
  patchKnobPropertiesViaAuthorityMock: vi.fn(() => Promise.resolve(true)),
  patchKnobPropertyMock: vi.fn(() => Promise.resolve(true)),
  patchNotePropertyMock: vi.fn(() => Promise.resolve(true)),
  patchStatTypeMock: vi.fn(() => Promise.resolve(true)),
  patchNotePropertiesMock: vi.fn(() => Promise.resolve(true)),
  patchNotePropertiesViaAuthorityMock: vi.fn(() => Promise.resolve(true)),
  patchUseInlineStylesMock: vi.fn(() => Promise.resolve(true)),
  patchUseInlineStylesTargetsMock: vi.fn(() => Promise.resolve(true)),
  patchUseInlineStylesViaAuthorityMock: vi.fn(() => Promise.resolve(true)),
  previewMock: vi.fn(),
  patchLayerNameMock: vi.fn(() => Promise.resolve(true)),
  renameLayerGroupMock: vi.fn(() => Promise.resolve(true)),
  renameLayerGroupViaAuthorityMock: vi.fn(() => Promise.resolve(true)),
  patchPropertyViaAuthorityMock: vi.fn(() => Promise.resolve(true)),
  patchBoundsViaAuthorityMock: vi.fn(() => Promise.resolve(true)),
  patchBatchGeometryViaAuthorityMock: vi.fn(() => Promise.resolve(true)),
  patchBatchGeometryMock: vi.fn(() => Promise.resolve(true)),
  commitMixedBatchGeometryMock: vi.fn(() => Promise.resolve(true)),
  patchGeometryMock: vi.fn(() => Promise.resolve(true)),
  statUpdatePositionsMock: vi.fn(() => Promise.resolve()),
  settleCommitMock: vi.fn(),
  activeGestureIdMock: vi.fn(() => null as string | null),
  documentElementPropsMock: vi.fn(),
  reportElementOpSkippedMock: vi.fn(),
}));

// 속성 패널은 지금 값을 트리에서 읽는다 - IPC 경계만 대역, 트리 스토어·런타임은 실물
const ipc = vi.hoisted(() => ({
  backend: null as FakeElementDocumentBackend | null,
}));
vi.mock('@api/modules/editor/elementDocumentApi', () => ({
  elementDocumentApi: new Proxy(
    {},
    {
      get: (_target, name: string) =>
        name === 'registerKind' || name === 'unregisterKind'
          ? async () => undefined
          : (ipc.backend!.api as Record<string, unknown>)[name],
    },
  ),
}));
vi.mock('@contexts/useTranslation', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'ko' },
  }),
}));
vi.mock('@hooks/useLenis', () => ({
  useLenis: () => ({ scrollContainerRef: vi.fn() }),
}));
vi.mock('@plugins/runtime/displayElement/pluginElementActions', () => ({
  renameLayerGroupViaAuthority: renameLayerGroupViaAuthorityMock,
  patchGraphColorsViaAuthority: patchGraphColorsViaAuthorityMock,
  patchGraphPropertiesViaAuthority: patchGraphPropertiesViaAuthorityMock,
  patchGraphTypesViaAuthority: patchGraphTypesViaAuthorityMock,
  patchFontStyleViaAuthority: patchFontStyleViaAuthorityMock,
  patchFontFamilyViaAuthority: patchFontFamilyViaAuthorityMock,
  patchStylePropertyViaAuthority: patchDisplayTextViaAuthorityMock,
  patchPaintViaAuthority: patchPaintViaAuthorityMock,
  patchShadowViaAuthority: patchShadowViaAuthorityMock,
  patchNotePaintViaAuthority: patchNotePaintViaAuthorityMock,
  patchInactiveImageViaAuthority: patchInactiveImageViaAuthorityMock,
  patchSoundPathViaAuthority: patchSoundPathViaAuthorityMock,
  patchSoundEnabledViaAuthority: patchSoundEnabledViaAuthorityMock,
  patchSoundVolumeViaAuthority: patchSoundVolumeViaAuthorityMock,
  patchCounterEnabledViaAuthority: patchCounterEnabledViaAuthorityMock,
  patchCounterAnimationEnabledViaAuthority:
    patchCounterAnimationEnabledViaAuthorityMock,
  patchCounterLayoutViaAuthority: patchCounterLayoutViaAuthorityMock,
  patchCounterTypographyViaAuthority: patchCounterTypographyViaAuthorityMock,
  patchCounterFillViaAuthority: patchCounterFillViaAuthorityMock,
  patchFontColorViaAuthority: patchFontColorViaAuthorityMock,
  patchKnobPropertiesViaAuthority: patchKnobPropertiesViaAuthorityMock,
  patchNativeLayerPropertyViaAuthority: patchPropertyViaAuthorityMock,
  patchNativeLayerBoundsViaAuthority: patchBoundsViaAuthorityMock,
  commitBatchGeometryViaAuthority: patchBatchGeometryViaAuthorityMock,
  patchNotePropertiesViaAuthority: patchNotePropertiesViaAuthorityMock,
  patchUseInlineStylesViaAuthority: patchUseInlineStylesViaAuthorityMock,
  updatePluginElement: vi.fn(),
}));
vi.mock('@src/renderer/editor/runtime/operations/elementOps', () => ({
  commitElementGeometryById: patchGeometryMock,
  commitBatchGeometryByIds: patchBatchGeometryMock,
  patchElementLayerNameById: patchLayerNameMock,
  patchFontStyleById: patchFontStyleMock,
  patchFontStyleByTargets: patchFontStyleTargetsMock,
  patchFontFamilyById: patchFontFamilyMock,
  patchFontFamilyByTargets: patchFontFamilyTargetsMock,
  patchStylePropertyById: patchDisplayTextMock,
  patchElementPropertyById: patchElementPropertyMock,
  patchPaintById: patchPaintMock,
  patchShadowById: patchShadowMock,
  patchNotePaintById: patchNotePaintMock,
  patchInactiveImageById: patchInactiveImageMock,
  patchActiveImageById: patchActiveImageMock,
  patchIdleTransparentById: patchIdleTransparentMock,
  patchActiveTransparentById: patchActiveTransparentMock,
  patchIdleImageFitById: patchIdleImageFitMock,
  patchActiveImageFitById: patchActiveImageFitMock,
  patchSoundPathById: patchSoundPathMock,
  patchSoundEnabledById: patchSoundEnabledMock,
  patchSoundVolumeById: patchSoundVolumeMock,
  patchCounterEnabledById: patchCounterEnabledMock,
  patchCounterAnimationEnabledById: patchCounterAnimationEnabledMock,
  patchCounterBooleanByTargetsViaAuthority:
    patchCounterBooleanByTargetsViaAuthorityMock,
  patchCounterLayoutById: patchCounterLayoutMock,
  patchCounterTypographyById: patchCounterTypographyMock,
  patchCounterFillById: patchCounterFillMock,
  patchFontColorById: patchFontColorMock,
  patchGraphColorById: patchGraphColorMock,
  patchGraphColorsByIds: patchGraphColorsMock,
  patchGraphPropertiesByIds: patchGraphPropertiesMock,
  patchGraphPropertyById: patchGraphPropertiesMock,
  patchGraphTypeById: patchGraphTypeMock,
  patchGraphTypesByIds: patchGraphTypesMock,
  patchKnobPropertiesByIds: patchKnobPropertiesMock,
  patchKnobPropertyById: patchKnobPropertyMock,
  patchNotePropertiesByIds: patchNotePropertiesMock,
  patchNotePropertyById: patchNotePropertyMock,
  patchStatTypeById: patchStatTypeMock,
  patchUseInlineStylesById: patchUseInlineStylesMock,
  patchUseInlineStylesByTargets: patchUseInlineStylesTargetsMock,
}));
vi.mock('@src/renderer/editor/runtime/intent/elementIntent', () => ({
  reportElementOpSkipped: reportElementOpSkippedMock,
}));
vi.mock('@src/renderer/editor/runtime/geometry/mixedBatchGeometry', () => ({
  commitMixedBatchGeometry: commitMixedBatchGeometryMock,
}));
vi.mock('@api/modules/editor/itemsApi', () => ({
  graphItemsApi: { updatePositions: graphUpdatePositionsMock },
  knobItemsApi: { updatePositions: knobUpdatePositionsMock },
  layerGroupsApi: { update: vi.fn(() => Promise.resolve()) },
  statItemsApi: { updatePositions: statUpdatePositionsMock },
}));
vi.mock('@src/renderer/editor/runtime/gesture/editGestureController', () => ({
  editGestureController: {
    activeGestureId: activeGestureIdMock,
    preview: previewMock,
    settleCommit: settleCommitMock,
  },
}));
vi.mock('./PropertiesPanel/index', async () => {
  const Stub = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  return {
    TABS: { STYLE: 'style', NOTE: 'note', COUNTER: 'counter' },
    PropertyRow: Stub,
    PropertySection: Stub,
    NumberInput: Stub,
    ColorInput: Stub,
    TextInput: Stub,
    LayerPanel: () => <div data-testid="layer-panel" />,
    PluginSelectionPanel: Stub,
    BatchKeyLikePanel: (props: Record<string, unknown>) => {
      batchKeyLikePropsMock(props);
      return <div />;
    },
    BatchPluginOnlyPanel: (props: Record<string, unknown>) => {
      batchPluginPropsMock(props);
      return <div />;
    },
    PluginSettingsPanelView: ({
      handlePluginSettingsPanelConfirm,
    }: {
      handlePluginSettingsPanelConfirm: () => void;
    }) => (
      <>
        <ScopeProbe id="plugin-settings" />
        <button onClick={handlePluginSettingsPanelConfirm}>
          save-plugin-settings
        </button>
      </>
    ),
    usePanelScroll: () => ({
      batchScrollRefFor: () => vi.fn(),
      singleScrollRefFor: () => vi.fn(),
    }),
  };
});
// 선언 단일 패널 - 무엇을 그리는지(장면·요소 id)와 편집 세션 scope만 본다
vi.mock('./PropertiesPanel/document/DocumentElementPanel', () => ({
  default: (props: { sceneId: string; elementId: string }) => {
    documentElementPropsMock(props);
    return <ScopeProbe id="document-element" />;
  },
}));
vi.mock('./PropertiesPanel/batch/useBatchHandlers', () => ({
  useBatchHandlers: (props: Record<string, unknown>) => {
    batchPropsMock(props);
    return {
      handleBatchStyleChangeComplete: legacyBatchStyleCommitMock,
      handleBatchCounterUpdate: legacyBatchCounterUpdateMock,
    };
  },
}));
vi.mock('./PropertiesPanel/navigation/PanelNavContext', () => ({
  PanelNavProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('./PropertiesPanel/navigation/PanelHeaderActions', () => ({
  default: ({ mode }: { mode: string }) => <div data-mode={mode} />,
}));
vi.mock('./PropertiesPanel/navigation/PanelToggleButton', () => ({
  default: () => <button>toggle</button>,
}));
vi.mock('@components/main/common/checkbox/Checkbox', () => ({
  default: () => null,
}));
vi.mock('@components/main/common/dropdown/Dropdown', () => ({
  default: () => null,
}));

import { useIsEditSessionScoped } from '@src/renderer/contexts/EditSessionScope';

import PropertiesPanel from './PropertiesPanel';

// 대상 전환 억제는 캔버스 선택 패널 안에서만 걸려야 한다
const ScopeProbe = ({ id }: { id: string }) => (
  <div data-testid={id} data-scoped={String(useIsEditSessionScoped())} />
);

interface MountedPanel {
  container: HTMLDivElement;
  root: Root;
  render: () => void;
}

const mountPanel = (): MountedPanel => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const render = () => {
    act(() => {
      root.render(<PropertiesPanel frameVariant="window" />);
    });
  };
  render();
  return { container, root, render };
};

// 옛 위치 모양으로 꾸민 트리 장면
const seed = legacyShapedSeed(() => ipc.backend!);

beforeAll(async () => {
  // 속성 패널은 편집 창(메인)에서 트리를 읽는다
  const windowType = window.__dmn_window_type;
  window.__dmn_window_type = 'main';
  ipc.backend = createFakeElementDocumentBackend({
    formatVersion: 1,
    kindVersions: {},
    scenes: {},
  });
  await loadElementDocumentStore();
  window.__dmn_window_type = windowType;
});

const resetStores = () => {
  seed.reset();
  previewMock.mockClear();
  settleCommitMock.mockClear();
  activeGestureIdMock.mockReset();
  activeGestureIdMock.mockReturnValue(null);
  documentElementPropsMock.mockClear();
  batchPluginPropsMock.mockClear();
  batchPropsMock.mockClear();
  batchKeyLikePropsMock.mockClear();
  patchLayerNameMock.mockClear();
  patchGraphTypeMock.mockClear();
  patchGraphColorMock.mockClear();
  patchGraphColorsMock.mockClear();
  patchGraphColorsViaAuthorityMock.mockClear();
  patchGraphPropertiesMock.mockClear();
  patchElementPropertyMock.mockClear();
  patchGraphPropertiesViaAuthorityMock.mockClear();
  patchGraphTypesMock.mockClear();
  patchGraphTypesViaAuthorityMock.mockClear();
  patchFontStyleMock.mockClear();
  patchFontStyleTargetsMock.mockClear();
  patchFontStyleViaAuthorityMock.mockClear();
  patchFontFamilyMock.mockClear();
  patchFontFamilyTargetsMock.mockClear();
  patchFontFamilyViaAuthorityMock.mockClear();
  patchInactiveImageMock.mockClear();
  patchInactiveImageViaAuthorityMock.mockClear();
  patchActiveImageMock.mockClear();
  patchIdleTransparentMock.mockClear();
  patchActiveTransparentMock.mockClear();
  patchIdleImageFitMock.mockClear();
  patchActiveImageFitMock.mockClear();
  patchSoundPathMock.mockClear();
  patchSoundPathViaAuthorityMock.mockClear();
  patchSoundEnabledMock.mockClear();
  patchSoundEnabledViaAuthorityMock.mockClear();
  patchSoundVolumeMock.mockClear();
  patchSoundVolumeViaAuthorityMock.mockClear();
  patchDisplayTextMock.mockClear();
  patchDisplayTextViaAuthorityMock.mockClear();
  patchPaintMock.mockClear();
  patchPaintViaAuthorityMock.mockClear();
  patchShadowMock.mockClear();
  patchShadowViaAuthorityMock.mockClear();
  patchNotePaintMock.mockClear();
  patchNotePaintViaAuthorityMock.mockClear();
  patchCounterEnabledMock.mockClear();
  patchCounterAnimationEnabledMock.mockClear();
  patchCounterEnabledViaAuthorityMock.mockClear();
  patchCounterBooleanByTargetsViaAuthorityMock.mockClear();
  patchCounterAnimationEnabledViaAuthorityMock.mockClear();
  patchCounterLayoutMock.mockClear();
  patchCounterLayoutViaAuthorityMock.mockClear();
  patchCounterTypographyMock.mockClear();
  patchCounterTypographyViaAuthorityMock.mockClear();
  patchCounterFillMock.mockClear();
  patchCounterFillViaAuthorityMock.mockClear();
  patchFontColorMock.mockClear();
  patchFontColorViaAuthorityMock.mockClear();
  patchKnobPropertiesMock.mockClear();
  patchKnobPropertiesViaAuthorityMock.mockClear();
  patchKnobPropertyMock.mockClear();
  patchNotePropertyMock.mockClear();
  patchStatTypeMock.mockClear();
  patchNotePropertiesMock.mockClear();
  patchNotePropertiesViaAuthorityMock.mockClear();
  patchUseInlineStylesMock.mockClear();
  patchUseInlineStylesTargetsMock.mockClear();
  patchUseInlineStylesViaAuthorityMock.mockClear();
  renameLayerGroupMock.mockClear();
  renameLayerGroupViaAuthorityMock.mockClear();
  patchPropertyViaAuthorityMock.mockClear();
  patchBoundsViaAuthorityMock.mockClear();
  patchBatchGeometryViaAuthorityMock.mockClear();
  patchBatchGeometryMock.mockClear();
  commitMixedBatchGeometryMock.mockClear();
  patchGeometryMock.mockClear();
  graphUpdatePositionsMock.mockClear();
  knobUpdatePositionsMock.mockClear();
  keyLegacyUpdateMock.mockClear();
  legacyBatchStyleCommitMock.mockClear();
  legacyBatchCounterUpdateMock.mockClear();
  reportElementOpSkippedMock.mockClear();
  statUpdatePositionsMock.mockClear();
  useKeyStore.setState({ selectedKeyType: '4key' });
  seed.keys({
    keyMappings: { '4key': [] },
    positions: { '4key': [] },
    canonicalPositions: { '4key': [] },
  });
  seed.stats({
    positions: {
      '4key': [
        {
          dx: 0,
          dy: 0,
          width: 60,
          height: 60,
          statType: 'kps',
        } as never,
      ],
    },
  });
  seed.graphs({
    positions: {
      '4key': [
        {
          dx: 0,
          dy: 0,
          width: 60,
          height: 60,
          statType: 'kps',
          graphType: 'line',
          graphSpeed: 1,
          graphColor: '#ffffff',
        } as never,
      ],
    },
  });
  seed.knobs({
    positions: {
      '4key': [
        {
          dx: 0,
          dy: 0,
          width: 60,
          height: 60,
          axisId: 'HIDA:test',
          sensitivity: 1,
          reverse: false,
        } as never,
      ],
    },
  });
  seed.layerGroups({ layerGroups: {} });
  usePluginDisplayElementStore.setState({
    elements: [],
    panelElements: [],
  } as never);
  usePropertiesPanelStore.setState({
    canvasPanelMode: 'property',
    canvasPanelActiveTab: 'layer',
    propertyPanelActiveTab: 'style',
    isCanvasPanelOpen: true,
    pluginSettingsPanel: null,
  });
  useDocumentSelectionStore.setState({
    selectedElements: [],
  });
};

describe('PropertiesPanel canonical native contract', () => {
  let mounted: MountedPanel | null;
  let originalWindowType: typeof window.__dmn_window_type;

  const installSingle = (type: 'key' | 'stat', id: string, staleIndex = 0) => {
    const otherId = '99999999-9999-4999-8999-999999999999';
    const base = createDefaultKeyPosition();
    if (type === 'key') {
      const items = [
        { ...base, id: otherId },
        { ...base, id },
      ];
      seed.keys({
        keyMappings: { '4key': ['B', 'A'] },
        positions: { '4key': items },
        canonicalPositions: { '4key': items },
      });
    } else {
      seed.stats({
        positions: {
          '4key': [
            { ...base, id: otherId, statType: 'kps' },
            { ...base, id, statType: 'kps' },
          ],
        },
      });
    }
    useDocumentSelectionStore.setState({
      selectedElements: [{ type, id, index: staleIndex }],
    });
  };

  beforeEach(() => {
    originalWindowType = window.__dmn_window_type;
    window.__dmn_window_type = 'main';
    mounted = null;
    resetStores();
  });

  afterEach(() => {
    if (mounted) {
      act(() => mounted?.root.unmount());
      mounted.container.remove();
    }
    window.__dmn_window_type = originalWindowType;
  });

  it.each([
    ['key', '11111111-1111-4111-8111-111111111111'],
    ['stat', '22222222-2222-4222-8222-222222222222'],
  ] as const)(
    '단일 %s는 선택의 낡은 순번이 아니라 선택 ID로 선언 패널을 그린다',
    (type, id) => {
      installSingle(type, id);
      mounted = mountPanel();

      expect(documentElementPropsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ sceneId: '4key', elementId: id }),
      );
    },
  );

  it('batch geometry는 stable ID target만 한 번 커밋한다', () => {
    const firstId = '71111111-1111-4111-8111-111111111111';
    const secondId = '72222222-2222-4222-8222-222222222222';
    const first = { ...createDefaultKeyPosition(), id: firstId };
    const second = { ...createDefaultKeyPosition(), id: secondId, dx: 80 };
    seed.keys({
      keyMappings: { '4key': ['A', 'B'] },
      positions: { '4key': [first, second] },
      canonicalPositions: { '4key': [first, second] },
    });
    useDocumentSelectionStore.setState({
      selectedElements: [
        { type: 'key', id: firstId, index: 1 },
        { type: 'key', id: secondId, index: 0 },
      ],
    });
    mounted = mountPanel();
    const props = batchPropsMock.mock.lastCall?.[0] as {
      onStableGeometryCommit: (
        operation: Record<string, unknown>,
        options?: { gestureId?: string },
      ) => void;
    };

    act(() =>
      props.onStableGeometryCommit(
        { kind: 'resize', dimension: 'width', value: 91 },
        { gestureId: '73333333-3333-4333-8333-333333333333' },
      ),
    );

    expect(patchBatchGeometryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: '4key',
        targets: [
          { type: 'key', id: firstId },
          { type: 'key', id: secondId },
        ],
        operation: { kind: 'resize', dimension: 'width', value: 91 },
      }),
      { gestureId: '73333333-3333-4333-8333-333333333333' },
    );
  });

  it('invalid ID가 섞인 batch는 어떤 writer도 만들지 않는다', () => {
    const stableId = '81111111-1111-4111-8111-111111111111';
    const stable = { ...createDefaultKeyPosition(), id: stableId };
    const invalid = { ...createDefaultKeyPosition(), id: 'key-1' };
    seed.keys({
      keyMappings: { '4key': ['A', 'B'] },
      positions: { '4key': [stable, invalid] },
      canonicalPositions: { '4key': [stable, invalid] },
    });
    useDocumentSelectionStore.setState({
      selectedElements: [
        { type: 'key', id: stableId, index: 0 },
        { type: 'key', id: 'key-1', index: 1 },
      ],
    });
    mounted = mountPanel();

    expect(patchBatchGeometryMock).not.toHaveBeenCalled();
    expect(patchBatchGeometryViaAuthorityMock).not.toHaveBeenCalled();
    expect(legacyBatchStyleCommitMock).not.toHaveBeenCalled();
    expect(keyLegacyUpdateMock).not.toHaveBeenCalled();
  });

  describe('혼합 선택 크기 표시 집합', () => {
    const MIXED_KEY_ID = 'a4444444-4444-4444-8444-444444444444';
    const MIXED_SPRITE_ID = 'a5555555-5555-4555-8555-555555555555';

    // 크기 입력은 resize가 실제로 조절하는 집합을 그대로 읽어야 한다.
    // 스타일 집합에는 스프라이트가 없어서 그걸 쓰면 키 값이 대표로 뜨고,
    // 그 값을 확정하면 스프라이트의 모든 자세 오프셋까지 배율이 먹는다
    it('키와 스프라이트를 함께 고르면 크기 getter가 Mixed를 낸다', () => {
      const key = { ...createDefaultKeyPosition(), id: MIXED_KEY_ID };
      seed.keys({
        keyMappings: { '4key': ['A'] },
        positions: { '4key': [key] },
        canonicalPositions: { '4key': [key] },
      });
      seed.sprites({
        positions: {
          '4key': [
            makeCanonicalSpritePosition({
              id: MIXED_SPRITE_ID,
              layerName: null,
              groupId: null,
              width: 200,
              height: 200,
            }),
          ],
        },
      });
      useDocumentSelectionStore.setState({
        selectedElements: [
          { type: 'key', id: MIXED_KEY_ID, index: 0 },
          { type: 'sprite', id: MIXED_SPRITE_ID, index: 0 },
        ],
      });

      mounted = mountPanel();

      const props = batchKeyLikePropsMock.mock.lastCall?.[0] as {
        getMixedValue: MixedGetter;
        getMixedValueGeometry: MixedGetter;
      };

      expect(props.getMixedValueGeometry((pos) => pos.width, 60)).toEqual({
        isMixed: true,
        value: 60,
      });
      // 스타일 집합은 스프라이트를 보지 않는다 - 크기에 이걸 쓰면 안 되는 이유
      expect(props.getMixedValue((pos) => pos.width, 60)).toEqual({
        isMixed: false,
        value: 60,
      });
    });

    // 커밋은 resizeSprite로 자세까지 스케일한다. 미리보기가 원시
    // bounds만 얹으면 드래그 중엔 활동 영역만 줄다가 놓는 순간 튄다
    it('스프라이트 크기 미리보기는 이미지와 자세까지 커밋과 같게 투영한다', () => {
      const key = { ...createDefaultKeyPosition(), id: MIXED_KEY_ID };
      seed.keys({
        keyMappings: { '4key': ['A'] },
        positions: { '4key': [key] },
        canonicalPositions: { '4key': [key] },
      });
      seed.sprites({
        positions: {
          '4key': [
            makeCanonicalSpritePosition({
              id: MIXED_SPRITE_ID,
              layerName: null,
              groupId: null,
              width: 200,
              height: 200,
              poses: [
                makeSpritePose({
                  poseId: 'pose-1',
                  transform: { x: -60, y: 0, rotation: 0, scale: 1 },
                }),
              ],
            }),
          ],
        },
      });
      useDocumentSelectionStore.setState({
        selectedElements: [
          { type: 'key', id: MIXED_KEY_ID, index: 0 },
          { type: 'sprite', id: MIXED_SPRITE_ID, index: 0 },
        ],
      });

      mounted = mountPanel();
      const geometryProps = batchPropsMock.mock.lastCall?.[0] as {
        onStableGeometryPreview: (operation: Record<string, unknown>) => void;
      };
      act(() =>
        geometryProps.onStableGeometryPreview({
          kind: 'resize',
          dimension: 'width',
          value: 100,
        }),
      );

      const spriteCall = previewMock.mock.calls.find(
        (call) =>
          (call[2] as { domain?: string } | undefined)?.domain ===
          'spritePosition',
      );
      expect(spriteCall).toBeTruthy();
      const patch = (
        spriteCall?.[1] as Array<{ id: string; patch: Record<string, unknown> }>
      )[0].patch;
      // 200 -> 100 이므로 배율 0.5가 콘텐츠에도 그대로 걸린다
      expect(patch.width).toBe(100);
      expect(
        (patch.poses as Array<{ transform: { x: number } }>)[0].transform.x,
      ).toBe(-30);
    });
  });

  describe('혼합 선택 batch geometry pluginTargets 결합', () => {
    const FIRST_KEY_ID = 'a1111111-1111-4111-8111-111111111111';
    const SECOND_KEY_ID = 'a2222222-2222-4222-8222-222222222222';
    const PLUGIN_FULL_ID = 'plugin-a::10000000-0000-4000-8000-000000000001';

    const pluginElement = () => ({
      id: '10000000-0000-4000-8000-000000000001',
      fullId: PLUGIN_FULL_ID,
      pluginId: 'plugin-a',
      definitionId: 'plugin-a',
      position: { x: 200, y: 0 },
      estimatedSize: { width: 50, height: 50 },
      tabId: '4key',
      zIndex: 0,
    });

    const installMixedSelection = (windowType: 'main' | 'panel') => {
      const first = { ...createDefaultKeyPosition(), id: FIRST_KEY_ID };
      const second = {
        ...createDefaultKeyPosition(),
        id: SECOND_KEY_ID,
        dx: 80,
      };
      seed.keys({
        keyMappings: { '4key': ['A', 'B'] },
        positions: { '4key': [first, second] },
        canonicalPositions: { '4key': [first, second] },
      });
      usePluginDisplayElementStore.setState(
        (windowType === 'panel'
          ? { panelElements: [pluginElement()] }
          : { elements: [pluginElement()] }) as never,
      );
      useDocumentSelectionStore.setState({
        selectedElements: [
          { type: 'key', id: FIRST_KEY_ID, index: 0 },
          { type: 'key', id: SECOND_KEY_ID, index: 1 },
          { type: 'plugin', id: PLUGIN_FULL_ID },
        ],
      });
    };

    const commitProps = () =>
      batchPropsMock.mock.lastCall?.[0] as {
        onStableGeometryCommit: (
          operation: Record<string, unknown>,
          options?: { gestureId?: string },
        ) => void;
      };

    it('main 혼합 정렬은 mixed helper에 pluginTargets를 싣는다', () => {
      installMixedSelection('main');
      mounted = mountPanel();

      act(() =>
        commitProps().onStableGeometryCommit({
          kind: 'align',
          direction: 'left',
        }),
      );

      expect(commitMixedBatchGeometryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: '4key',
          targets: [
            { type: 'key', id: FIRST_KEY_ID },
            { type: 'key', id: SECOND_KEY_ID },
          ],
          operation: { kind: 'align', direction: 'left' },
        }),
        [PLUGIN_FULL_ID],
        {},
      );
      expect(patchBatchGeometryMock).not.toHaveBeenCalled();
      expect(patchBatchGeometryViaAuthorityMock).not.toHaveBeenCalled();
    });

    it('혼합 선택 resize는 native 전용 경로로 남는다', () => {
      installMixedSelection('main');
      mounted = mountPanel();

      act(() =>
        commitProps().onStableGeometryCommit(
          { kind: 'resize', dimension: 'width', value: 91 },
          { gestureId: 'a3333333-3333-4333-8333-333333333333' },
        ),
      );

      expect(patchBatchGeometryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: { kind: 'resize', dimension: 'width', value: 91 },
        }),
        { gestureId: 'a3333333-3333-4333-8333-333333333333' },
      );
      expect(commitMixedBatchGeometryMock).not.toHaveBeenCalled();
    });

    it('plugin 대상 미해결(모드 이탈) 혼합 커밋은 fail-closed로 막는다', () => {
      installMixedSelection('main');
      const store = usePluginDisplayElementStore.getState();
      usePluginDisplayElementStore.setState({
        elements: [{ ...store.elements[0], tabId: '7key' }],
      } as never);
      mounted = mountPanel();

      act(() =>
        commitProps().onStableGeometryCommit({
          kind: 'align',
          direction: 'left',
        }),
      );

      expect(commitMixedBatchGeometryMock).not.toHaveBeenCalled();
      expect(patchBatchGeometryMock).not.toHaveBeenCalled();
      expect(patchBatchGeometryViaAuthorityMock).not.toHaveBeenCalled();
    });

    it('plugin 포함 그룹 선택은 그룹 헤더 정보와 합산 개수를 전달한다', () => {
      const first = {
        ...createDefaultKeyPosition(),
        id: FIRST_KEY_ID,
        groupId: 'group-a',
      };
      const second = {
        ...createDefaultKeyPosition(),
        id: SECOND_KEY_ID,
        dx: 80,
        groupId: 'group-a',
      };
      seed.keys({
        keyMappings: { '4key': ['A', 'B'] },
        positions: { '4key': [first, second] },
        canonicalPositions: { '4key': [first, second] },
      });
      seed.layerGroups({
        layerGroups: { '4key': [{ id: 'group-a', name: '그룹 A' }] },
      } as never);
      usePluginDisplayElementStore.setState({
        elements: [{ ...pluginElement(), groupId: 'group-a' }],
      } as never);
      seed.plugins({
        '4key': [
          { id: PLUGIN_FULL_ID, pluginId: 'plugin-a', groupId: 'group-a' },
        ],
      });
      useDocumentSelectionStore.setState({
        selectedElements: [
          { type: 'key', id: FIRST_KEY_ID, index: 0 },
          { type: 'key', id: SECOND_KEY_ID, index: 1 },
          { type: 'plugin', id: PLUGIN_FULL_ID },
        ],
      });
      mounted = mountPanel();

      const props = batchKeyLikePropsMock.mock.lastCall?.[0] as {
        selectedGroupInfo: {
          id: string;
          name: string;
          memberCount: number;
        } | null;
        totalCount?: number;
      };
      expect(props.selectedGroupInfo).toEqual({
        id: 'group-a',
        name: '그룹 A',
        memberCount: 3,
      });
      expect(props.totalCount).toBe(3);
    });

    it('plugin 단독 다중 선택은 경량 기하 배치 패널로 라우트한다', () => {
      const secondFullId = 'plugin-a::10000000-0000-4000-8000-000000000002';
      usePluginDisplayElementStore.setState({
        elements: [
          pluginElement(),
          {
            ...pluginElement(),
            id: '10000000-0000-4000-8000-000000000002',
            fullId: secondFullId,
            position: { x: 260, y: 0 },
          },
        ],
      } as never);
      useDocumentSelectionStore.setState({
        selectedElements: [
          { type: 'plugin', id: PLUGIN_FULL_ID },
          { type: 'plugin', id: secondFullId },
        ],
      });
      mounted = mountPanel();

      const props = batchPluginPropsMock.mock.lastCall?.[0] as {
        totalCount: number;
      };
      expect(props.totalCount).toBe(2);
      expect(batchKeyLikePropsMock).not.toHaveBeenCalled();
    });
  });
});

describe('PropertiesPanel 편집 세션 scope 경계', () => {
  let mounted: MountedPanel;

  const scopedOf = (id: string) =>
    mounted.container
      .querySelector(`[data-testid="${id}"]`)
      ?.getAttribute('data-scoped');

  beforeEach(() => {
    resetStores();
  });

  afterEach(() => {
    act(() => mounted.root.unmount());
    mounted.container.remove();
    document
      .querySelectorAll('[data-dmn-modal-backdrop], [data-dmn-popup-layer]')
      .forEach((node) => node.remove());
  });

  it('캔버스 선택 패널은 편집 세션 scope 안이다', () => {
    const id = '91111111-1111-4111-8111-111111111111';
    seed.stats({
      positions: {
        '4key': [
          {
            ...seed.current().stats['4key']![0],
            id,
          },
        ],
      },
    });
    useDocumentSelectionStore.setState({
      selectedElements: [{ type: 'stat', id, index: 0 }],
    });
    mounted = mountPanel();

    expect(scopedOf('document-element')).toBe('true');
  });

  it('플러그인 설정 패널은 편집 세션 scope 밖이다', () => {
    usePropertiesPanelStore.setState({
      pluginSettingsPanel: {
        pluginId: 'scope-test',
        definition: { settings: {} },
        settings: {},
        originalSettings: {},
        onChange: vi.fn(),
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
        resolve: vi.fn(),
      } as never,
    });
    mounted = mountPanel();

    expect(scopedOf('plugin-settings')).toBe('false');
  });

  it('실제 플러그인 설정 세션의 저장 실패를 한 번 정산하고 안내한다', async () => {
    const originalApi = window.api;
    const alert = vi.fn().mockResolvedValue(undefined);
    const onCancel = vi.fn();
    const resolve = vi.fn();
    const originalSettings = { enabled: false };
    let rejectSave!: (error: Error) => void;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectSave = reject;
        }),
    );
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    window.api = { ui: { dialog: { alert } } } as never;
    try {
      openPluginSettingsSession({
        pluginId: 'save-test',
        definition: { settings: {} },
        settings: { enabled: true },
        originalSettings,
        onChange: vi.fn(),
        onConfirm,
        onCancel,
        resolve,
      });
      mounted = mountPanel();

      await act(async () => {
        const button = [...mounted.container.querySelectorAll('button')].find(
          (element) => element.textContent === 'save-plugin-settings',
        );
        expect(button).toBeDefined();
        button!.click();
      });

      expect(onConfirm).toHaveBeenCalledExactlyOnceWith(
        { enabled: true },
        originalSettings,
      );
      expect(usePropertiesPanelStore.getState().pluginSettingsPanel).toBeNull();
      expect(resolve).not.toHaveBeenCalled();
      await act(async () => rejectSave(new Error('disk write failed')));

      expect(onCancel).not.toHaveBeenCalled();
      expect(resolve).toHaveBeenCalledExactlyOnceWith(false);
      expect(alert).toHaveBeenCalledExactlyOnceWith('common.saveFailed', {
        confirmText: 'common.ok',
      });
      expect(usePropertiesPanelStore.getState().pluginSettingsPanel).toBeNull();
    } finally {
      cancelPluginSettingsSessionForPlugin('save-test');
      window.api = originalApi;
      consoleError.mockRestore();
    }
  });
});

describe('PropertiesPanel 배치 색상 피커 대상 결합', () => {
  let mounted: MountedPanel;

  const selectKeys = (...indices: number[]) => {
    useDocumentSelectionStore.setState({
      selectedElements: indices.map((index) => ({
        type: 'key' as const,
        id: `key-${index}`,
        index,
      })),
    });
  };

  const latestBatchProps = () =>
    batchKeyLikePropsMock.mock.lastCall?.[0] as {
      batchPickerFor: string | null;
      handleBatchPickerToggle: (target: string) => void;
    };

  beforeEach(() => {
    resetStores();
    useKeyStore.setState({ selectedKeyType: '4key' });
    seed.keys({
      keyMappings: { '4key': ['KeyA', 'KeyS', 'KeyD'] as never },
      positions: {
        '4key': [
          { dx: 0, dy: 0, width: 60, height: 60 },
          { dx: 0, dy: 0, width: 60, height: 60 },
          { dx: 0, dy: 0, width: 60, height: 60 },
        ] as never,
      },
    });
    selectKeys(0, 1, 2);
    mounted = mountPanel();
  });

  afterEach(() => {
    act(() => mounted.root.unmount());
    mounted.container.remove();
  });

  it('선택이 바뀌면 열려 있던 배치 색상 피커를 닫는다', () => {
    act(() => latestBatchProps().handleBatchPickerToggle('noteColor'));
    expect(latestBatchProps().batchPickerFor).toBe('noteColor');

    act(() => selectKeys(0, 1));

    expect(latestBatchProps().batchPickerFor).toBeNull();
  });

  // 선택을 건드리지 않는 재렌더까지 닫으면 피커를 쓸 수가 없다.
  // 기존 이미지 피커 3종과 같은 조건(선택 store 갱신)에만 반응해야 한다
  it('선택을 건드리지 않는 재렌더는 피커를 닫지 않는다', () => {
    act(() => latestBatchProps().handleBatchPickerToggle('noteColor'));

    act(() => mounted.render());

    expect(latestBatchProps().batchPickerFor).toBe('noteColor');
  });
});

describe('PropertiesPanel detached selection sync contract', () => {
  let mounted: MountedPanel;

  beforeEach(() => {
    resetStores();
  });

  afterEach(() => {
    act(() => mounted.root.unmount());
    mounted.container.remove();
  });

  it('normalizes an empty snapshot to layer immediately', () => {
    mounted = mountPanel();
    expect(usePropertiesPanelStore.getState().canvasPanelMode).toBe('layer');
  });

  it('graph 선택이면 style로 정규화한다', () => {
    usePropertiesPanelStore.setState({ propertyPanelActiveTab: 'counter' });
    useDocumentSelectionStore.setState({
      selectedElements: [{ type: 'graph', id: 'graph-0', index: 0 }],
    });
    mounted = mountPanel();

    expect(usePropertiesPanelStore.getState().propertyPanelActiveTab).toBe(
      'style',
    );
  });

  it.each(['property', 'layer'] as const)(
    'selection이 있으면 %s 모드를 유지한다',
    (mode) => {
      usePropertiesPanelStore.setState({ canvasPanelMode: mode });
      useDocumentSelectionStore.setState({
        selectedElements: [{ type: 'plugin', id: 'missing-plugin' }],
      });
      mounted = mountPanel();

      expect(usePropertiesPanelStore.getState().canvasPanelMode).toBe(mode);
    },
  );

  it('keeps layer sticky when selection arrives after an empty snapshot', () => {
    mounted = mountPanel();
    expect(usePropertiesPanelStore.getState().canvasPanelMode).toBe('layer');

    act(() => {
      useDocumentSelectionStore.setState({
        selectedElements: [{ type: 'plugin', id: 'missing-plugin' }],
      });
    });

    expect(usePropertiesPanelStore.getState().canvasPanelMode).toBe('layer');
  });
});

describe('PropertiesPanel plugin settings Escape contract', () => {
  let mounted: MountedPanel;
  let onCancel: ReturnType<typeof vi.fn>;
  let resolve: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetStores();
    onCancel = vi.fn();
    resolve = vi.fn();
    usePropertiesPanelStore.setState({
      pluginSettingsPanel: {
        pluginId: 'escape-test',
        definition: { settings: {} },
        settings: { memo: 'draft' },
        originalSettings: { memo: 'original' },
        onChange: vi.fn(),
        onConfirm: vi.fn(),
        onCancel,
        resolve,
      } as never,
    });
    mounted = mountPanel();
  });

  afterEach(() => {
    act(() => mounted.root.unmount());
    mounted.container.remove();
    document
      .querySelectorAll('[data-dmn-modal-backdrop], [data-dmn-popup-layer]')
      .forEach((node) => node.remove());
  });

  it('cancels the session exactly once from an unowned Escape', () => {
    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });

    act(() => document.body.dispatchEvent(event));

    expect(event.defaultPrevented).toBe(true);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledWith({ memo: 'original' });
    expect(resolve).toHaveBeenCalledWith(false);
    expect(usePropertiesPanelStore.getState().pluginSettingsPanel).toBeNull();
  });

  it('yields Escape to a focused editor control', () => {
    const input = document.createElement('input');
    mounted.container.append(input);

    act(() => {
      input.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    expect(onCancel).not.toHaveBeenCalled();
  });

  it.each([
    ['modal', 'data-dmn-modal-backdrop'],
    ['popup', 'data-dmn-popup-layer'],
  ] as const)('yields Escape to a higher %s layer', (_label, attribute) => {
    const layer = document.createElement('div');
    layer.setAttribute(attribute, 'true');
    document.body.append(layer);

    act(() => {
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    expect(onCancel).not.toHaveBeenCalled();
  });

  it('yields an already consumed Escape', () => {
    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    event.preventDefault();

    act(() => document.body.dispatchEvent(event));

    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe('useKeySlotCapture listening contract', () => {
  let originalApi: typeof window.api;
  let rawListener: ((payload: Record<string, unknown>) => void) | null;
  let rawUnsubscribe: ReturnType<typeof vi.fn>;
  let onCapture: ReturnType<
    typeof vi.fn<(globalKey: string, listenIndex: number | null) => void>
  >;
  let harness: { root: Root; container: HTMLDivElement };
  let latest: {
    isListening: boolean;
    startListen: (index: number | null) => void;
  } | null;

  const CaptureHarness = () => {
    // 캡처 훅 상태를 테스트에서 관찰하기 위한 최소 하네스
    const capture = useKeySlotCapture({ onCapture, escapeCancels: true });
    React.useEffect(() => {
      latest = capture;
    });
    return null;
  };

  const startListening = () => {
    act(() => latest?.startListen(null));
    expect(latest?.isListening).toBe(true);
  };

  beforeEach(() => {
    rawListener = null;
    rawUnsubscribe = vi.fn();
    onCapture =
      vi.fn<(globalKey: string, listenIndex: number | null) => void>();
    originalApi = window.api;
    window.api = {
      ...originalApi,
      keys: {
        ...originalApi?.keys,
        onRawInput: vi.fn((listener) => {
          rawListener = listener as (payload: Record<string, unknown>) => void;
          return rawUnsubscribe;
        }),
      },
    } as typeof window.api;

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(<CaptureHarness />));
    harness = { root, container };
  });

  afterEach(() => {
    act(() => harness.root.unmount());
    harness.container.remove();
    window.api = originalApi;
    latest = null;
  });

  it('plain Escape cancels listening without capturing', () => {
    startListening();
    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });

    act(() => window.dispatchEvent(event));

    expect(event.defaultPrevented).toBe(true);
    expect(onCapture).not.toHaveBeenCalled();
    expect(latest?.isListening).toBe(false);
    expect(rawUnsubscribe).toHaveBeenCalledOnce();
  });

  it('raw Escape cancels listening without assigning Escape', () => {
    startListening();

    act(() =>
      rawListener?.({
        label: 'ESCAPE',
        labels: ['ESCAPE'],
        state: 'DOWN',
        device: 'keyboard',
      }),
    );

    expect(onCapture).not.toHaveBeenCalled();
    expect(latest?.isListening).toBe(false);
  });

  it('captures one normal raw key and stops listening', () => {
    startListening();

    act(() =>
      rawListener?.({
        label: 'A',
        labels: ['A'],
        state: 'DOWN',
        device: 'keyboard',
      }),
    );

    expect(onCapture).toHaveBeenCalledOnce();
    expect(onCapture).toHaveBeenCalledWith('A', null);
    expect(latest?.isListening).toBe(false);
  });

  it('captures into a replace target index', () => {
    act(() => latest?.startListen(1));
    expect(latest?.isListening).toBe(true);

    act(() =>
      rawListener?.({
        label: 'B',
        labels: ['B'],
        state: 'DOWN',
        device: 'keyboard',
      }),
    );

    expect(onCapture).toHaveBeenCalledWith('B', 1);
    expect(latest?.isListening).toBe(false);
  });
});
