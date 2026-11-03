import type { SelectedElement } from '@stores/grid/useGridSelectionStore';
import type { KnobItemPosition } from '@src/types/key/knobs';
import type { EditorElementTypeV1 } from '@src/types/editor';
import type { BatchElementPropertyUpdate } from '../types';
import {
  patchFontFamilyByTargets,
  patchFontStyleByTargets,
  patchKnobPropertiesByIds,
  patchNotePropertiesByIds,
  patchUseInlineStylesByTargets,
} from '@src/renderer/editor/runtime/operations/elementOps';
import { isNativeElementId } from '@src/renderer/editor/model/elementId';
import { reportElementOpSkipped } from '@src/renderer/editor/runtime/intent/elementIntent';
import {
  getFontFamilyPatch,
  getFontStylePatch,
  getKnobRuntimePropertyPatch,
  getNotePropertyPatch,
  getUseInlineStylesPatch,
} from '../selection/propertyPanelAdapters';

interface UsePropertiesPanelBatchCommitHandlersOptions {
  selectedBatchStyleElements: SelectedElement[];
  selectedKeyElements: SelectedElement[];
  selectedKnobElements: SelectedElement[];
}

export const usePropertiesPanelBatchCommitHandlers = ({
  selectedBatchStyleElements,
  selectedKeyElements,
  selectedKnobElements,
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

  const handleKnobBatchSharedSetting = (updates: Partial<KnobItemPosition>) => {
    const runtimePatch = getKnobRuntimePropertyPatch(updates);
    const stableKnobIds = selectedKnobElements.map((element) => element.id);
    if (
      runtimePatch &&
      stableKnobIds.length > 0 &&
      stableKnobIds.every((id) => id.length > 0 && isNativeElementId(id))
    ) {
      const commit = patchKnobPropertiesByIds(stableKnobIds, runtimePatch);
      void commit.catch((error) => {
        console.error('Failed to batch update knob property', error);
      });
      return;
    }
    reportElementOpSkipped(
      'batch knob property (unsupported payload or invalid target)',
    );
  };

  return {
    handleBatchElementPropertyCommit,
    handleBatchNoteElementPropertyCommit,
    handleKnobBatchSharedSetting,
  };
};
