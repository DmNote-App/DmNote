// 노브 축 감지 세션 - 시작한 노브들(여럿이면 고른 노브 모두)에 묶는다. 고른 노브가 바뀌거나(패널 편집 영역을
// 새로 그린다) 탭이 바뀌어도 감지는 이어져 시작한 노브들에 쓰고, 노브 축 칸이 하나도 안 보이게 되면(다른 종류를
// 고르거나 패널을 닫으면) 끝난다 - 옛 노브 패널과 같다
import { reportElementOpError } from '@src/renderer/editor/runtime/intent/elementIntent';
import {
  patchKnobAxisIdById,
  patchKnobAxisIdByIds,
} from '@src/renderer/editor/runtime/operations/elementOps';
import { axisEventBus } from '@utils/input/axisEventBus';

// 축이 몇 번 들어오면 그 축으로 묶는지 / 감지를 기다리는 시간
const CAPTURE_COUNT = 3;
const CAPTURE_TIMEOUT_MS = 6000;

let session: { target: string; stop: () => void } | null = null;
let mountedControls = 0;
const listeners = new Set<() => void>();

const emit = () => {
  for (const listener of [...listeners]) listener();
};

/** 노브 묶음의 감지 열쇠 - 같은 노브들이면 같다 */
export const knobAxisCaptureKey = (ids: readonly string[]) =>
  [...ids].sort().join(',');

/** 감지 중인 노브 묶음의 열쇠 (없으면 null) */
export const knobAxisCaptureTarget = (): string | null =>
  session?.target ?? null;

export const subscribeKnobAxisCapture = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const stopKnobAxisCapture = () => {
  if (!session) return;
  session.stop();
  session = null;
  emit();
};

/** 이 노브들로 감지를 시작한다 - 다른 노브의 감지가 남아 있으면 이 노브들로 옮긴다 */
export const startKnobAxisCapture = (targetIds: readonly string[]) => {
  const ids = [...targetIds];
  session?.stop();
  axisEventBus.initialize();
  const counts = new Map<string, number>();
  let bound = false;
  // 회전 감지 바인딩: 노브를 돌리면 가장 많이 움직인 축을 자동 바인딩
  const unsubscribe = axisEventBus.subscribe(({ axisId }) => {
    if (bound) return;
    const count = (counts.get(axisId) ?? 0) + 1;
    counts.set(axisId, count);
    if (count < CAPTURE_COUNT) return;
    bound = true;
    // 여럿이면 고른 노브 모두에 같은 축을 커밋 하나로
    void (
      ids.length === 1
        ? patchKnobAxisIdById(ids[0], axisId)
        : patchKnobAxisIdByIds(ids, axisId)
    ).catch(reportElementOpError);
    stopKnobAxisCapture();
  });
  const timer = window.setTimeout(stopKnobAxisCapture, CAPTURE_TIMEOUT_MS);
  session = {
    target: knobAxisCaptureKey(ids),
    stop: () => {
      unsubscribe();
      window.clearTimeout(timer);
    },
  };
  emit();
};

/** 노브 축 칸이 보이는 동안 감지를 살려 둔다 - 고른 노브가 바뀌어 칸을 새로 그려도 끊지 않는다 */
export const retainKnobAxisCapture = () => {
  mountedControls += 1;
  return () => {
    mountedControls -= 1;
    // 같은 커밋에서 다른 노브의 칸이 다시 그려지면 이어 간다
    queueMicrotask(() => {
      if (mountedControls === 0) stopKnobAxisCapture();
    });
  };
};
