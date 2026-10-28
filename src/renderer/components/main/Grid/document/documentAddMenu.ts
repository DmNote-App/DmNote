import { BUILTIN_ELEMENT_KINDS } from '@src/renderer/elementKinds/builtinKinds';
import { isEditorElementType } from '@src/types/editor';

const ADD_PREFIX = 'addDocument:';

// 캔버스 우클릭 추가 메뉴 - 트리 문서에만 있는 종류 (정의 순서)
export const DOCUMENT_ADD_MENU_ITEMS = BUILTIN_ELEMENT_KINDS.flatMap(
  (definition) =>
    !isEditorElementType(definition.kind) && 'addLabel' in definition
      ? [
          {
            id: `${ADD_PREFIX}${definition.kind}`,
            label: definition.addLabel as string,
          },
        ]
      : [],
);

export const documentKindForAddMenuItem = (id: string): string | null =>
  id.startsWith(ADD_PREFIX) ? id.slice(ADD_PREFIX.length) : null;
