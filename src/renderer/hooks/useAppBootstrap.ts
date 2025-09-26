import { useEffect } from "react";
import { useKeyStore } from "@stores/useKeyStore";
import {
  useSettingsStore,
  type SettingsStateSnapshot,
} from "@stores/useSettingsStore";
import type { SettingsDiff } from "@src/types/settings";
import type { OverlayResizeAnchor } from "@src/types/settings";

export function useAppBootstrap() {
  useEffect(() => {
    let disposed = false;

    const { setAll, merge } = useSettingsStore.getState();

    const applyDiff = (diff: SettingsDiff) => {
      if (diff.changed.noteSettings) {
        useSettingsStore.setState((state) => ({
          noteSettings: {
            ...state.noteSettings,
            ...diff.changed.noteSettings!,
          },
        }));
      }
      if (diff.changed.customCSS) {
        useSettingsStore.setState({
          customCSSContent: diff.changed.customCSS.content,
          customCSSPath: diff.changed.customCSS.path ?? null,
        });
      }
      const { noteSettings, customCSS, ...rest } = diff.changed;
      if (Object.keys(rest).length > 0) {
        merge(rest as Partial<SettingsStateSnapshot>);
      }
    };

    (async () => {
      const bootstrap = await window.api.app.bootstrap();
      if (disposed) return;
      setAll({
        hardwareAcceleration: bootstrap.settings.hardwareAcceleration,
        alwaysOnTop: bootstrap.settings.alwaysOnTop,
        overlayLocked: bootstrap.settings.overlayLocked,
        angleMode: bootstrap.settings.angleMode,
        noteEffect: bootstrap.settings.noteEffect,
        noteSettings: bootstrap.settings.noteSettings,
        useCustomCSS: bootstrap.settings.useCustomCSS,
        customCSSContent: bootstrap.settings.customCSS.content,
        customCSSPath: bootstrap.settings.customCSS.path,
        backgroundColor: bootstrap.settings.backgroundColor,
        language: bootstrap.settings.language,
        laboratoryEnabled: bootstrap.settings.laboratoryEnabled,
        overlayResizeAnchor: bootstrap.settings.overlayResizeAnchor,
      });
      useKeyStore.setState({
        keyMappings: bootstrap.keys,
        positions: bootstrap.positions,
        customTabs: bootstrap.customTabs,
        selectedKeyType: bootstrap.selectedKeyType,
      });
    })();

    const unsubscribers = [
      window.api.settings.onChanged((diff: SettingsDiff) => {
        if (disposed || !diff) return;
        applyDiff(diff);
      }),
      window.api.keys.onChanged((keys) => {
        useKeyStore.setState({ keyMappings: keys });
      }),
      window.api.keys.onPositionsChanged((positions) => {
        useKeyStore.setState({ positions });
      }),
      window.api.keys.onModeChanged(({ mode }) => {
        useKeyStore.setState({ selectedKeyType: mode });
      }),
      window.api.keys.customTabs.onChanged(
        ({ customTabs, selectedKeyType }) => {
          useKeyStore.setState({ customTabs, selectedKeyType });
        }
      ),
      window.api.overlay.onLock(({ locked }) => {
        useSettingsStore.setState({ overlayLocked: locked });
      }),
      window.api.overlay.onAnchor(({ anchor }) => {
        useSettingsStore.setState({
          overlayResizeAnchor: anchor as OverlayResizeAnchor,
        });
      }),
      window.api.css.onUse(({ enabled }) => {
        useSettingsStore.setState({ useCustomCSS: enabled });
      }),
      window.api.css.onContent((css) => {
        useSettingsStore.setState({
          customCSSContent: css.content,
          customCSSPath: css.path,
        });
      }),
    ];

    return () => {
      disposed = true;
      unsubscribers.forEach((unsubscribe) => {
        try {
          unsubscribe();
        } catch (error) {
          console.error("Failed to unsubscribe", error);
        }
      });
    };
  }, []);
}
