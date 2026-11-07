'use no memo';
// 편집 미리보기(모듈 상태)를 렌더 중에 읽어서 컴파일러 메모 제외
import React, {
  createElement,
  Suspense,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { editGestureController } from '@src/renderer/editor/runtime/gesture/editGestureController';
import type { PanelSectionDecl } from '@src/renderer/elementKinds/defineElementKind';
import { elementKindDefinition } from '@src/renderer/elementKinds/runtime/elementKindRegistry';
import { TREE_EDITED_KINDS } from '@src/types/elementKinds';
import type { KeyPosition } from '@src/types/key/keys';
import { usePropertiesPanelStore } from '@stores/grid/usePropertiesPanelStore';
import { useSettingsStore } from '@stores/useSettingsStore';
import { documentBatchGeometry } from '../../document/documentBatchGeometry';
import { editDocument } from '../../document/documentEditActions';
import {
  documentGroupNames,
  wholeGroupOf,
} from '../../document/documentGroups';
import { aggregateMixedValue } from '../batch/mixedValue';
import BatchPanelHeader from '../batch/BatchPanelHeader';
import BatchGeometryRows, {
  type BatchGeometry,
} from '../batch/geometry/BatchGeometryRows';
import { PropertySection, Tabs } from '../controls/PropertyInputs';
import { PANEL_ROOT_CLASS } from '../navigation/panelChrome';
import EditSessionBoundary from '../selection/EditSessionBoundary';
import { batchRowRenderer } from './documentBatchRows';
import { usePanelElements } from './usePanelElements';
import {
  defaultPanel,
  type Translate,
  type Values,
} from './documentPanelModel';
import {
  PanelSections,
  SurfaceRows,
  type PanelSectionRenderers,
} from './documentPanelRows';
import { unionBatchSections, unionBatchTabs } from './documentPanelUnion';
import KindBatchRows from './KindBatchRows';
import {
  LegacyBatchCustomCssSection,
  LegacyBatchStyle,
  type LegacyBatchItem,
} from './legacyBundleRows';
import {
  LegacyKeyLikeBatchBody,
  type LegacyKeyLikeHost,
} from './legacyKeyLikeBatch';
import OverlayScrollbar from '@components/main/common/overlayScrollbar/OverlayScrollbar';

// 옛 종류 선택의 일괄 기하 - 속성 패널이 옛 선택 모양(플러그인 요소 포함)에서 만든다
export type LegacyBatchGeometry = BatchGeometry;

// 옛 종류 선택 - 속성 패널이 옛 선택 모양(플러그인 요소 포함)에서 만든 개수·그룹·일괄 기하
export interface LegacyBatchHost {
  totalCount: number;
  groupInfo: { id: string; name: string; memberCount: number } | null;
  geometry: LegacyBatchGeometry;
  // 함께 고른 플러그인 요소의 설정 - 정의마다 섹션 하나 (스타일 탭 끝)
  pluginSettings?: ReactNode;
}

interface DocumentBatchPanelProps {
  sceneId: string;
  elementIds: readonly string[];
  panelElement: HTMLElement | null;
  setPanelElement: (element: HTMLDivElement | null) => void;
  // 패널 스크롤 (Lenis) - 선택이 바뀌어도 같은 뷰포트를 쓴다
  scrollRef?: (node: HTMLDivElement | null) => void;
  legacyHost?: LegacyBatchHost;
  // 여러 옛 종류를 고른 선택 - 속성 패널이 갖는 일괄 피커 상태 (탭마다 옛 일괄 부품으로 그린다)
  keyLikeHost?: LegacyKeyLikeHost;
  t: Translate;
}

/** 트리 요소 여러 개 - 단일 패널과 같은 선언에서 섞인 값과 함께 그린다 */
const DocumentBatchPanel = ({
  sceneId,
  elementIds,
  panelElement,
  setPanelElement,
  scrollRef,
  legacyHost,
  keyLikeHost,
  t,
}: DocumentBatchPanelProps) => {
  const { scene, elements, writer, items } = usePanelElements(
    sceneId,
    elementIds,
  );
  const useCustomCSS = useSettingsStore((state) => state.useCustomCSS);
  const activeTab = usePropertiesPanelStore(
    (state) => state.propertyPanelActiveTab,
  );
  const setActiveTab = usePropertiesPanelStore(
    (state) => state.setPropertyPanelActiveTab,
  );
  // 이름 바꾸기는 그 선택에서만 - 선택이 바뀌면 끝난다
  const selectionKey = `${sceneId}:${[...elementIds].sort().join(',')}`;
  const [renamingFor, setRenamingFor] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const renameCancelledRef = useRef(false);
  if (elements.length === 0) return null;

  const groupInfo = legacyHost
    ? legacyHost.groupInfo
    : wholeGroupOf(scene, elementIds);
  const isRenaming = groupInfo !== null && renamingFor === selectionKey;
  const totalCount = legacyHost?.totalCount ?? elements.length;

  // 모두 같은 종류면 그 종류의 선언 칸을 섞인 값과 함께 보인다
  const kinds = new Set(elements.map((node) => node.kind));
  const definition =
    kinds.size === 1 ? elementKindDefinition(elements[0].kind) : undefined;
  // 표면 묶음을 가진 요소 - 트리에만 있는 종류의 표면 칸은 그 요소들에만. 옛 종류의 표면은 옛 일괄 처리기만
  // 고친다(칠 규칙) - 트리에만 있는 종류와 섞인 선택에서는 그리지 않는다
  const surfaceOwners = elements.filter((element) =>
    elementKindDefinition(element.kind)?.bundles?.includes('surface'),
  );
  const treeSurfaceOnly = !surfaceOwners.some((element) =>
    TREE_EDITED_KINDS.has(element.kind),
  );
  // 옛 종류의 겉모습 칸 - 종류와 옛 패널이 보던 값
  const legacyItems: LegacyBatchItem[] = elements.map((element, index) => ({
    kind: element.kind,
    position: items[index] as unknown as KeyPosition,
  }));

  // 정렬·분배·간격·크기 - 옛 종류는 옛 일괄 처리기, 트리에만 있는 종류는 트리 틀 연산
  const treeGeometry = documentBatchGeometry(sceneId, elements);
  const geometry: LegacyBatchGeometry = legacyHost?.geometry ?? {
    handleBatchAlign: (direction) =>
      treeGeometry.commit({ kind: 'align', direction }),
    handleBatchDistribute: (direction) =>
      treeGeometry.commit({ kind: 'distribute', direction }),
    handleBatchSpacing: (spacing) =>
      treeGeometry.commit({ kind: 'spacing', spacing }),
    handleBatchSpacingCommit: (spacing) =>
      treeGeometry.commit({ kind: 'spacing', spacing }),
    getBatchSpacingValue: treeGeometry.spacingValue,
    // 옛 종류는 옛 패널이 보던 값(편집 미리보기 포함)
    getBatchSizeValue: (dimension) =>
      writer
        ? aggregateMixedValue(items, (item) => item[dimension] as number, 60)
        : aggregateMixedValue(elements, (node) => node.frame[dimension], 60),
    handleBatchResize: (dimension, value) => {
      treeGeometry.clearPreview();
      treeGeometry.commit({ kind: 'resize', dimension, value });
    },
    handleBatchResizePreview: (dimension, value) =>
      treeGeometry.preview({ kind: 'resize', dimension, value }),
  };
  const cancelResizePreview = legacyHost
    ? () => editGestureController.cancel()
    : treeGeometry.clearPreview;

  const renderers: PanelSectionRenderers = {
    geometry: () => (
      <PropertySection>
        <BatchGeometryRows
          totalCount={totalCount}
          geometry={geometry}
          onCancelResize={cancelResizePreview}
          t={t}
        />
      </PropertySection>
    ),
    custom: (component, _section, ids = elementIds) => (
      // 편집 화면 전용 섹션은 지연 로딩일 수 있다
      <Suspense fallback={null}>
        {createElement(component, {
          sceneId,
          elementIds: ids,
          panelElement,
          t,
        })}
      </Suspense>
    ),
    customCss: () =>
      useCustomCSS && writer ? (
        <LegacyBatchCustomCssSection
          items={legacyItems}
          writer={writer}
          t={t}
        />
      ) : null,
    bundles: (bundles) => {
      if (writer) {
        return (
          <LegacyBatchStyle
            items={legacyItems}
            writer={writer}
            selectionKey={selectionKey}
            panelElement={panelElement}
            t={t}
          />
        );
      }
      return bundles.includes('surface') &&
        surfaceOwners.length > 0 &&
        treeSurfaceOnly ? (
        <PropertySection>
          <SurfaceRows
            surfaces={surfaceOwners.map(
              (element) => (element.bundles?.surface ?? {}) as Values,
            )}
            panelElement={panelElement}
            t={t}
            onCommit={(fields) =>
              void editDocument(
                surfaceOwners.map((element) => ({
                  op: 'setBundle' as const,
                  scene: sceneId,
                  id: element.id,
                  bundle: 'surface',
                  fields,
                })),
              )
            }
          />
        </PropertySection>
      ) : null;
    },
    row: batchRowRenderer({
      sceneId,
      elements,
      items,
      definition,
      writer,
      panelElement,
      t,
    }),
  };

  const header = (
    <BatchPanelHeader
      totalCount={totalCount}
      selectedGroupInfo={groupInfo}
      isRenaming={isRenaming}
      renameInputRef={renameInputRef}
      renameValue={renameValue}
      setRenameValue={setRenameValue}
      renameCancelledRef={renameCancelledRef}
      handleRenameStart={() => {
        if (!groupInfo) return;
        // Escape로 언마운트된 입력은 blur가 오지 않아 취소 플래그가 남는다
        renameCancelledRef.current = false;
        setRenameValue(groupInfo.name);
        setRenamingFor(selectionKey);
        requestAnimationFrame(() => {
          renameInputRef.current?.focus();
          renameInputRef.current?.select();
        });
      }}
      handleRenameCommit={(value) => {
        setRenamingFor(null);
        const trimmed = value.trim();
        if (!groupInfo || trimmed === '') return;
        // 그룹 이름은 트리 그룹 정보 - 지금 이름과 같으면 쓰지 않는다
        const current = documentGroupNames(scene).find(
          (group) => group.id === groupInfo.id,
        );
        if (!current || current.name === trimmed) return;
        void editDocument([
          {
            op: 'setGroup',
            scene: sceneId,
            id: groupInfo.id,
            name: trimmed,
          },
        ]);
      }}
      handleRenameCancel={() => {
        renameCancelledRef.current = true;
        setRenamingFor(null);
      }}
      t={t}
    />
  );

  // 여러 종류를 고른 선택 - 고른 종류들 선언의 합을 탭마다 (옛 일괄 부품 배치, 트리에만 있는 종류가 섞여도)
  if (keyLikeHost) {
    const kinds = elements.map((element) => element.kind);
    const tabs = unionBatchTabs(kinds);
    return (
      <div ref={setPanelElement} className={PANEL_ROOT_CLASS}>
        {/* 섹션이 두 탭 이상에 있으면 탭 */}
        <div className="flex-shrink-0">
          {header}
          {tabs.length > 1 ? (
            <div className="px-[12px] pb-[12px]">
              <Tabs
                activeTab={activeTab}
                onTabChange={setActiveTab}
                t={t as (key: string) => string}
                availableTabs={tabs}
              />
            </div>
          ) : null}
        </div>
        <LegacyKeyLikeBatchBody
          sceneId={sceneId}
          scene={scene}
          elements={elements}
          tabs={tabs}
          activeTab={activeTab}
          sections={unionBatchSections(kinds)}
          items={items}
          renderers={renderers}
          host={keyLikeHost}
          pluginSettings={legacyHost?.pluginSettings}
          panelElement={panelElement}
          useCustomCSS={useCustomCSS}
          t={t}
        />
      </div>
    );
  }

  // 여러 종류 (트리에만 있는 종류끼리) - 고른 종류들 선언의 합, 섹션은 그 섹션을 가진 종류 요소에만
  const union = definition
    ? null
    : unionBatchSections(elements.map((element) => element.kind));
  const ownerIdsOf = (section: PanelSectionDecl<Values>) => {
    const kinds = union?.find((entry) => entry.section === section)?.kinds;
    return elements
      .filter((element) => kinds?.includes(element.kind))
      .map(({ id }) => id);
  };
  const unionRenderers: PanelSectionRenderers = {
    ...renderers,
    custom: (component, section) =>
      renderers.custom(component, section, ownerIdsOf(section)),
    rows: (section) => (
      <KindBatchRows
        sceneId={sceneId}
        elementIds={ownerIdsOf(section)}
        section={section}
        panelElement={panelElement}
        t={t}
      />
    ),
  };

  return (
    <div ref={setPanelElement} className={PANEL_ROOT_CLASS}>
      <div className="flex-shrink-0">{header}</div>
      <div className="flex-1 properties-panel-overlay-scroll">
        <div ref={scrollRef} className="properties-panel-overlay-viewport">
          <EditSessionBoundary>
            <PanelSections
              sections={
                union
                  ? union.map(({ section }) => section)
                  : definition!.panel ?? defaultPanel(definition!)
              }
              items={items}
              batch
              renderers={union ? unionRenderers : renderers}
            />
            {legacyHost?.pluginSettings}
          </EditSessionBoundary>
        </div>
        <OverlayScrollbar />
      </div>
    </div>
  );
};

export default DocumentBatchPanel;
