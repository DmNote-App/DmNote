import { app } from "electron";
import { windowRegistry } from "@main/core/windowRegistry";
import { registerDomains } from "@main/domains/registerDomains";
import { DomainContext } from "@main/domains/context";
import { appStore } from "@main/store/appStore";
import { KeyboardService } from "@main/services/keyboardListener";
import { MainWindow } from "@main/windows/mainWindow";
import { OverlayWindow } from "@main/windows/overlayWindow";
import { SettingsService } from "@main/domains/settings/settingsService";

export class Application {
  private readonly store = appStore;
  private readonly keyboard: KeyboardService;
  private readonly overlayWindow: OverlayWindow;
  private readonly mainWindow: MainWindow;
  private readonly settingsService: SettingsService;
  private isAppQuitting = false;

  constructor() {
    const state = this.store.getState();

    if (state.hardwareAcceleration === false) {
      app.disableHardwareAcceleration();
    }

    if (state.angleMode) {
      app.commandLine.appendSwitch("use-angle", state.angleMode);
    }

    this.keyboard = new KeyboardService(state.keys);

    this.overlayWindow = new OverlayWindow({
      shouldPreventClose: () => !this.isAppQuitting,
      onVisibilityChanged: (visible) => {
        windowRegistry.broadcast("overlay:visibility", { visible });
      },
      getAlwaysOnTop: () => this.store.getState().alwaysOnTop,
      getOverlayLocked: () => this.store.getState().overlayLocked,
    });

    this.settingsService = new SettingsService({
      store: this.store,
      getMainWindow: () => this.mainWindow.instance ?? undefined,
      overlayController: this.overlayWindow,
    });

    this.mainWindow = new MainWindow({
      onClose: () => this.handleMainWindowClose(),
    });
  }

  async init() {
    this.registerDomains();
    this.setupAppEvents();
  }

  private registerDomains() {
    const context: DomainContext = {
      store: this.store,
      keyboard: this.keyboard,
      settings: this.settingsService,
      getMainWindow: () => this.mainWindow.instance ?? undefined,
      getOverlayWindow: () => this.overlayWindow.instance ?? undefined,
      overlayController: this.overlayWindow,
    };
    registerDomains(context);
  }

  private setupAppEvents() {
    app.whenReady().then(() => {
      this.createWindows();
    });

    app.on("before-quit", () => {
      this.isAppQuitting = true;
      this.keyboard.stopListening();
    });

    app.on("window-all-closed", () => {
      this.isAppQuitting = true;
      this.keyboard.stopListening();
      app.quit();
    });
  }

  private createWindows() {
    const main = this.mainWindow.create();
    const overlay = this.overlayWindow.create();

    windowRegistry.register("main", main);
    windowRegistry.register("overlay", overlay);

    this.keyboard.setOverlayWindow(overlay);
    this.keyboard.startListening();

    this.applyInitialKeyMode();
  }

  private applyInitialKeyMode() {
    const state = this.store.getState();
    const desired = state.selectedKeyType;
    const available = Object.keys(state.keys ?? {});
    const fallback = available.includes(desired) ? desired : "4key";
    if (this.keyboard.setKeyMode(fallback)) {
      this.store.update("selectedKeyType", fallback);
    }
  }

  private handleMainWindowClose() {
    this.isAppQuitting = true;
    this.keyboard.stopListening();
    const overlay = this.overlayWindow.instance;
    if (overlay && !overlay.isDestroyed()) {
      overlay.removeAllListeners("close");
      overlay.close();
    }
    app.quit();
  }
}
