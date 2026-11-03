// 플러그인을 내리는 중(정리 함수 실행 중) - 끄기·다시 불러오기·주입 실패.
// 정리가 요소를 비워도(clearMyElements 등) 그 플러그인의 런타임 → 트리 쓰기를 멈춰 저장된 인스턴스를 지우지 않는다
const tearingDown = new Set<string>();

export const runPluginTeardown = <T>(
  pluginId: string,
  teardown: () => T,
): T => {
  tearingDown.add(pluginId);
  try {
    return teardown();
  } finally {
    tearingDown.delete(pluginId);
  }
};

export const isPluginTearingDown = (pluginId: string): boolean =>
  tearingDown.has(pluginId);
