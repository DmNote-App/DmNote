// 노트 캔버스 프레임 생략 판단. 정지 장면(NoteBuffer.isSceneStatic)이 이미 그려져 있고
// 그 뒤로 바뀐 것이 없으면 같은 그림이라 다시 그리지 않는다

export interface NoteFrameGate {
  // 버퍼·유니폼·캔버스가 바뀌어 다음 프레임을 반드시 그려야 함
  markDirty(): void;
  // 이번 프레임을 그릴지 - true를 반환하면 그린 것으로 기록한다
  shouldDraw(sceneStatic: boolean): boolean;
}

export const createNoteFrameGate = (): NoteFrameGate => {
  let needsDraw = true;
  let staticFrameDrawn = false;
  return {
    markDirty() {
      needsDraw = true;
    },
    shouldDraw(sceneStatic) {
      // 정지로 바뀐 첫 프레임은 그려야 직전의 움직이던 그림이 화면에 남지 않는다
      if (!needsDraw && sceneStatic && staticFrameDrawn) return false;
      needsDraw = false;
      staticFrameDrawn = sceneStatic;
      return true;
    },
  };
};
