import { useEffect } from "react";
import type { JsPlugin } from "@src/types/js";
import type { PluginDefinition } from "@src/types/api";
import { extractPluginId } from "@utils/pluginUtils";
import { usePluginMenuStore } from "@stores/usePluginMenuStore";
import { usePluginDisplayElementStore } from "@stores/usePluginDisplayElementStore";
import {
  handlerRegistry,
  displayElementInstanceRegistry,
} from "@utils/tauriApi";

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
    // Registry 패턴: 플러그인별 클린업 함수 배열 관리
    const cleanupRegistry = new Map<string, (() => void)[]>();
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

    const runPluginCleanups = (pluginId: string) => {
      // Registry에 등록된 클린업 함수들 실행
      const cleanups = cleanupRegistry.get(pluginId) || [];
      cleanups.forEach((cleanup, index) => {
        safeRun(cleanup, `${pluginId}[${index}]`);
      });
      cleanupRegistry.delete(pluginId);

      // 핸들러 레지스트리 정리
      handlerRegistry.clearPlugin(pluginId);
    };

    const removeAll = () => {
      for (const [
        id,
        { element, cleanup, pluginId },
      ] of activeElements.entries()) {
        // cleanup 함수 실행 시 플러그인 컨텍스트 설정
        if (pluginId) {
          const previousPluginId = (window as any).__dmn_current_plugin_id;
          (window as any).__dmn_current_plugin_id = pluginId;

          // 1. Registry 클린업 실행 (새로운 방식)
          runPluginCleanups(pluginId);

          // 2. 레거시 클린업 실행 (하위 호환성)
          if (cleanup) {
            safeRun(cleanup, id);
          }

          (window as any).__dmn_current_plugin_id = previousPluginId;
        } else if (cleanup) {
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
          displayElementInstanceRegistry.clearAll();
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
                displayElementInstanceRegistry.clearByPluginId(pluginId);
              } catch (error) {
                console.error(
                  `Failed to clear UI elements for plugin '${pluginId}'`,
                  error
                );
              }
            }

            // 원본 스토리지 API 참조
            const originalStorage = window.api.plugin.storage;

            // Registry API: 플러그인별 클린업 함수 등록
            const registerCleanup = (cleanup: () => void) => {
              if (typeof cleanup !== "function") {
                console.warn(
                  `[Plugin ${pluginId}] registerCleanup requires a function`
                );
                return;
              }
              if (!cleanupRegistry.has(pluginId)) {
                cleanupRegistry.set(pluginId, []);
              }
              cleanupRegistry.get(pluginId)!.push(cleanup);
            };

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

            const wrapFunctionWithContext = (fn: any) => {
              if (typeof fn !== "function") return fn;
              if (fn.__dmn_plugin_wrapped__) return fn;

              const wrapped = function (...args: any[]) {
                const prev = (window as any).__dmn_current_plugin_id;
                (window as any).__dmn_current_plugin_id = pluginId;
                let result: any;
                let threw = false;
                try {
                  result = fn.apply(this, args);
                } catch (error) {
                  threw = true;
                  throw error;
                } finally {
                  if (threw || !result || typeof result.then !== "function") {
                    (window as any).__dmn_current_plugin_id = prev;
                  }
                }

                if (result && typeof result.then === "function") {
                  return result.finally(() => {
                    (window as any).__dmn_current_plugin_id = prev;
                  });
                }

                return result;
              };

              try {
                Object.defineProperty(wrapped, "name", {
                  value: fn.name,
                  configurable: true,
                });
              } catch {
                // 이름 재정의 실패는 무시
              }

              Object.defineProperty(wrapped, "__dmn_plugin_wrapped__", {
                value: true,
                configurable: false,
              });

              return wrapped;
            };

            const wrapApiValue = (value: any): any => {
              if (typeof value === "function") {
                return wrapFunctionWithContext(value);
              }

              if (value && typeof value === "object") {
                const clone: any = Array.isArray(value) ? [] : {};
                Object.keys(value).forEach((key) => {
                  clone[key] = wrapApiValue(value[key]);
                });
                return clone;
              }

              return value;
            };

            const wrappedApi = wrapApiValue(window.api);

            // 플러그인 전용 API가 주입된 window 프록시 생성
            const proxiedApi = {
              ...wrappedApi,
              window: {
                ...(wrappedApi.window || {}),
                // window.type은 현재 윈도우 타입을 반환
                type: (window as any).__dmn_window_type as "main" | "overlay",
              },
              plugin: {
                ...(wrappedApi.plugin || {}),
                storage: namespacedStorage,
                registerCleanup,
                defineElement: (definition: PluginDefinition) => {
                  const defId = pluginId; // 1 plugin = 1 element for now
                  const internalDef = {
                    ...definition,
                    id: defId,
                    pluginId: pluginId,
                  };

                  usePluginDisplayElementStore
                    .getState()
                    .registerDefinition(internalDef);

                  // 인스턴스 저장/복원 관리
                  const INSTANCES_KEY = "instances";

                  const saveInstances = async () => {
                    const elements = usePluginDisplayElementStore
                      .getState()
                      .elements.filter((el) => el.definitionId === defId);

                    const instances = elements.map((el) => ({
                      position: el.position,
                      settings: el.settings,
                      measuredSize: el.measuredSize,
                    }));

                    await namespacedStorage.set(INSTANCES_KEY, instances);
                  };

                  // Store 구독하여 변경 시 자동 저장 (메인 윈도우에서만)
                  if ((window as any).__dmn_window_type === "main") {
                    const unsubStore = usePluginDisplayElementStore.subscribe(
                      (state, prevState) => {
                        const currentElements = state.elements.filter(
                          (el) => el.definitionId === defId
                        );
                        const prevElements = prevState.elements.filter(
                          (el) => el.definitionId === defId
                        );

                        if (
                          JSON.stringify(currentElements) !==
                          JSON.stringify(prevElements)
                        ) {
                          saveInstances();
                        }
                      }
                    );
                    registerCleanup(unsubStore);
                  }

                  // 초기 설정값 구성
                  const initialSettings: Record<string, any> = {};
                  if (definition.settings) {
                    Object.entries(definition.settings).forEach(
                      ([key, schema]: [string, any]) => {
                        initialSettings[key] = schema.default;
                      }
                    );
                  }

                  // 설정 다이얼로그 열기 함수
                  const openSettings = async () => {
                    const savedSettings =
                      (await namespacedStorage.get("settings")) || {};
                    const currentSettings = {
                      ...initialSettings,
                      ...savedSettings,
                    };
                    // 취소 시 복원을 위한 원본 저장
                    const originalSettings = { ...currentSettings };

                    let htmlContent =
                      '<div class="flex flex-col gap-[19px] w-full text-left">';

                    if (definition.settings) {
                      for (const [key, schema] of Object.entries(
                        definition.settings
                      )) {
                        const value =
                          currentSettings[key] !== undefined
                            ? currentSettings[key]
                            : schema.default;
                        let componentHtml = "";

                        const handleChange = async (newValue: any) => {
                          // 1. 설정값 업데이트 (불변성 유지)
                          currentSettings[key] = newValue;
                          const newSettings = { ...currentSettings };

                          // 2. 스토리지 저장
                          await namespacedStorage.set("settings", newSettings);

                          // 3. 활성화된 모든 인스턴스 업데이트
                          const elements = usePluginDisplayElementStore
                            .getState()
                            .elements.filter((el) => el.definitionId === defId);

                          elements.forEach((el) => {
                            window.api.ui.displayElement.update(el.fullId, {
                              settings: newSettings,
                            });
                          });

                          // 인스턴스 정보도 업데이트 (settings가 포함되어 있으므로)
                          saveInstances();
                        };

                        // 래핑된 핸들러 (플러그인 컨텍스트 유지)
                        const wrappedChange =
                          wrapFunctionWithContext(handleChange);

                        if (schema.type === "boolean") {
                          componentHtml = window.api.ui.components.checkbox({
                            checked: !!value,
                            onChange: wrappedChange,
                          });
                        } else if (
                          schema.type === "string" ||
                          schema.type === "number" ||
                          schema.type === "color"
                        ) {
                          componentHtml = window.api.ui.components.input({
                            type:
                              schema.type === "string"
                                ? "text"
                                : (schema.type as any),
                            value: value,
                            onChange: wrappedChange,
                            min: schema.min,
                            max: schema.max,
                            step: schema.step,
                            placeholder: schema.placeholder,
                            width: schema.type === "color" ? 80 : undefined,
                          });
                        } else if (schema.type === "select") {
                          componentHtml = window.api.ui.components.dropdown({
                            options: schema.options || [],
                            selected: value,
                            onChange: wrappedChange,
                          });
                        }

                        htmlContent += `
                          <div class="flex justify-between w-full items-center">
                            <p class="text-white text-style-2">${schema.label}</p>
                            ${componentHtml}
                          </div>
                        `;
                      }
                    } else {
                      htmlContent +=
                        '<div class="text-gray-400 text-center">설정할 항목이 없습니다.</div>';
                    }

                    htmlContent += "</div>";

                    const confirmed = await window.api.ui.dialog.custom(
                      htmlContent,
                      {
                        showCancel: true,
                        confirmText: "저장",
                        cancelText: "취소",
                      }
                    );

                    // 취소 시 원본 설정으로 복원
                    if (!confirmed) {
                      await namespacedStorage.set("settings", originalSettings);

                      const elements = usePluginDisplayElementStore
                        .getState()
                        .elements.filter((el) => el.definitionId === defId);

                      elements.forEach((el) => {
                        window.api.ui.displayElement.update(el.fullId, {
                          settings: originalSettings,
                        });
                      });

                      saveInstances();
                    }
                  };

                  // 메인 윈도우: 그리드 컨텍스트 메뉴 등록
                  if ((window as any).__dmn_window_type === "main") {
                    const createLabel =
                      definition.contextMenu?.create ||
                      `${definition.name} 생성`;

                    // 그리드 메뉴 아이템 등록
                    const menuId = window.api.ui.contextMenu.addGridMenuItem({
                      id: `create-${defId}`,
                      label: createLabel,
                      onClick: async (context) => {
                        // 최신 설정 로드
                        const savedSettings =
                          (await namespacedStorage.get("settings")) || {};
                        const settings = {
                          ...initialSettings,
                          ...savedSettings,
                        };

                        // 인스턴스 생성
                        window.api.ui.displayElement.add({
                          html: "<!-- plugin-element -->", // 템플릿 사용
                          position: {
                            x: context.position.dx,
                            y: context.position.dy,
                          },
                          draggable: true,
                          definitionId: defId,
                          settings: settings,
                          state: definition.previewState || {},
                          // 설정 다이얼로그 연결
                          onClick: wrapFunctionWithContext(openSettings),
                          // 삭제 메뉴 연결
                          contextMenu: {
                            enableDelete: true,
                            deleteLabel:
                              definition.contextMenu?.delete || "삭제",
                          },
                        } as any);

                        // 저장 (Store 구독에 의해 자동 처리되지만 명시적으로 호출해도 됨)
                      },
                    });

                    // 클린업 시 메뉴 제거
                    registerCleanup(() => {
                      window.api.ui.contextMenu.removeMenuItem(menuId);
                    });
                  }

                  // 기존 인스턴스 복원 (이미 로드된 요소가 있다면 설정/핸들러 연결)
                  // 주의: 이 부분은 앱 초기화 시점에 이미 elements가 store에 있을 때 필요함
                  // 하지만 defineElement가 호출되는 시점은 플러그인 로드 시점이므로,
                  // store에 있는 요소들을 찾아서 definitionId가 일치하면 업데이트해줘야 함.
                  setTimeout(async () => {
                    // 플러그인 컨텍스트 복원
                    const prevPluginId = (window as any)
                      .__dmn_current_plugin_id;
                    (window as any).__dmn_current_plugin_id = pluginId;

                    try {
                      // 1. 저장된 인스턴스 정보 로드 및 복원 (메인 윈도우에서만)
                      if ((window as any).__dmn_window_type === "main") {
                        const savedInstances = (await namespacedStorage.get(
                          INSTANCES_KEY
                        )) as any[];

                        if (savedInstances && Array.isArray(savedInstances)) {
                          const savedSettings =
                            (await namespacedStorage.get("settings")) || {};
                          const settings = {
                            ...initialSettings,
                            ...savedSettings,
                          };

                          savedInstances.forEach((inst) => {
                            window.api.ui.displayElement.add({
                              html: "<!-- plugin-element -->", // 빈 문자열 대신 주석 사용
                              position: inst.position,
                              draggable: true,
                              definitionId: defId,
                              settings: settings, // 전역 설정 사용
                              state: definition.previewState || {},
                              measuredSize: inst.measuredSize,
                              onClick: wrapFunctionWithContext(openSettings),
                              contextMenu: {
                                enableDelete: true,
                                deleteLabel:
                                  definition.contextMenu?.delete || "삭제",
                              },
                            } as any);
                          });
                        }
                      }
                    } catch (err) {
                      console.error(
                        `[Plugin ${pluginId}] Failed to restore instances:`,
                        err
                      );
                    } finally {
                      (window as any).__dmn_current_plugin_id = prevPluginId;
                    }
                  }, 0);
                },
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
            // 비동기 함수에서도 플러그인 컨텍스트를 자동으로 유지
            const wrappedContent = `
            ;(function(window){
              // 플러그인 ID를 클로저에 저장
              const __PLUGIN_ID__ = "${pluginId}";
              
              // 비동기 함수 자동 래핑 헬퍼 (개선됨)
              const __autoWrapAsync__ = () => {
                const globalWindow = typeof window !== 'undefined' ? window : globalThis;
                const snapshot = Object.getOwnPropertyNames(globalWindow);
                
                snapshot.forEach(key => {
                  try {
                    const value = globalWindow[key];
                    
                    // 함수가 아니거나 이미 래핑되었으면 건너뛰기
                    if (typeof value !== 'function') return;
                    if (value.__dmn_wrapped__ || value.__dmn_plugin_wrapped__) return;
                    
                    // 특정 내장 함수 패턴 제외
                    if (key.startsWith('__dmn') || key === 'eval' || key === 'Function') return;
                    
                    // 비동기 함수 또는 Promise 반환 함수 감지
                    const isAsync = value.constructor.name === 'AsyncFunction';
                    
                    // 비동기 함수만 래핑 (일반 함수는 window.api 래핑으로 충분)
                    if (isAsync) {
                      const wrapped = async function(...args) {
                        const prev = globalWindow.__dmn_current_plugin_id;
                        globalWindow.__dmn_current_plugin_id = __PLUGIN_ID__;
                        try {
                          return await value.apply(this, args);
                        } finally {
                          globalWindow.__dmn_current_plugin_id = prev;
                        }
                      };
                      wrapped.__dmn_wrapped__ = true;
                      try {
                        Object.defineProperty(wrapped, 'name', { value: key, configurable: true });
                      } catch {}
                      globalWindow[key] = wrapped;
                    }
                  } catch (e) {
                    // 접근할 수 없는 속성은 무시
                  }
                });
              };
              
              try {
            ${plugin.content}
              } catch (e) {
                console.error('Failed to run JS plugin: ${plugin.name}', e);
              }
              
              // 플러그인 코드 실행 직후 즉시 래핑 (동기적으로)
              __autoWrapAsync__();
            })(window.__dmn_plugin_window_proxy);
            `;

            const element = document.createElement("script");
            element.id = `${SCRIPT_ID_PREFIX}${plugin.id}`;
            element.type = "text/javascript";
            element.textContent = wrappedContent;
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
