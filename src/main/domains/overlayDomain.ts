import { ipcRouter } from "@main/core/ipcRouter";
import { windowRegistry } from "@main/core/windowRegistry";
import { DomainContext } from "@main/domains/context";
import { overlayResizeAnchorSchema } from "@main/store/schema";

interface OverlayTogglePayload {
  visible: boolean;
}

interface OverlayLockPayload {
  locked: boolean;
}

interface OverlayResizePayload {
  width: number;
  height: number;
  anchor?: string;
  contentTopOffset?: number;
}

const MIN_SIZE = 100;
const MAX_SIZE = 2000;

// 오버레이 보이기/잠금/앵커/리사이즈 관련 IPC 라우팅
export function registerOverlayDomain(ctx: DomainContext) {
  ipcRouter.handle("overlay:get", async () => {
    const state = ctx.store.getState();
    const overlayWindow = ctx.getOverlayWindow();
    return {
      visible: overlayWindow ? overlayWindow.isVisible() : false,
      locked: state.overlayLocked,
      anchor: state.overlayResizeAnchor,
    };
  });

  ipcRouter.handle<OverlayTogglePayload, { visible: boolean }>(
    "overlay:set-visible",
    async ({ visible }) => {
      if (visible) {
        ctx.overlayController.showInactive();
      } else {
        ctx.overlayController.hide();
      }
      windowRegistry.broadcast("overlay:visibility", { visible });
      return { visible };
    }
  );

  ipcRouter.handle<OverlayLockPayload, { locked: boolean }>(
    "overlay:set-lock",
    async ({ locked }) => {
      ctx.store.update("overlayLocked", locked);
      ctx.overlayController.updateOverlayLock(locked);
      windowRegistry.broadcast("overlay:lock", { locked });
      return { locked };
    }
  );

  ipcRouter.handle<{ anchor: string }, { anchor: string }>(
    "overlay:set-anchor",
    async ({ anchor }) => {
      const parsed = overlayResizeAnchorSchema.safeParse(anchor);
      const value = parsed.success ? parsed.data : ctx.store.getState().overlayResizeAnchor;
      ctx.store.update("overlayResizeAnchor", value);
      windowRegistry.broadcast("overlay:anchor", { anchor: value });
      return { anchor: value };
    }
  );

  ipcRouter.handle<OverlayResizePayload, { bounds?: { x: number; y: number; width: number; height: number }; error?: string }>(
    "overlay:resize",
    async (payload) => {
      const overlayWindow = ctx.overlayController.instance;
      if (!overlayWindow || overlayWindow.isDestroyed()) {
        return { error: "overlay-not-ready" };
      }

      const targetWidth = clamp(Math.round(payload.width), MIN_SIZE, MAX_SIZE);
      const targetHeight = clamp(Math.round(payload.height), MIN_SIZE, MAX_SIZE);
      const anchor = payload.anchor ?? ctx.store.getState().overlayResizeAnchor;
      const parsedAnchor = overlayResizeAnchorSchema.safeParse(anchor).success
        ? anchor
        : ctx.store.getState().overlayResizeAnchor;

      const bounds = overlayWindow.getBounds();
      const oldX = bounds.x;
      const oldY = bounds.y;
      const oldWidth = bounds.width;
      const oldHeight = bounds.height;

      let newX = oldX;
      let newY = oldY;

      switch (parsedAnchor) {
        case "bottom-left":
          newY = oldY + oldHeight - targetHeight;
          break;
        case "top-right":
          newX = oldX + oldWidth - targetWidth;
          break;
        case "bottom-right":
          newX = oldX + oldWidth - targetWidth;
          newY = oldY + oldHeight - targetHeight;
          break;
        case "center":
          newX = oldX + Math.round((oldWidth - targetWidth) / 2);
          newY = oldY + Math.round((oldHeight - targetHeight) / 2);
          break;
        case "top-left":
        default:
          break;
      }

      const incomingTopOffset = Number(payload.contentTopOffset);
      const prevTopOffset = Number(ctx.store.getState().overlayLastContentTopOffset ?? Number.NaN);
      if (Number.isFinite(incomingTopOffset) && Number.isFinite(prevTopOffset)) {
        const delta = incomingTopOffset - prevTopOffset;
        newY = Math.round(newY - delta);
      }

      const nextBounds = {
        x: Math.round(newX),
        y: Math.round(newY),
        width: targetWidth,
        height: targetHeight,
      };

      ctx.overlayController.setBounds(nextBounds);

      if (Number.isFinite(incomingTopOffset)) {
        ctx.store.update("overlayLastContentTopOffset", incomingTopOffset);
      }

      windowRegistry.broadcast("overlay:resized", nextBounds);
      return { bounds: nextBounds };
    }
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
