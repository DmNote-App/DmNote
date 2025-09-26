import { ipcRouter } from "@main/core/ipcRouter";
import { DomainContext } from "@main/domains/context";
import type { SettingsDiff } from "@src/types/settings";

// 설정 도메인: 설정 조회/갱신 및 브로드캐스트 관리
export function registerSettingsDomain(ctx: DomainContext) {
  ipcRouter.handle("settings:get", async () => ctx.settings.getSnapshot());

  ipcRouter.handle("settings:update", async (patch) => {
    const result = ctx.settings.applyPatch(patch);
    return result.full;
  });

  ctx.settings.onChange((diff: SettingsDiff) => {
    // Emit SettingsDiff so renderers receive both changed and full state
    ipcRouter.emit("settings:changed", diff);
  });
}

