import { usePluginDisplayElementStore } from "@stores/usePluginDisplayElementStore";
import { useKeyStore } from "@stores/useKeyStore";
import { DisplayElementInstance } from "@utils/displayElementInstance";
import { html, styleMap, css } from "@utils/templateEngine";
import { clearComponentHandlers } from "@utils/pluginUtils";
import { createPluginTranslator } from "@utils/pluginI18n";
import type {
  DisplayElementTemplate,
  DisplayElementTemplateFactoryValue,
  DisplayElementTemplateHelpers,
  DisplayElementTemplateValueResolver,
  PluginDisplayElement,
  PluginDisplayElementConfig,
  PluginDisplayElementInternal,
  DisplayElementInstance as DisplayElementInstanceType,
} from "@src/types/api";

type HandlerFunction = (...args: any[]) => void | Promise<void>;

class PluginHandlerRegistry {
  private handlers: Map<string, HandlerFunction> = new Map();
  private pluginHandlers: Map<string, Set<string>> = new Map();

  register(pluginId: string, handler: HandlerFunction): string {
    const handlerId = `__dmn_handler_${pluginId}_${Date.now()}_${Math.random()
      .toString(36)
      .substring(7)}`;

    this.handlers.set(handlerId, handler);

    if (!this.pluginHandlers.has(pluginId)) {
      this.pluginHandlers.set(pluginId, new Set());
    }
    this.pluginHandlers.get(pluginId)!.add(handlerId);

    (window as any)[handlerId] = handler;

    return handlerId;
  }

  get(handlerId: string): HandlerFunction | undefined {
    return this.handlers.get(handlerId);
  }

  unregister(handlerId: string): void {
    this.handlers.delete(handlerId);
    delete (window as any)[handlerId];
  }

  clearPlugin(pluginId: string): void {
    const handlerIds = this.pluginHandlers.get(pluginId);
    if (handlerIds) {
      handlerIds.forEach((id) => {
        this.handlers.delete(id);
        delete (window as any)[id];
      });
      this.pluginHandlers.delete(pluginId);
    }

    clearComponentHandlers(pluginId);
  }

  clear(): void {
    this.handlers.forEach((_, id) => {
      delete (window as any)[id];
    });
    this.handlers.clear();
    this.pluginHandlers.clear();
  }
}

export const handlerRegistry = new PluginHandlerRegistry();

type DisplayElementTarget =
  | string
  | DisplayElementInstance
  | DisplayElementInstanceType
  | null
  | undefined;

const displayElementInstances = new Map<string, DisplayElementInstance>();
const displayElementInstancesByPlugin = new Map<string, Set<string>>();

const registerDisplayElementInstance = (instance: DisplayElementInstance) => {
  displayElementInstances.set(instance.id, instance);
  if (!displayElementInstancesByPlugin.has(instance.pluginId)) {
    displayElementInstancesByPlugin.set(instance.pluginId, new Set());
  }
  displayElementInstancesByPlugin.get(instance.pluginId)!.add(instance.id);
};

const unregisterDisplayElementInstance = (fullId: string) => {
  const instance = displayElementInstances.get(fullId);
  if (!instance) return;
  instance.dispose();
  displayElementInstances.delete(fullId);
  const pluginSet = displayElementInstancesByPlugin.get(instance.pluginId);
  if (pluginSet) {
    pluginSet.delete(fullId);
    if (pluginSet.size === 0) {
      displayElementInstancesByPlugin.delete(instance.pluginId);
    }
  }
};

const resolveFullId = (target: DisplayElementTarget): string | null => {
  if (!target) return null;
  if (typeof target === "string") return target;
  if (target instanceof DisplayElementInstance) return target.id;
  if (
    typeof target === "object" &&
    typeof (target as DisplayElementInstanceType).id === "string"
  ) {
    return (target as DisplayElementInstanceType).id;
  }
  if (typeof target === "object" && "toString" in target) {
    return String(target);
  }
  return null;
};

const resolveInstance = (
  target: DisplayElementTarget
): DisplayElementInstance | undefined => {
  if (target instanceof DisplayElementInstance) {
    return target;
  }
  const fullId = resolveFullId(target);
  if (!fullId) return undefined;
  return displayElementInstances.get(fullId);
};

const createNoopDisplayElementInstance = () =>
  new DisplayElementInstance({
    fullId: "",
    pluginId: "",
    updateElement: () => undefined,
    removeElement: () => undefined,
    locale: "ko",
    t: (key) => key,
  });

