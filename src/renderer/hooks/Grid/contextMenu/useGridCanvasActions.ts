/**
 * 캔버스 요소 추가 액션 훅 (복제는 트리 - document/documentDuplicate)
 * 키 외 종류별 생성 규칙은 itemCanvasRules
 */

import { insertLegacyShapedElement } from '@components/main/Grid/document/documentEditActions';
import { createDefaultKeyPosition } from '@src/renderer/editor/model/keys';
import { reportElementOpError } from '@src/renderer/editor/runtime/intent/elementIntent';
import {
  type CanonicalPositionOf,
  type EditorElementTypeV1,
  type ItemElementType,
} from '@src/types/editor';
import type { KeyPosition } from '@src/types/key/keys';
import { ITEM_CANVAS_RULES } from './itemCanvasRules';

// 규칙 표를 종류 무관하게 호출하기 위한 느슨한 뷰
type ItemCanvasRulesOf = {
  create: (dx: number, dy: number) => never;
};

export interface CanvasActions {
  addKeyAtPosition: (dx: number, dy: number) => void;
  // 키 외 종류 액션 - 종류별 생성 규칙은 ITEM_CANVAS_RULES
  addItemAtPosition: (type: ItemElementType, dx: number, dy: number) => void;
}

export interface DuplicateState {
  elementType: EditorElementTypeV1;
  // 복제할 요소 - 놓을 때 트리에서 다시 읽는다
  sourceId: string;
  keyName: string;
  // 고스트가 그릴 모양
  position: KeyPosition | CanonicalPositionOf<ItemElementType>;
}

export type NativeCanvasElementType = EditorElementTypeV1;

export const addCanvasElementAt = (
  actions: Pick<CanvasActions, 'addKeyAtPosition' | 'addItemAtPosition'>,
  type: NativeCanvasElementType,
  dx: number,
  dy: number,
) => {
  if (type === 'key') {
    actions.addKeyAtPosition(dx, dy);
  } else {
    actions.addItemAtPosition(type, dx, dy);
  }
};

// 새 요소는 트리에 넣는다 - 생성 기본값(옛 위치 모양)은 같은 커밋에 트리 칸으로 싣는다
export function useGridCanvasActions(selectedKeyType: string): CanvasActions {
  const addKeyAtPosition = (dx: number, dy: number) => {
    void insertLegacyShapedElement(
      selectedKeyType,
      'key',
      createDefaultKeyPosition(dx, dy) as unknown as Record<string, unknown>,
      '',
    ).catch(reportElementOpError);
  };

  const addItemAtPosition = (type: ItemElementType, dx: number, dy: number) => {
    const rules = ITEM_CANVAS_RULES[type] as ItemCanvasRulesOf;
    void insertLegacyShapedElement(
      selectedKeyType,
      type,
      rules.create(dx, dy) as unknown as Record<string, unknown>,
    ).catch(reportElementOpError);
  };

  return {
    addKeyAtPosition,
    addItemAtPosition,
  };
}
