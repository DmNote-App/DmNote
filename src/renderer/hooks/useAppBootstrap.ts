import { useEffect } from "react";
import { useKeyStore } from "@stores/useKeyStore";
import {
  useSettingsStore,
  type SettingsStateSnapshot,
} from "@stores/useSettingsStore";
import type { SettingsDiff } from "@src/types/settings";
import type { OverlayResizeAnchor } from "@src/types/settings";

// 앱 초기 구동 시 메인 스냅샷을 가져오고,
// 이후 변경 이벤트를 구독해 Zustand 스토어를 최신 상태로 유지
export function useAppBootstrap() {
  useEffect(() => {
    let disposed = false;

    const { setAll, merge } = useSettingsStore.getState();

    const finalizeBootstrap = () =>
      useKeyStore.setState((state) =>
        state.isBootstrapped ? state : { ...state, isBootstrapped: true }
      );

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
      const sanitized = Object.fromEntries(
        Object.entries(rest).filter(([, value]) => value !== undefined && value !== null)
      ) as Partial<SettingsStateSnapshot>;
      if (Object.keys(sanitized).length > 0) {
        merge(sanitized);
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
      useKeyStore.setState((state) => ({
        ...state,
        keyMappings: bootstrap.keys,
        positions: bootstrap.positions,
        customTabs: bootstrap.customTabs,
        selectedKeyType: bootstrap.selectedKeyType,
      }));
      finalizeBootstrap();
    })();

    const unsubscribers = [
      window.api.settings.onChanged((diff: SettingsDiff) => {
        if (disposed || !diff) return;
        applyDiff(diff);
      }),
      window.api.keys.onChanged((keys) => {
        useKeyStore.setState((state) => ({ ...state, keyMappings: keys }));
      }),
      window.api.keys.onPositionsChanged((positions) => {
        useKeyStore.setState((state) => ({ ...state, positions }));
      }),
      window.api.keys.onModeChanged(({ mode }) => {
        useKeyStore.setState((state) => ({ ...state, selectedKeyType: mode }));
      }),
      window.api.keys.customTabs.onChanged(
        ({ customTabs, selectedKeyType }) => {
          useKeyStore.setState((state) => ({
            ...state,
            customTabs,
            selectedKeyType,
          }));
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
