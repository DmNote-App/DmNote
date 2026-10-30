// 우클릭 복제 - 고스트로 자리를 고른 뒤 그 자리에 트리 요소 사본을 넣는다 (옛 복제 배치와 같은 흐름)
import { getElementDocumentStore } from '@src/renderer/editor/document/elementDocumentRuntime';
import { treeKeySlot } from '@src/renderer/editor/runtime/operations/keySlotOps';
import { legacyPositionOf } from '@src/renderer/elementKinds/runtime/legacyPosition';
import { isEditorElementType } from '@src/types/editor';
import type { DuplicateState } from '@hooks/Grid/contextMenu/useGridCanvasActions';
import { slotDisplayName } from '@utils/keySlot';
import { buildDocumentPaste, pastedSpriteNodes } from './documentClipboard';
import { editDocument } from './documentEditActions';

/** 복제 시작 - 고스트가 그릴 모양은 지금 트리 값 */
export const beginDocumentDuplicate = (
  sceneId: string,
  id: string,
): DuplicateState | null => {
  const element = getElementDocumentStore()?.getElement(sceneId, id);
  if (!element || !isEditorElementType(element.kind)) return null;
  return {
    elementType: element.kind,
    sourceId: id,
    keyName: slotDisplayName(treeKeySlot(element) ?? ''),
    position: legacyPositionOf(element) as never,
  };
};

/** 고른 자리(왼쪽 위)에 사본을 장면 맨 위로 넣는다 - 새 id, 스프라이트 자세 id도 새로 */
export const placeDocumentDuplicate = (
  sceneId: string,
  duplicate: DuplicateState,
  x: number,
  y: number,
) => {
  const element = getElementDocumentStore()?.getElement(
    sceneId,
    duplicate.sourceId,
  );
  if (!element) return Promise.resolve(null);
  const idMap = new Map([[element.id, crypto.randomUUID()]]);
  const { ops } = buildDocumentPaste(
    sceneId,
    pastedSpriteNodes([element], idMap, null),
    undefined,
    [],
    idMap,
  );
  return editDocument(
    ops.map((op) =>
      op.op === 'insert' && op.node.type === 'element'
        ? { ...op, node: { ...op.node, frame: { ...op.node.frame, x, y } } }
        : op,
    ),
  );
};
