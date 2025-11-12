import { useEffect } from "react";
import type { JsPlugin } from "@src/types/js";
import { extractPluginId } from "@utils/pluginUtils";
import { usePluginMenuStore } from "@stores/usePluginMenuStore";
import { usePluginDisplayElementStore } from "@stores/usePluginDisplayElementStore";

const SCRIPT_ID_PREFIX = "dmn-custom-js-";

type CleanupAwareWindow = Window & {
  __dmn_custom_js_cleanup?: () => void;
};

export function useCustomJsInjection() {
  useEffect(() => {
    const anyWindow = window as unknown as CleanupAwareWindow;
    const activeElements = new Map<
      string,
      { element: HTMLScriptElement; cleanup?: () => void; pluginId?: string }
    >();
    let enabled = false;
    let disposed = false;
    let currentPlugins: JsPlugin[] = [];

    const safeRun = (fn?: () => void, label?: string) => {
      if (typeof fn !== "function") return;
      try {
        fn();
      } catch (error) {
        const tag = label ? ` (${label})` : "";
        console.error(`Error during custom JS cleanup${tag}`, error);
      }
    };

    const removeAll = () => {
      for (const [
        id,
        { element, cleanup, pluginId },
      ] of activeElements.entries()) {
        // cleanup 함수 실행 시 플러그인 컨텍스트 설정
        if (cleanup && pluginId) {
          const previousPluginId = (window as any).__dmn_current_plugin_id;
          (window as any).__dmn_current_plugin_id = pluginId;
          safeRun(cleanup, id);
          (window as any).__dmn_current_plugin_id = previousPluginId;
        } else {
          safeRun(cleanup, id);
        }

        if (element && element.parentNode) {
          element.remove();
        }
      }
      activeElements.clear();

      // 플러그인 메뉴 클린업 (메인 윈도우에서만)
      if ((window as any).__dmn_window_type === "main") {
        try {
          usePluginMenuStore.getState().clearAll();
          usePluginDisplayElementStore.getState().elements = [];
        } catch (error) {
          console.error("Failed to clear plugin UI elements", error);
        }
      }
    };

    const injectAll = () => {
      removeAll();
      if (!enabled) return;

      currentPlugins
        .filter((plugin) => plugin.enabled && plugin.content)
        .forEach((plugin) => {
          try {
            const previousCleanup = anyWindow.__dmn_custom_js_cleanup;
            if (previousCleanup) {
              delete anyWindow.__dmn_custom_js_cleanup;
            }

            // 플러그인 고유 ID 추출 (@id 메타데이터 또는 파일명 기반)
            const pluginId = extractPluginId(plugin.content, plugin.name);

            // 현재 플러그인 ID를 전역에 설정 (API 호출 시 사용)
            (anyWindow as any).__dmn_current_plugin_id = pluginId;

            // 이전 플러그인의 메뉴 제거 (메인 윈도우에서만)
            if ((window as any).__dmn_window_type === "main") {
              try {
                usePluginMenuStore.getState().clearByPluginId(pluginId);
                usePluginDisplayElementStore
                  .getState()
                  .clearByPluginId(pluginId);
              } catch (error) {
                console.error(
                  `Failed to clear UI elements for plugin '${pluginId}'`,
                  error
                );
              }
            }

            // 원본 스토리지 API 참조
            const originalStorage = window.api.plugin.storage;

            // 플러그인별 자동 네임스페이스 + 레거시 데이터 마이그레이션 지원 스토리지
            const namespacedStorage = {
              get: async <T = any>(key: string) => {
                const prefixedKey = `${pluginId}/${key}`;
                // 1) 우선 현재 네임스페이스(@id 또는 파일명 기반)에서 조회
                const val = await originalStorage.get<T>(prefixedKey as string);
                if (val !== null && val !== undefined) return val as T;

                // 2) 레거시: 이전 UUID 기반 키 마이그레이션
                const legacyUuidKey = `${plugin.id}/${key}`;
                const legacyUuid = await originalStorage.get<T>(legacyUuidKey);
                if (legacyUuid !== null && legacyUuid !== undefined) {
                  try {
                    await originalStorage.set(prefixedKey, legacyUuid);
                    await originalStorage.remove(legacyUuidKey);
                  } catch {
                    // 마이그레이션 실패는 무시
                  }
                  return legacyUuid as T;
                }

                // 3) 레거시: prefix 없는 단순 키 마이그레이션
                const legacy = await originalStorage.get<T>(key);
                if (legacy !== null && legacy !== undefined) {
                  try {
                    await originalStorage.set(prefixedKey, legacy);
                    await originalStorage.remove(key);
                  } catch {
                    // 마이그레이션 실패는 무시 (읽기만 보장)
                  }
                  return legacy as T;
                }
                return null;
              },
              set: (key: string, value: any) =>
                originalStorage.set(`${pluginId}/${key}`, value),
              remove: (key: string) =>
                originalStorage.remove(`${pluginId}/${key}`),
              clear: async () => {
                // 백엔드에서 자동으로 "plugin_data_" 프리픽스를 붙이므로 여기서는 순수 네임스페이스만 전달합니다.
                await originalStorage.clearByPrefix(pluginId);
              },
              keys: async () => {
                const allKeys = await originalStorage.keys();
                const prefix = `${pluginId}/`;
                return allKeys
                  .filter((k) => k.startsWith(prefix))
                  .map((k) => k.substring(prefix.length));
              },
              // 하위 호환성을 위해 원본 메서드도 노출 (관리 화면 등에서 사용)
              hasData: originalStorage.hasData,
              clearByPrefix: originalStorage.clearByPrefix,
            };

            // 플러그인 전용 API가 주입된 window 프록시 생성
            const proxiedApi = {
              ...window.api,
              plugin: {
                ...window.api.plugin,
                storage: namespacedStorage,
              },
            } as typeof window.api;

            const proxyWindow = new Proxy(window, {
              get(target, prop: string | symbol, receiver) {
                if (prop === "api") return proxiedApi;
                return Reflect.get(target as any, prop, receiver);
              },
              set(target, prop: string | symbol, value, receiver) {
                return Reflect.set(target as any, prop, value, receiver);
              },
            });

            // 프록시를 전역에 임시 저장 (주입 스크립트에서 참조)
            (anyWindow as any).__dmn_plugin_window_proxy = proxyWindow;

            // 플러그인 코드를 안전하게 래핑하여 실행 (window를 프록시로 바인딩)
            const element = document.createElement("script");
            element.id = `${SCRIPT_ID_PREFIX}${plugin.id}`;
            element.type = "text/javascript";
            element.textContent = `;(function(window){\ntry {\n${plugin.content}\n} catch (e) {\n  console.error('Failed to run JS plugin: ${plugin.name}', e);\n}\n})(window.__dmn_plugin_window_proxy);`;
            document.head.appendChild(element);

            const pluginCleanup = anyWindow.__dmn_custom_js_cleanup;

            // 임시 전역 정리
            try {
              delete (anyWindow as any).__dmn_plugin_window_proxy;
              delete (anyWindow as any).__dmn_current_plugin_id;
            } catch {
              // noop
            }

            if (previousCleanup) {
              anyWindow.__dmn_custom_js_cleanup = previousCleanup;
            } else {
              delete anyWindow.__dmn_custom_js_cleanup;
            }

            activeElements.set(plugin.id, {
              element,
              cleanup:
                typeof pluginCleanup === "function" ? pluginCleanup : undefined,
              pluginId, // cleanup 시 컨텍스트 복원을 위해 저장
            });
          } catch (error) {
            console.error(`Failed to inject JS plugin '${plugin.name}'`, error);
          }
        });
    };

    const syncPlugins = (next: JsPlugin[]) => {
      currentPlugins = next.map((plugin) => ({ ...plugin }));
      if (enabled) {
        injectAll();
      } else {
        removeAll();
      }
    };

    window.api.js
      .get()
      .then((data) => {
        if (disposed) return;
        syncPlugins(Array.isArray(data.plugins) ? data.plugins : []);
      })
      .catch((error) => {
        console.error("Failed to fetch JS plugins", error);
      });

    window.api.js
      .getUse()
      .then((value) => {
        if (disposed) return;
        enabled = value;
        if (enabled) {
          injectAll();
        } else {
          removeAll();
        }
      })
      .catch((error) => {
        console.error("Failed to fetch JS plugin toggle state", error);
      });

    const unsubUse = window.api.js.onUse(({ enabled: next }) => {
      enabled = next;
      if (enabled) {
        injectAll();
      } else {
        removeAll();
      }
    });

    const unsubState = window.api.js.onState((payload) => {
      syncPlugins(Array.isArray(payload.plugins) ? payload.plugins : []);
    });

    return () => {
      disposed = true;
      try {
        unsubUse();
      } catch (error) {
        console.error("Failed to unsubscribe JS use handler", error);
      }
      try {
        unsubState();
      } catch (error) {
        console.error("Failed to unsubscribe JS state handler", error);
      }
      removeAll();
    };
  }, []);
}
