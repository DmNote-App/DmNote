import { usePluginMenuStore } from "@stores/usePluginMenuStore";
import { usePluginDisplayElementStore } from "@stores/usePluginDisplayElementStore";
import { extractPluginId } from "@utils/pluginUtils";
import {
  handlerRegistry,
  displayElementInstanceRegistry,
} from "@api/pluginDisplayElements";
import type { PluginDefinition } from "@src/types/api";
import type { JsPlugin } from "@src/types/js";

const SCRIPT_ID_PREFIX = "dmn-custom-js-";

type CleanupAwareWindow = Window & {
  __dmn_custom_js_cleanup?: () => void;
};

export interface CustomJsRuntime {
  initialize: () => void;
  dispose: () => void;
}

export function createCustomJsRuntime(): CustomJsRuntime {
  const anyWindow = window as unknown as CleanupAwareWindow;
  const activeElements = new Map<
    string,
    { element: HTMLScriptElement; cleanup?: () => void; pluginId?: string }
  >();
  const cleanupRegistry = new Map<string, (() => void)[]>();
  const unsubscribers: Array<() => void> = [];

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
    const cleanups = cleanupRegistry.get(pluginId) || [];
    cleanups.forEach((cleanup, index) => {
      safeRun(cleanup, `${pluginId}[${index}]`);
    });
    cleanupRegistry.delete(pluginId);

    handlerRegistry.clearPlugin(pluginId);
  };

  const removeAll = () => {
    for (const [
      id,
      { element, cleanup, pluginId },
    ] of activeElements.entries()) {
      if (pluginId) {
        const previousPluginId = (window as any).__dmn_current_plugin_id;
        (window as any).__dmn_current_plugin_id = pluginId;

        runPluginCleanups(pluginId);

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

    if ((window as any).__dmn_window_type === "main") {
      try {
        usePluginMenuStore.getState().clearAll();
        usePluginDisplayElementStore.getState().elements = [];
        displayElementInstanceRegistry.clearAll();

        if (window.api?.bridge) {
          window.api.bridge.sendTo("overlay", "plugin:displayElements:sync", {
            elements: [],
          });
        }
      } catch (error) {
        console.error("Failed to clear plugin UI elements", error);
      }
    }
  };

  const registerCleanup = (pluginId: string, cleanup: () => void) => {
    if (typeof cleanup !== "function") {
      console.warn(`[Plugin ${pluginId}] registerCleanup requires a function`);
      return;
    }
    if (!cleanupRegistry.has(pluginId)) {
      cleanupRegistry.set(pluginId, []);
    }
    cleanupRegistry.get(pluginId)!.push(cleanup);
  };

  const injectPlugin = (plugin: JsPlugin) => {
    try {
      const previousCleanup = anyWindow.__dmn_custom_js_cleanup;
      if (previousCleanup) {
        delete anyWindow.__dmn_custom_js_cleanup;
      }

      const pluginId = extractPluginId(plugin.content, plugin.name);

      (anyWindow as any).__dmn_current_plugin_id = pluginId;

      if ((window as any).__dmn_window_type === "main") {
        try {
          usePluginMenuStore.getState().clearByPluginId(pluginId);
          usePluginDisplayElementStore.getState().clearByPluginId(pluginId);
          displayElementInstanceRegistry.clearByPluginId(pluginId);

          if (window.api?.bridge) {
            window.api.bridge.sendTo("overlay", "plugin:displayElements:sync", {
              elements: usePluginDisplayElementStore.getState().elements,
            });
          }
        } catch (error) {
          console.error(
            `Failed to clear UI elements for plugin '${pluginId}'`,
            error
          );
        }
      }

      const originalStorage = window.api.plugin.storage;

      const namespacedStorage = {
        get: async <T = any>(key: string) => {
          const prefixedKey = `${pluginId}/${key}`;
          return await originalStorage.get<T>(prefixedKey as string);
        },
        set: (key: string, value: any) =>
          originalStorage.set(`${pluginId}/${key}`, value),
        remove: (key: string) => originalStorage.remove(`${pluginId}/${key}`),
        clear: async () => {
          await originalStorage.clearByPrefix(pluginId);
        },
        keys: async () => {
          const allKeys = await originalStorage.keys();
          const prefix = `${pluginId}/`;
          return allKeys
            .filter((k) => k.startsWith(prefix))
            .map((k) => k.substring(prefix.length));
        },
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
          // noop
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

      const proxiedApi = {
        ...wrappedApi,
        window: {
          ...(wrappedApi.window || {}),
          type: (window as any).__dmn_window_type as "main" | "overlay",
        },
        plugin: {
          ...(wrappedApi.plugin || {}),
          storage: namespacedStorage,
          registerCleanup: (cleanup: () => void) =>
            registerCleanup(pluginId, cleanup),
          defineElement: (definition: PluginDefinition) => {
            const defId = pluginId;
            const internalDef = {
              ...definition,
              id: defId,
              pluginId: pluginId,
            };

            usePluginDisplayElementStore
              .getState()
              .registerDefinition(internalDef);

            const INSTANCES_KEY = "instances";

            const saveInstances = async () => {
              const elements = usePluginDisplayElementStore
                .getState()
                .elements.filter((el) => el.definitionId === defId);

              const instances = elements.map((el) => ({
                position: el.position,
                settings: el.settings,
                measuredSize: el.measuredSize,
                tabId: el.tabId,
              }));

              await namespacedStorage.set(INSTANCES_KEY, instances);
            };

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
              registerCleanup(pluginId, unsubStore);
            }

            const defaultSettings: Record<string, any> = {};
            if (definition.settings) {
              Object.entries(definition.settings).forEach(
                ([key, schema]: [string, any]) => {
                  defaultSettings[key] = schema.default;
                }
              );
            }

            const buildActionsProxy = (elementId: string) =>
              new Proxy(
                {},
                {
                  get: (_target, prop: string | symbol) => {
                    if (typeof prop !== "string") return undefined;
                    return (...args: any[]) => {
                      try {
                        window.api?.bridge?.sendTo(
                          "overlay",
                          "plugin:displayElement:invokeAction",
                          {
                            elementId,
                            action: prop,
                            args,
                          }
                        );
                      } catch (error) {
                        console.error(
                          `[Plugin ${pluginId}] Failed to invoke exposed action '${String(
                            prop
                          )}'`,
                          error
                        );
                      }
                    };
                  },
                }
              );

            const buildCustomContextMenuItems = () =>
              (definition.contextMenu?.items || []).map((item, index) => ({
                id: item.action || `custom-${index}`,
                label: item.label,
                position: item.position,
                visible: item.visible,
                disabled: item.disabled,
                onClick: (ctx: any) => {
                  const actions =
                    ctx?.actions ||
                    buildActionsProxy(ctx?.element?.fullId || "");

                  if (typeof item.onClick === "function") {
                    return item.onClick({ ...ctx, actions });
                  }

                  if (
                    item.action &&
                    typeof (actions as any)[item.action] === "function"
                  ) {
                    return (actions as any)[item.action]();
                  }
                },
              }));

            const openInstanceSettings = async (instanceId: string) => {
              const element = usePluginDisplayElementStore
                .getState()
                .elements.find((el) => el.fullId === instanceId);

              if (!element) {
                console.warn(
                  `[Plugin ${pluginId}] Cannot find element ${instanceId} for settings`
                );
                return;
              }

              const currentSettings = {
                ...defaultSettings,
                ...(element.settings || {}),
              };
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
                    currentSettings[key] = newValue;
                    const newSettings = { ...currentSettings };

                    window.api.ui.displayElement.update(instanceId, {
                      settings: newSettings,
                    });
                  };

                  const wrappedChange = wrapFunctionWithContext(handleChange);

                  if (schema.type === "boolean") {
                    componentHtml = window.api.ui.components.checkbox({
                      checked: !!value,
                      onChange: wrappedChange,
                    });
                  } else if (schema.type === "color") {
                    const handleColorClick = (e: any) => {
                      const target = (e.target as HTMLElement).closest(
                        "button"
                      );
                      if (!target) return;

                      const pickerId = `plugin-${pluginId}-${instanceId}-${key}`;

                      if (
                        (window as any).__dmn_showColorPicker &&
                        (window as any).__dmn_getColorPickerState
                      ) {
                        const state = (
                          window as any
                        ).__dmn_getColorPickerState();
                        if (state?.isOpen && state.id === pickerId) {
                          (window as any).__dmn_showColorPicker({
                            initialColor: state.color,
                            id: pickerId,
                          });
                          return;
                        }
                      }

                      target.classList.remove("border-[#3A3943]");
                      target.classList.add("border-[#459BF8]");

                      window.api.ui.pickColor({
                        initialColor: currentSettings[key],
                        id: pickerId,
                        referenceElement: target as HTMLElement,
                        onColorChange: (newColor) => {
                          const preview = target.querySelector("div");
                          if (preview) preview.style.backgroundColor = newColor;
                        },
                        onColorChangeComplete: (newColor) => {
                          wrappedChange(newColor);
                        },
                        onClose: () => {
                          target.classList.remove("border-[#459BF8]");
                          target.classList.add("border-[#3A3943]");
                        },
                      });
                    };

                    const handlerId = handlerRegistry.register(
                      pluginId,
                      handleColorClick
                    );

                    componentHtml = `
                            <button type="button" 
                              class="relative w-[80px] h-[23px] bg-[#2A2A30] rounded-[7px] border-[1px] border-[#3A3943] flex items-center justify-center text-[#DBDEE8] text-style-2"
                              data-plugin-handler="${handlerId}"
                            >
                              <div class="absolute left-[6px] top-[4.5px] w-[11px] h-[11px] rounded-[2px] border border-[#3A3943]" style="background-color: ${value}"></div>
                              <span class="ml-[16px] text-left truncate w-[50px]">Linear</span>
                            </button>
                          `;
                  } else if (
                    schema.type === "string" ||
                    schema.type === "number"
                  ) {
                    let inputWidth = 200;
                    const strVal = String(value);

                    if (schema.type === "number") {
                      inputWidth = 60;
                    } else {
                      if (strVal.length <= 4) inputWidth = 60;
                      else if (strVal.length <= 10) inputWidth = 100;
                      else inputWidth = 200;
                    }

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
                      width: inputWidth,
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

              const confirmed = await window.api.ui.dialog.custom(htmlContent, {
                showCancel: true,
                confirmText: "저장",
                cancelText: "취소",
              });

              if (!confirmed) {
                window.api.ui.displayElement.update(instanceId, {
                  settings: originalSettings,
                });
              }
            };

            const handleElementClick = (e: Event) => {
              const target = e.currentTarget as HTMLElement;
              const instanceId = target.getAttribute("data-plugin-element");
              if (instanceId) {
                openInstanceSettings(instanceId);
              }
            };

            if ((window as any).__dmn_window_type === "main") {
              const createLabel =
                definition.contextMenu?.create || `${definition.name} 생성`;

              const menuId = window.api.ui.contextMenu.addGridMenuItem({
                id: `create-${defId}`,
                label: createLabel,
                onClick: async (context) => {
                  window.api.ui.displayElement.add({
                    html: "<!-- plugin-element -->",
                    position: {
                      x: context.position.dx,
                      y: context.position.dy,
                    },
                    draggable: true,
                    definitionId: defId,
                    settings: { ...defaultSettings },
                    state: definition.previewState || {},
                    onClick: handleElementClick,
                    contextMenu: {
                      enableDelete: true,
                      deleteLabel: definition.contextMenu?.delete || "삭제",
                      customItems: buildCustomContextMenuItems(),
                    },
                  } as any);
                },
              });

              registerCleanup(pluginId, () => {
                window.api.ui.contextMenu.removeMenuItem(menuId);
              });
            }

            setTimeout(async () => {
              const prevPluginId = (window as any).__dmn_current_plugin_id;
              (window as any).__dmn_current_plugin_id = pluginId;

              try {
                if ((window as any).__dmn_window_type === "main") {
                  const savedInstances = (await namespacedStorage.get(
                    INSTANCES_KEY
                  )) as any[];

                  if (savedInstances && Array.isArray(savedInstances)) {
                    savedInstances.forEach((inst) => {
                      window.api.ui.displayElement.add({
                        html: "<!-- plugin-element -->",
                        position: inst.position,
                        draggable: true,
                        definitionId: defId,
                        settings: inst.settings || { ...defaultSettings },
                        state: definition.previewState || {},
                        measuredSize: inst.measuredSize,
                        tabId: inst.tabId,
                        onClick: handleElementClick,
                        contextMenu: {
                          enableDelete: true,
                          deleteLabel: definition.contextMenu?.delete || "삭제",
                          customItems: buildCustomContextMenuItems(),
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

      (anyWindow as any).__dmn_plugin_window_proxy = proxyWindow;

      const wrappedContent = `
            ;(function(window){
              const __PLUGIN_ID__ = "${pluginId}";
              
              const __autoWrapAsync__ = () => {
                const globalWindow = typeof window !== 'undefined' ? window : globalThis;
                const snapshot = Object.getOwnPropertyNames(globalWindow);
                
                snapshot.forEach(key => {
                  try {
                    const value = globalWindow[key];
                    
                    if (typeof value !== 'function') return;
                    if (value.__dmn_wrapped__ || value.__dmn_plugin_wrapped__) return;
                    
                    if (key.startsWith('__dmn') || key === 'eval' || key === 'Function') return;
                    
                    const isAsync = value.constructor.name === 'AsyncFunction';
                    
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
                  }
                });
              };
              
              try {
            ${plugin.content}
              } catch (e) {
                console.error('Failed to run JS plugin: ${plugin.name}', e);
              }
              
              __autoWrapAsync__();
            })(window.__dmn_plugin_window_proxy);
            `;

      const element = document.createElement("script");
      element.id = `${SCRIPT_ID_PREFIX}${plugin.id}`;
      element.type = "text/javascript";
      element.textContent = wrappedContent;
      document.head.appendChild(element);

      const pluginCleanup = anyWindow.__dmn_custom_js_cleanup;

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
        pluginId,
      });
    } catch (error) {
      console.error(`Failed to inject JS plugin '${plugin.name}'`, error);
    }
  };

  const injectAll = () => {
    removeAll();
    if (!enabled) return;

    currentPlugins
      .filter((plugin) => plugin.enabled && plugin.content)
      .forEach((plugin) => injectPlugin(plugin));
  };

  const syncPlugins = (next: JsPlugin[]) => {
    currentPlugins = next.map((plugin) => ({ ...plugin }));
    if (enabled) {
      injectAll();
    } else {
      removeAll();
    }
  };

  const fetchInitialState = () => {
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
  };

  const setupListeners = () => {
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

    unsubscribers.push(unsubUse, unsubState);
  };

  const cleanupSubscriptions = () => {
    while (unsubscribers.length) {
      const unsubscribe = unsubscribers.pop();
      if (unsubscribe) {
        safeRun(() => unsubscribe());
      }
    }
  };

  const initialize = () => {
    fetchInitialState();
    setupListeners();
  };

  const dispose = () => {
    disposed = true;
    cleanupSubscriptions();
    removeAll();
  };

  return { initialize, dispose };
}
