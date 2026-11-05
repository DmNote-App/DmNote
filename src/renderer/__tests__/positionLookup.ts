// 옛 위치 목록 모양 fixture(종류별 → 탭별 배열)에서 id로 틀 찾기 - 손잡이·윤곽이 받는 찾기 함수 자리
type PositionLists = Record<
  string,
  Record<string, readonly { id: string }[] | undefined> | undefined
>;

export const positionLookupOf =
  (lists: PositionLists, sceneId = '4key') =>
  (id: string) =>
    Object.values(lists)
      .flatMap((byScene) => byScene?.[sceneId] ?? [])
      .find((position) => position.id === id) as never;
