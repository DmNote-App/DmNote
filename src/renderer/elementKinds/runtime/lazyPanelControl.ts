import { lazy, type ComponentType } from 'react';

import type { PanelSectionDecl } from '../defineElementKind';

interface Preloadable {
  preload: () => Promise<unknown>;
}

/** 편집 화면 전용 패널 입력·섹션 - 오버레이 번들에 넣지 않게 나중에 읽는다. 미리 불러 두면(preload) 처음 그릴 때
 * 기다리지 않는다 (불러 둔 모듈은 바로 넘겨 빈 칸으로 한 번 그려지지 않는다) */
export const lazyPanelControl = <Props extends object>(
  load: () => Promise<{ default: ComponentType<Props> }>,
) => {
  type PartModule = { default: ComponentType<Props> };
  let loaded: PartModule | null = null;
  let pending: Promise<PartModule> | null = null;
  const preload = () =>
    (pending ??= load().then((module) => {
      loaded = module;
      return module;
    }));
  const Part = lazy(() =>
    loaded
      ? // 불러 둔 모듈 - then이 바로 부르면 React가 기다리지 않고 그린다
        ({
          then: (resolve: (module: PartModule) => void) => resolve(loaded!),
        } as unknown as Promise<PartModule>)
      : preload(),
  );
  return Object.assign(Part, { preload });
};

const preloadPart = (component: unknown) =>
  (component as Partial<Preloadable>).preload?.();

/** 종류 패널 선언의 지연 로딩 입력·섹션을 미리 불러 둔다 (편집 창) - 다 불러오면 끝나는 약속 */
export const preloadPanelControls = (
  definitions: readonly {
    readonly panel?: readonly PanelSectionDecl<never>[];
  }[],
): Promise<unknown> => {
  const loads: unknown[] = [];
  for (const definition of definitions) {
    for (const section of definition.panel ?? []) {
      if ('custom' in section) loads.push(preloadPart(section.custom));
      if (!('rows' in section)) continue;
      for (const row of section.rows) {
        if (row.control.type === 'custom') {
          loads.push(preloadPart(row.control.component));
        }
      }
    }
  }
  return Promise.all(loads);
};
