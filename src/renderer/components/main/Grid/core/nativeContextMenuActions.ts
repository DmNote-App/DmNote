import { deleteElementById } from '@src/renderer/editor/runtime/operations/elementOps';
import { reportElementOpError } from '@src/renderer/editor/runtime/intent/elementIntent';
import {
  runStructureAction,
  type StructureAction,
} from '../document/documentEditActions';
import type { NativeElementType } from '@src/renderer/editor/model/elementIdMap';

const layerActionByMenuItem: Readonly<Record<string, StructureAction>> = {
  bringToFront: 'front',
  bringForward: 'forward',
  sendBackward: 'backward',
  sendToBack: 'back',
};

interface ExecuteNativeContextMenuActionOptions {
  menuItemId: string;
  type: NativeElementType;
  mode: string;
  elementId: string | null;
  resolvedIndex: number | null;
  onDuplicate: (resolvedIndex: number) => void;
}

export const executeNativeContextMenuAction = ({
  menuItemId,
  type,
  mode,
  elementId,
  resolvedIndex,
  onDuplicate,
}: ExecuteNativeContextMenuActionOptions): boolean => {
  if (menuItemId === 'delete') {
    if (elementId) {
      void deleteElementById(type, elementId).catch(reportElementOpError);
    }
    return true;
  }

  if (menuItemId === 'duplicate') {
    if (resolvedIndex !== null) onDuplicate(resolvedIndex);
    return true;
  }

  const action = layerActionByMenuItem[menuItemId];
  if (!action) return false;
  if (elementId) {
    void runStructureAction(mode, [elementId], action).catch(
      reportElementOpError,
    );
  }
  return true;
};
