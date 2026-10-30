import { getElementDocumentStore } from '@src/renderer/editor/document/elementDocumentRuntime';
import type { Op } from '@src/types/generated/elementDocument';
import { elementKindDefinition } from './elementKindRegistry';

/** 크기가 바뀌는 setFrame에 그 종류가 함께 맞추는 값(예: 스프라이트 자세 이동값 비례)을 붙인다.
 * 편집 화면의 트리 쓰기 입구 두 곳(editDocument·공통 커밋 경로의 트리 몫)이 부른다 */
export const withResizeValues = (ops: readonly Op[]): Op[] => {
  const store = getElementDocumentStore();
  return ops.flatMap((op): Op[] => {
    if (
      op.op !== 'setFrame' ||
      (op.frame.width == null && op.frame.height == null)
    ) {
      return [op];
    }
    const element = store?.getElement(op.scene, op.id);
    const resizeValues = element
      ? elementKindDefinition(element.kind)?.resizeValues
      : undefined;
    if (!element || !resizeValues) return [op];
    const values = resizeValues(element, {
      x: op.frame.x ?? element.frame.x,
      y: op.frame.y ?? element.frame.y,
      width: op.frame.width ?? element.frame.width,
      height: op.frame.height ?? element.frame.height,
    });
    return values
      ? [op, { op: 'setValues', scene: op.scene, id: op.id, values }]
      : [op];
  });
};