const clearInstancesByPlugin = (pluginId: string) => {
  const ids = displayElementInstancesByPlugin.get(pluginId);
  if (!ids) return;
  Array.from(ids).forEach((id) => unregisterDisplayElementInstance(id));
};

const clearAllInstances = () => {
  Array.from(displayElementInstances.keys()).forEach((id) =>
    unregisterDisplayElementInstance(id)
  );
  displayElementInstancesByPlugin.clear();
};

type CompiledTemplateChunk =
  | { type: "fn"; fn: DisplayElementTemplateValueResolver }
  | { type: "value"; value: DisplayElementTemplateFactoryValue };

const displayElementTemplateHelpers: DisplayElementTemplateHelpers = {
  html,
  styleMap,
  css,
  locale: "ko",
  t: (key) => key,
};

const buildDisplayElementTemplate = (
  strings: TemplateStringsArray,
  ...values: DisplayElementTemplateFactoryValue[]
): DisplayElementTemplate => {
  const compiledChunks: CompiledTemplateChunk[] = values.map((value) =>
    typeof value === "function"
      ? { type: "fn", fn: value as DisplayElementTemplateValueResolver }
      : { type: "value", value }
  );

  return (state, helpers = displayElementTemplateHelpers) => {
    const resolvedValues = compiledChunks.map((chunk) => {
      if (chunk.type === "fn") {
        try {
          return chunk.fn(state, helpers);
        } catch (error) {
          console.error(
            "[UI API] displayElement.template value resolver failed",
            error
          );
          return "";
        }
      }
      return chunk.value;
    });

    return helpers.html(strings, ...resolvedValues);
  };
};

const removeDisplayElementInternal = (fullId: string) => {
  const store = usePluginDisplayElementStore.getState();
  const element = store.elements.find((el) => el.fullId === fullId);
  if (element) {
    if (element._onClickId) handlerRegistry.unregister(element._onClickId);
    if (element._onPositionChangeId)
      handlerRegistry.unregister(element._onPositionChangeId);
    if (element._onDeleteId) handlerRegistry.unregister(element._onDeleteId);
  }

  store.removeElement(fullId);
  unregisterDisplayElementInstance(fullId);
};

