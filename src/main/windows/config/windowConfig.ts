import type { BrowserWindowConstructorOptions } from "electron";

type WindowConfig = {
  main: BrowserWindowConstructorOptions;
  overlay: BrowserWindowConstructorOptions;
};

const windowConfig: WindowConfig = {
  main: {
    width: 902,
    height: 488,
    autoHideMenuBar: true,
    titleBarStyle: "hidden",
    transparent: false,
    backgroundColor: "#1A191E",
    hasShadow: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    vibrancy: "under-window" as const,
    visualEffectState: "active",
    paintWhenInitiallyHidden: true,
  },
  overlay: {
    width: 860,
    height: 320,
    frame: false,
    transparent: true,
    backgroundColor: "rgba(0,0,0,0)",
    alwaysOnTop: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableBlinkFeatures: "CSSContainment",
      disableBlinkFeatures: "VSync",
      backgroundThrottling: false, // 백그라운드 실행 제한 해제
    },
  },
};

export default windowConfig;
