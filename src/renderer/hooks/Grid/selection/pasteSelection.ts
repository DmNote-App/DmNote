import { reportElementOpSkipped } from '@src/renderer/editor/runtime/intent/elementIntent';
import { getElementDocumentStore } from '@src/renderer/editor/document/elementDocumentRuntime';
import type { PluginDisplayElementInternal } from '@src/types/plugin/api';
import { reissueDisplayElementHandlers } from '@plugins/runtime/displayElement/displayElementApi';
import {
  flushPluginInstancesEditSession,
  rotatePluginInstancesEditSession,
} from '@plugins/runtime/displayElement/instancesCommitQueue';
import {
  useGridSelectionStore,
  type SelectedElement,
} from '@stores/grid/useGridSelectionStore';
import { usePluginDisplayElementStore } from '@stores/plugin/usePluginDisplayElementStore';
import { documentGroupNames } from '@src/renderer/components/main/Grid/document/documentGroups';
import { recordPastedKeyIds } from '@stores/grid/pastedKeyIds';
import { PASTE_OFFSET } from '../constants';

interface PasteSelectionOptions {
  selectedKeyType: string;
  setSelectedElements: (elements: SelectedElement[]) => void;
}

// 클립보드의 플러그인 요소 붙여넣기 - 새 인스턴스(id·핸들러 재발급)를 조금 비켜 지금 탭에 넣는다.
// 겹침값은 원본 그대로라 원본 바로 위에 놓이고, 그룹은 지금 장면에 그 그룹이 있을 때만 지킨다.
// 같은 동작 id로 플러그인 기록 한 단계 (트리 요소는 트리 클립보드가 붙인다)
export const pasteSelection = async ({
  selectedKeyType,
  setSelectedElements,
}: PasteSelectionOptions) => {
  const clipboard = useGridSelectionStore.getState().clipboard;
  if (clipboard.length === 0) return;
  // 지난 붙여넣기 기록을 비운다 - 이번 것이 상한에 걸리면 함께 붙이는 트리 붙여넣기가 옛 동작 id를 쓰지 않게
  recordPastedKeyIds(new Map());
  const { definitions, elements } = usePluginDisplayElementStore.getState();

  // 정의별 상한 - 넘으면 전체 중단 (부분 붙여넣기 없음)
  const pastedByDefinition = new Map<string, number>();
  for (const { element } of clipboard) {
    if (!element.definitionId) continue;
    pastedByDefinition.set(
      element.definitionId,
      (pastedByDefinition.get(element.definitionId) ?? 0) + 1,
    );
  }
  for (const [definitionId, pastedCount] of pastedByDefinition) {
    const definition = definitions.get(definitionId);
    const maxInstances = definition?.maxInstances;
    if (!definition || !maxInstances || maxInstances <= 0) continue;
    const currentCount = elements.filter(
      (element) =>
        element.definitionId === definitionId &&
        element.tabId === selectedKeyType,
    ).length;
    if (currentCount + pastedCount > maxInstances) {
      console.warn(
        `[Plugin ${definition.pluginId}] Max instances (${maxInstances}) reached for ${definitionId} in tab ${selectedKeyType}`,
      );
      reportElementOpSkipped('paste max instances');
      return;
    }
  }

  const sceneGroups = new Set(
    documentGroupNames(
      getElementDocumentStore()?.getScene(selectedKeyType),
    ).map(({ id }) => id),
  );
  const pasted: PluginDisplayElementInternal[] = clipboard.map(
    ({ element }) => {
      const id = crypto.randomUUID();
      return {
        ...reissueDisplayElementHandlers(element),
        id,
        fullId: `${element.pluginId}::${id}`,
        tabId: selectedKeyType,
        groupId:
          element.groupId && sceneGroups.has(element.groupId)
            ? element.groupId
            : undefined,
        position: {
          x: (element.position?.x || 0) + PASTE_OFFSET,
          y: (element.position?.y || 0) + PASTE_OFFSET,
        },
      };
    },
  );

  const gestureId = crypto.randomUUID();
  // 함께 붙이는 트리 붙여넣기가 같은 동작 id로 - 되돌리기 한 번
  recordPastedKeyIds(new Map(), gestureId);
  const pluginIds = [...new Set(pasted.map(({ pluginId }) => pluginId))];
  pluginIds.forEach((pluginId) =>
    rotatePluginInstancesEditSession(pluginId, gestureId),
  );
  usePluginDisplayElementStore.getState().setElements([...elements, ...pasted]);
  // 붙여넣기는 한 번에 끝나는 편집 - 기다리지 않고 바로 저장
  pluginIds.forEach((pluginId) => flushPluginInstancesEditSession(pluginId));
  setSelectedElements(
    pasted.map(({ fullId }) => ({ type: 'plugin' as const, id: fullId })),
  );
};
