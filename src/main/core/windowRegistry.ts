import { BrowserWindow } from "electron";

export type WindowIdentifier = "main" | "overlay" | string;

// 열린 BrowserWindow를 ID로 관리하고 브로드캐스트를 단순화
class WindowRegistry {
  private windows = new Map<WindowIdentifier, BrowserWindow>();

  register(id: WindowIdentifier, window: BrowserWindow) {
    this.windows.set(id, window);
    window.on("closed", () => {
      this.windows.delete(id);
    });
  }

  get(id: WindowIdentifier): BrowserWindow | undefined {
    const win = this.windows.get(id);
    if (!win) return undefined;
    if (win.isDestroyed()) {
      this.windows.delete(id);
      return undefined;
    }
    return win;
  }

  send(id: WindowIdentifier, channel: string, payload?: unknown) {
    const win = this.get(id);
    if (!win) return;
    win.webContents.send(channel, payload);
  }

  broadcast(channel: string, payload?: unknown) {
    for (const [id, win] of this.windows.entries()) {
      if (win.isDestroyed()) {
        this.windows.delete(id);
        continue;
      }
      try {
        win.webContents.send(channel, payload);
      } catch (err) {
        console.error(`Failed to send '${channel}' to window '${id}':`, err);
      }
    }
  }

  values(): BrowserWindow[] {
    return [...this.windows.values()].filter((win) => !win.isDestroyed());
  }
}

export const windowRegistry = new WindowRegistry();
