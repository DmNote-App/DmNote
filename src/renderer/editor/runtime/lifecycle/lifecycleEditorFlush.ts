import { editGestureController } from '../gesture/editGestureController';
import { settleFocusedEditor } from './focusedEditorSettlement';
import { flushHeldEditorWrites } from './editorWriteBarrier';

// 편집 경계에서 포커스된 입력을 지금 대상에 확정한다.
//
// 정산 순서는 settleFocusedEditor가 소유하고, 여기서는 표준 gesture 커밋만 묶는다.
// 호출부가 각자 조립하면 커밋 대상이 갈릴 때 순서가 어긋난다. 보류한 트리 편집도 이때 다시 보낸다
export const flushFocusedEditor = async (): Promise<boolean> =>
  (await settleFocusedEditor(() =>
    editGestureController.commitPendingAsync(),
  )) && flushHeldEditorWrites();
