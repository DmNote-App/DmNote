// 앱이 종류 코드에 넣어 주는 입력 - 포인터 묶음(커서 트래커)
// 창 안 구독이 하나라도 있을 때만 백엔드에 구독을 건다
import { invoke } from '@tauri-apps/api/core';
import { subscribe } from '@api/modules/shared';

import type { PointerSampleInput } from '../cursorTracker/cursorTrackerMotion';

export interface PointerInputSource {
  subscribe(listener: (sample: PointerSampleInput) => void): () => void;
}

export interface PointerMonitor {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  primary: boolean;
}

const listeners = new Set<(sample: PointerSampleInput) => void>();
let stop: (() => void) | null = null;

const start = () => {
  void invoke('pointer_input_subscribe').catch((error) =>
    console.error('[Pointer] subscribe failed', error),
  );
  const unsubscribe = subscribe<PointerSampleInput>(
    'input:pointer',
    (sample) => {
      for (const listener of [...listeners]) listener(sample);
    },
  );
  stop = () => {
    unsubscribe();
    void invoke('pointer_input_unsubscribe').catch((error) =>
      console.error('[Pointer] unsubscribe failed', error),
    );
  };
};

export const pointerInputSource: PointerInputSource = {
  subscribe(listener) {
    listeners.add(listener);
    if (listeners.size === 1) start();
    return () => {
      if (!listeners.delete(listener) || listeners.size > 0) return;
      stop?.();
      stop = null;
    };
  },
};

let monitors: Promise<PointerMonitor[]> | null = null;

/** 커서 좌표와 같은 공간의 모니터 목록 - 다시 읽으려면 refresh */
export const loadPointerMonitors = (refresh = false) => {
  if (refresh || !monitors) {
    monitors = invoke<PointerMonitor[]>('pointer_monitors_list').catch(
      (error) => {
        console.error('[Pointer] monitor list failed', error);
        monitors = null;
        return [];
      },
    );
  }
  return monitors;
};
