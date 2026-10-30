import { isEditorElementType } from '@src/types/editor';

type ElementKindsModule = typeof import('@src/types/elementKinds');

// 키를 옛 종류 대표로 쓰는 옛 선택·끌기·레이어 테스트 - 키만 옛 편집 경로에 남긴 종류 목록.
// 옛 경로를 걷어낼 때(4단계) 이 테스트들과 함께 걷어낸다
//   vi.mock('@src/types/elementKinds', async (importOriginal) =>
//     (await import('@src/renderer/__tests__/legacyKeyKinds')).keepKeyLegacy(importOriginal));
export const keepKeyLegacy = async (
  importOriginal: () => Promise<ElementKindsModule>,
): Promise<ElementKindsModule> => {
  const actual = await importOriginal();
  const kinds: ReadonlySet<string> = new Set(
    [...actual.TREE_EDITED_KINDS].filter((kind) => kind !== 'key'),
  );
  return {
    ...actual,
    TREE_EDITED_KINDS: kinds,
    isTreeEditedKind: (kind) => !isEditorElementType(kind) || kinds.has(kind),
    isLegacyEditedType: (type) => !kinds.has(type),
  };
};
