import { reportElementOpError } from '@src/renderer/editor/runtime/intent/elementIntent';
import {
  removeDocumentElements,
  runStructureAction,
  type StructureAction,
} from '../document/documentEditActions';

const layerActionByMenuItem: Readonly<Record<string, StructureAction>> = {
  bringToFront: 'front',
  bringForward: 'forward',
  sendBackward: 'backward',
  sendToBack: 'back',
};

interface ExecuteNativeContextMenuActionOptions {
  menuItemId: string;
  mode: string;
  elementId: string | null;
  onDuplicate: (elementId: string) => void;
}

/** 요소 하나의 우클릭 메뉴 - 지우기·겹침 순서는 트리 연산, 복제는 자리 고르기 시작 */
export const executeNativeContextMenuAction = ({
  menuItemId,
  mode,
  elementId,
  onDuplicate,
}: ExecuteNativeContextMenuActionOptions): boolean => {
  if (menuItemId === 'delete') {
    if (elementId) {
      void removeDocumentElements(mode, [elementId]).catch(
        reportElementOpError,
      );
    }
    return true;
  }

  if (menuItemId === 'duplicate') {
    if (elementId) onDuplicate(elementId);
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
