import type { SelectedElement } from '@stores/grid/useGridSelectionStore';
import type { EditorElementTypeV1 } from '@src/types/editor';
import type { BatchElementPropertyUpdate } from '../types';
import {
  patchFontFamilyByTargets,
  patchFontStyleByTargets,
  patchNotePropertiesByIds,
  patchUseInlineStylesByTargets,
} from '@src/renderer/editor/runtime/operations/elementOps';
import { isNativeElementId } from '@src/renderer/editor/model/elementId';
import {
  getFontFamilyPatch,
  getFontStylePatch,
  getNotePropertyPatch,
  getUseInlineStylesPatch,
} from '../selection/propertyPanelAdapters';

interface UsePropertiesPanelBatchCommitHandlersOptions {
  selectedBatchStyleElements: SelectedElement[];
  selectedKeyElements: SelectedElement[];
}

export const usePropertiesPanelBatchCommitHandlers = ({
  selectedBatchStyleElements,
  selectedKeyElements,
}: UsePropertiesPanelBatchCommitHandlersOptions) => {
  const handleBatchElementPropertyCommit = (
    patch: BatchElementPropertyUpdate,
    options?: { gestureId?: string },
  ) => {
    const fontStylePatch = getFontStylePatch(patch);
    const fontFamilyPatch = getFontFamilyPatch(patch);
    const useInlineStyles = getUseInlineStylesPatch(patch);
    if (!fontStylePatch && !fontFamilyPatch && useInlineStyles === null) return;
    const targets = selectedBatchStyleElements.map((element) => ({
      elementType: element.type as EditorElementTypeV1,
      id: element.id,
    }));
    if (
      targets.length === 0 ||
      targets.some((target) => !isNativeElementId(target.id))
    )
      return;
    const gestureId = options?.gestureId;
    const commit =
      fontStylePatch !== null
        ? gestureId
          ? patchFontStyleByTargets(targets, fontStylePatch, { gestureId })
          : patchFontStyleByTargets(targets, fontStylePatch)
        : fontFamilyPatch !== null
        ? gestureId
          ? patchFontFamilyByTargets(targets, fontFamilyPatch, { gestureId })
          : patchFontFamilyByTargets(targets, fontFamilyPatch)
        : patchUseInlineStylesByTargets(targets, useInlineStyles!);
    void commit.catch((error) => {
      console.error('Failed to batch update element style property', error);
    });
  };

  const handleBatchNoteElementPropertyCommit = (
    patch: BatchElementPropertyUpdate,
  ) => {
    const notePatch = getNotePropertyPatch(patch);
    if (!notePatch) return;
    const ids = selectedKeyElements.map((element) => element.id);
    if (ids.length === 0 || ids.some((id) => !isNativeElementId(id))) return;
    const commit = patchNotePropertiesByIds(ids, notePatch);
    void commit.catch((error) => {
      console.error('Failed to batch update note property', error);
    });
  };

  return {
    handleBatchElementPropertyCommit,
    handleBatchNoteElementPropertyCommit,
  };
};