const displayElementApi = {
  html,
  template: buildDisplayElementTemplate,
  add: (element: PluginDisplayElementConfig) => {
    if ((window as any).__dmn_window_type !== "main") {
      console.warn(
        "[UI API] displayElement.add is only available in main window"
      );
      return createNoopDisplayElementInstance();
    }

    const pluginId = (window as any).__dmn_current_plugin_id;
    if (!pluginId) {
      console.warn("[UI API] displayElement.add called outside plugin context");
      return createNoopDisplayElementInstance();
    }

    const id = `element-${Date.now()}-${Math.random()
      .toString(36)
      .substring(7)}`;
    const fullId = `${pluginId}::${id}`;

    const {
      template,
      state: initialState,
      html: initialHtml,
      ...elementOptions
    } = element;

    const currentTabId =
      elementOptions.tabId || useKeyStore.getState().selectedKeyType;

    const templateFn = typeof template === "function" ? template : undefined;
    const stateSnapshot = initialState
      ? { ...initialState }
      : templateFn
      ? {}
      : undefined;

    const htmlContent = typeof initialHtml === "string" ? initialHtml : "";

    if (!htmlContent && !templateFn) {
      console.warn(
        `[UI API] displayElement '${fullId}' has no HTML content. The panel will be empty until setState/setHTML is called.`
      );
    }

    let onClickId: string | undefined;
    let onPositionChangeId: string | undefined;
    let onDeleteId: string | undefined;

    if (typeof elementOptions.onClick === "function") {
      onClickId = handlerRegistry.register(pluginId, elementOptions.onClick);
    }
    if (typeof elementOptions.onPositionChange === "function") {
      onPositionChangeId = handlerRegistry.register(
        pluginId,
        elementOptions.onPositionChange
      );
    }
    if (typeof elementOptions.onDelete === "function") {
      onDeleteId = handlerRegistry.register(pluginId, elementOptions.onDelete);
    }

    const internalElement: PluginDisplayElementInternal = {
      ...elementOptions,
      html: htmlContent,
      id,
      pluginId,
      fullId,
      tabId: currentTabId,
      onClick:
        onClickId ||
        (typeof elementOptions.onClick === "string"
          ? elementOptions.onClick
          : undefined),
      onPositionChange:
        onPositionChangeId ||
        (typeof elementOptions.onPositionChange === "string"
          ? elementOptions.onPositionChange
          : undefined),
      onDelete:
        onDeleteId ||
        (typeof elementOptions.onDelete === "string"
          ? elementOptions.onDelete
          : undefined),
      _onClickId: onClickId,
      _onPositionChangeId: onPositionChangeId,
      _onDeleteId: onDeleteId,
    };

    usePluginDisplayElementStore.getState().addElement(internalElement);

    const currentLocale = (window as any).__dmn_current_locale || "ko";
    const pluginMessages = (window as any).__dmn_plugin_messages?.[pluginId];
    const t = createPluginTranslator(pluginMessages, currentLocale);

    const instance = new DisplayElementInstance({
      fullId,
      pluginId,
      scoped: Boolean(elementOptions.scoped),
      initialState: stateSnapshot,
      template: templateFn,
      updateElement: (targetId, updates) => {
        usePluginDisplayElementStore
          .getState()
          .updateElement(targetId, updates);
      },
      removeElement: (targetId) => {
        removeDisplayElementInternal(targetId);
      },
      locale: currentLocale,
      t,
    });

    registerDisplayElementInstance(instance);

    if (templateFn) {
      instance.setState({});
    }

    return instance;
  },

  get: (fullId: string) => resolveInstance(fullId),

  setState: (target, updates) => {
    const instance = resolveInstance(target);
    if (!instance) return;
    instance.setState(updates || {});
  },

  setData: (target, updates) => {
    const instance = resolveInstance(target);
    if (!instance) return;
    instance.setData(updates || {});
  },

  setText: (target, selector, text) => {
    const instance = resolveInstance(target);
    if (!instance) return;
    instance.setText(selector, text);
  },

  setHTML: (target, selector, htmlContent) => {
    const instance = resolveInstance(target);
    if (!instance) return;
    instance.setHTML(selector, htmlContent);
  },

  setStyle: (target, selector, styles) => {
    const instance = resolveInstance(target);
    if (!instance) return;
    instance.setStyle(selector, styles);
  },

  addClass: (target, selector, ...classNames) => {
    const instance = resolveInstance(target);
    if (!instance) return;
    instance.addClass(selector, ...classNames);
  },

  removeClass: (target, selector, ...classNames) => {
    const instance = resolveInstance(target);
    if (!instance) return;
    instance.removeClass(selector, ...classNames);
  },

  toggleClass: (target, selector, className) => {
    const instance = resolveInstance(target);
    if (!instance || !className) return;
    instance.toggleClass(selector, className);
  },

  query: (target, selector) => {
    const instance = resolveInstance(target);
    if (!instance) return null;
    return instance.query(selector);
  },

  update: (
    target: DisplayElementTarget,
    updates: Partial<PluginDisplayElement>
  ) => {
    if ((window as any).__dmn_window_type !== "main") {
      console.warn(
        "[UI API] displayElement.update is only available in main window"
      );
      return;
    }
    const fullId = resolveFullId(target);
    if (!fullId) return;
    usePluginDisplayElementStore.getState().updateElement(fullId, updates);
  },

  remove: (target: DisplayElementTarget) => {
    if ((window as any).__dmn_window_type !== "main") {
      console.warn(
        "[UI API] displayElement.remove is only available in main window"
      );
      return;
    }
    const fullId = resolveFullId(target);
    if (!fullId) return;
    removeDisplayElementInternal(fullId);
  },

  clearMyElements: () => {
    if ((window as any).__dmn_window_type !== "main") {
      console.warn(
        "[UI API] displayElement.clearMyElements is only available in main window"
      );
      return;
    }

    const pluginId = (window as any).__dmn_current_plugin_id;
    if (!pluginId) {
      console.warn("[UI API] clearMyElements called outside plugin context");
      return;
    }

    const elements = usePluginDisplayElementStore
      .getState()
      .elements.filter((el) => el.pluginId === pluginId);
    elements.forEach((element) => {
      removeDisplayElementInternal(element.fullId);
    });
  },
};

export const displayElementInstanceRegistry = {
  get(fullId: string) {
    return displayElementInstances.get(fullId);
  },
  clearByPluginId(pluginId: string) {
    clearInstancesByPlugin(pluginId);
  },
  clearAll() {
    clearAllInstances();
  },
};

export { displayElementApi };
