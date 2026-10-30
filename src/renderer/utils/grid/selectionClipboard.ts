import type {
  ClipboardItem,
  SelectedElement,
} from '@stores/grid/useGridSelectionStore';
import type { PluginDisplayElementInternal } from '@src/types/plugin/api';

/** 옛 선택(플러그인 요소)의 클립보드 항목 - 트리 요소는 트리 클립보드가 맡는다 */
export const createSelectionClipboardItems = (
  selectedElements: readonly SelectedElement[],
  pluginElements: readonly PluginDisplayElementInternal[],
): ClipboardItem[] =>
  selectedElements.flatMap((selected) => {
    if (selected.type !== 'plugin') return [];
    const element = pluginElements.find(
      (candidate) => candidate.fullId === selected.id,
    );
    if (!element) return [];
    const { fullId: _fullId, ...data } = element;
    return [{ type: 'plugin' as const, element: data }];
  });
