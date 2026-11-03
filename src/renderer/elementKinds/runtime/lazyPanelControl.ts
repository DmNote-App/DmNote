import { lazy, type ComponentType } from 'react';

import type {
  PanelFieldControlProps,
  PanelSectionDecl,
} from '../defineElementKind';

type ControlModule = { default: ComponentType<PanelFieldControlProps> };

interface Preloadable {
  preload: () => Promise<ControlModule>;
}

/** 편집 화면 전용 패널 입력 - 오버레이 번들에 넣지 않게 나중에 읽는다. 미리 불러 두면(preload) 처음 그릴 때
 * 기다리지 않는다 (불러 둔 모듈은 바로 넘겨 빈 칸으로 한 번 그려지지 않는다) */
export const lazyPanelControl = (load: () => Promise<ControlModule>) => {
  let loaded: ControlModule | null = null;
  let pending: Promise<ControlModule> | null = null;
  const preload = () =>
    (pending ??= load().then((module) => {
      loaded = module;
      return module;
    }));
  const Control = lazy(() =>
    loaded
      ? // 불러 둔 모듈 - then이 바로 부르면 React가 기다리지 않고 그린다
        ({
          then: (resolve: (module: ControlModule) => void) => resolve(loaded!),
        } as unknown as Promise<ControlModule>)
      : preload(),
  );
  return Object.assign(Control, { preload });
};

/** 종류 패널 선언의 지연 로딩 입력을 미리 불러 둔다 (편집 창) */
export const preloadPanelControls = (
  definitions: readonly {
    readonly panel?: readonly PanelSectionDecl<never>[];
  }[],
) => {
  for (const definition of definitions) {
    for (const section of definition.panel ?? []) {
      if (!('rows' in section)) continue;
      for (const row of section.rows) {
        if (row.control.type !== 'custom') continue;
        void (row.control.component as Partial<Preloadable>).preload?.();
      }
    }
  }
};
