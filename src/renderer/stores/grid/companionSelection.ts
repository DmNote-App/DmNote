// 함께 고른 다른 선택(트리 요소)의 id - 옛 종류 선택 끌기가 같이 움직이는 요소로 다룬다
// (맞춤 대상에서 빼고 묶음 경계에 넣는다). 편집 화면이 트리 선택을 읽는 함수를 건다
let readCompanionIds: () => readonly string[] = () => [];

export const setCompanionSelectionReader = (
  reader: () => readonly string[],
) => {
  readCompanionIds = reader;
  return () => {
    if (readCompanionIds === reader) readCompanionIds = () => [];
  };
};

export const companionSelectionIds = () => readCompanionIds();
