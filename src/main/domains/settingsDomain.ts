import { ipcRouter } from "@main/core/ipcRouter";
import { DomainContext } from "@main/domains/context";
import type { SettingsDiff } from "@src/types/settings";

// 설정 도메인: 설정 조회/갱신과 변경 브로드캐스트를 담당
export function registerSettingsDomain(ctx: DomainContext) {
  ipcRouter.handle("settings:get", async () => ctx.settings.getSnapshot());

  ipcRouter.handle("settings:update", async (patch) => {
    const result = ctx.settings.applyPatch(patch);
    return result.full;
  });

  ctx.settings.onChange((diff: SettingsDiff) => {
    // 렌더러에서는 전체 상태를 구독하므로 full 상태를 브로드캐스트
    ipcRouter.emit("settings:changed", diff.full);
  });
}
