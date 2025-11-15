import type { PluginDisplayElement } from "@src/types/api";
import {
  html,
  isTemplateResult,
  TemplateResult,
} from "@src/renderer/utils/templateEngine";
import type {
  DisplayElementTemplate,
  DisplayElementTemplateHelpers,
} from "@src/types/api";

const sharedTemplateHelpers: DisplayElementTemplateHelpers = {
  html,
};

interface DisplayElementInstanceOptions {
  fullId: string;
  pluginId: string;
  scoped?: boolean;
  initialState?: Record<string, any>;
  template?: DisplayElementTemplate;
  updateElement: (
    fullId: string,
    updates: Partial<PluginDisplayElement>
  ) => void;
  removeElement: (fullId: string) => void;
}

export class DisplayElementInstance extends String {
  public readonly id: string;
  public readonly pluginId: string;

  private readonly scoped: boolean;
  private readonly updateElement: (
    fullId: string,
    updates: Partial<PluginDisplayElement>
  ) => void;
  private readonly removeElement: (fullId: string) => void;

  private destroyed = false;
  private state?: Record<string, any>;
  private template?: DisplayElementTemplate;
  private templateRenderer?: TemplateRenderer;
  private readonly templateHelpers: DisplayElementTemplateHelpers;

  constructor(options: DisplayElementInstanceOptions) {
    super(options.fullId);
    this.id = options.fullId;
    this.pluginId = options.pluginId;
    this.scoped = Boolean(options.scoped);
    this.updateElement = options.updateElement;
    this.removeElement = options.removeElement;
    this.template = options.template;
    this.templateHelpers = sharedTemplateHelpers;

    if (options.initialState) {
      this.state = { ...options.initialState };
    } else if (options.template) {
      this.state = {};
    }
  }

  setState(updates: Record<string, any>): void {
    if (!this.ensureActive()) return;
    const nextState = this.ensureState();
    Object.assign(nextState, updates || {});
    this.renderFromTemplate();
  }

  setData(updates: Record<string, any>): void {
    this.setState(updates);
  }

  getState(): Record<string, any> {
    return { ...(this.state || {}) };
  }

  setText(selector: string = ":root", text: string): void {
    if (!this.ensureActive()) return;
    this.withTarget(selector, (target) => {
      target.textContent = text;
    });
  }

  setHTML(selector: string = ":root", html: string): void {
    if (!this.ensureActive()) return;
    this.withTarget(selector, (target) => {
      target.innerHTML = html;
    });
  }

  setStyle(selector: string = ":root", styles: Record<string, string>): void {
    if (!this.ensureActive()) return;
    this.withTarget(selector, (target) => {
      if (!(target instanceof HTMLElement)) return;
      Object.entries(styles || {}).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        target.style.setProperty(key, value);
      });
    });
  }

  addClass(selector: string = ":root", ...classNames: string[]): void {
    if (!this.ensureActive()) return;
    if (!classNames.length) return;
    this.withTarget(selector, (target) => {
      if (!(target instanceof HTMLElement)) return;
      target.classList.add(...classNames);
    });
  }

  removeClass(selector: string = ":root", ...classNames: string[]): void {
    if (!this.ensureActive()) return;
    if (!classNames.length) return;
    this.withTarget(selector, (target) => {
      if (!(target instanceof HTMLElement)) return;
      target.classList.remove(...classNames);
    });
  }

  toggleClass(selector: string = ":root", className: string): void {
    if (!this.ensureActive()) return;
    if (!className) return;
    this.withTarget(selector, (target) => {
      if (!(target instanceof HTMLElement)) return;
      target.classList.toggle(className);
    });
  }

  query(selector: string = ":root"): Element | ShadowRoot | null {
    const resolved = this.resolveTarget(selector, { sync: false });
    if (!resolved) return null;
    return resolved.target;
  }

  update(updates: Partial<PluginDisplayElement>): void {
    if (!this.ensureActive()) return;
    this.updateElement(this.id, updates);
  }

  remove(): void {
    if (!this.ensureActive()) return;
    this.destroyed = true;
    this.removeElement(this.id);
  }

  dispose(): void {
    if (this.destroyed) return;
    this.destroyed = true;
  }

  toString(): string {
    return this.id;
  }

  valueOf(): string {
    return this.id;
  }

  [Symbol.toPrimitive](): string {
    return this.id;
  }

  private ensureActive(): boolean {
    if (this.destroyed) {
      console.warn(
        `[DisplayElement] '${this.id}'은 더 이상 사용할 수 없습니다.`
      );
      return false;
    }
    return true;
  }

  private ensureState(): Record<string, any> {
    if (!this.state) {
      this.state = {};
    }
    return this.state;
  }

  private renderFromTemplate(): void {
    if (!this.template || !this.state) return;
    let output: string | TemplateResult = "";
    try {
      output = this.template({ ...this.state }, this.templateHelpers);
    } catch (error) {
      console.error(
        `[DisplayElement] template 렌더링에 실패했습니다 (${this.id})`,
        error
      );
      return;
    }

    if (isTemplateResult(output)) {
      this.ensureTemplateRenderer().render(output);
      return;
    }

    this.disposeTemplateRenderer();
    this.updateElement(this.id, {
      html: typeof output === "string" ? output : String(output),
    });
  }

  private resolveHost(): HTMLElement | null {
    if (typeof document === "undefined") return null;
    return document.querySelector(
      `[data-plugin-element="${this.id}"]`
    ) as HTMLElement | null;
  }

  private resolveRoot(host: HTMLElement): HTMLElement | ShadowRoot {
    if (this.scoped && host.shadowRoot) {
      return host.shadowRoot;
    }
    return host;
  }

  private resolveTarget(
    selector: string = ":root",
    options: { sync?: boolean } = {}
  ) {
    const host = this.resolveHost();
    if (!host) return null;
    const root = this.resolveRoot(host);

    let target: Element | ShadowRoot | null;
    if (!selector || selector === ":root") {
      target = root;
    } else if (selector === ":host") {
      target = host;
    } else {
      target =
        root instanceof ShadowRoot
          ? root.querySelector(selector)
          : (root as HTMLElement).querySelector(selector);
    }

    if (!target) return null;

    return { target, root, sync: options.sync !== false };
  }

  private withTarget(
    selector: string,
    fn: (target: Element | ShadowRoot) => void,
    options: { sync?: boolean } = {}
  ): void {
    const resolved = this.resolveTarget(selector, options);
    if (!resolved) return;

    fn(resolved.target);

    if (resolved.sync) {
      this.syncDom(resolved.root);
    }
  }

  private syncDom(root: HTMLElement | ShadowRoot): void {
    if (this.destroyed) return;
    const html = root instanceof ShadowRoot ? root.innerHTML : root.innerHTML;
    this.updateElement(this.id, { html });
  }

  private resolveRenderingRoot(): {
    host: HTMLElement;
    root: HTMLElement | ShadowRoot;
  } | null {
    const host = this.resolveHost();
    if (!host) return null;
    return { host, root: this.resolveRoot(host) };
  }

  private ensureTemplateRenderer(): TemplateRenderer {
    if (!this.templateRenderer) {
      this.templateRenderer = new TemplateRenderer({
        elementId: this.id,
        updateElement: (updates) => this.updateElement(this.id, updates),
        resolveRoot: () => this.resolveRenderingRoot(),
        syncDom: (root) => this.syncDom(root),
      });
    }
    return this.templateRenderer;
  }

  private disposeTemplateRenderer(): void {
    if (!this.templateRenderer) return;
    this.templateRenderer.dispose();
    this.templateRenderer = undefined;
  }
}

interface TemplateRendererDeps {
  elementId: string;
  updateElement: (updates: Partial<PluginDisplayElement>) => void;
  resolveRoot: () => {
    host: HTMLElement;
    root: HTMLElement | ShadowRoot;
  } | null;
  syncDom: (root: HTMLElement | ShadowRoot) => void;
}

type AttributeBindingDefinition = {
  id: string;
  attrName: string;
  valueIndexes: number[];
  segments: string[];
};

type NodeBindingDefinition = {
  index: number;
};

type NodeBindingRuntime = NodeBindingDefinition & {
  start?: Comment;
  end?: Comment;
};

type AttributeBindingRuntime = AttributeBindingDefinition & {
  element?: Element;
};

class TemplateRenderer {
  private readonly deps: TemplateRendererDeps;
  private compiledHtml = "";
  private nodeBindings = new Map<number, NodeBindingRuntime>();
  private attrBindings = new Map<string, AttributeBindingRuntime>();
  private hydrationFrame?: number;
  private lastValues: unknown[] = [];
  private stringsRef?: TemplateStringsArray;
  private virtualRoot?: HTMLElement;
  private bindingContext?: "host" | "virtual";
  private virtualBindingsDirty = false;
  private lastHtmlSnapshot = "";

  constructor(deps: TemplateRendererDeps) {
    this.deps = deps;
  }

  render(result: TemplateResult): void {
    if (!this.stringsRef || this.stringsRef !== result.strings) {
      this.compileTemplate(result);
      this.scheduleHydration();
      return;
    }

    const hostRoot = this.tryResolveHostRoot();
    if (!hostRoot) {
      this.renderToVirtualRoot(result);
      return;
    }

    this.ensureBindingContext(hostRoot, "host");
    this.updateTemplate(result, hostRoot, "host");
  }

  dispose(): void {
    if (this.hydrationFrame) {
      cancelAnimationFrame(this.hydrationFrame);
    }
    this.nodeBindings.clear();
    this.attrBindings.clear();
    this.lastValues = [];
    this.stringsRef = undefined;
  }

  private compileTemplate(result: TemplateResult): void {
    if (typeof document === "undefined") return;
    const placeholder = (index: number) => `<!--dmn-bind-${index}-->`;
    let html = "";
    result.strings.forEach((chunk, idx) => {
      html += chunk;
      if (idx < result.values.length) {
        html += placeholder(idx);
      }
    });

    const template = document.createElement("template");
    template.innerHTML = html;

    this.nodeBindings.clear();
    this.attrBindings.clear();

    this.processNodePlaceholders(template.content, result.values);
    this.processAttributePlaceholders(template.content, result.values);

    this.compiledHtml = template.innerHTML;
    this.deps.updateElement({ html: this.compiledHtml });
    this.lastHtmlSnapshot = this.compiledHtml;
    this.syncVirtualRootFromHtml(this.compiledHtml);
    this.stringsRef = result.strings;
    this.lastValues = [...result.values];
    this.bindingContext = undefined;
  }

  private processNodePlaceholders(
    root: DocumentFragment,
    values: unknown[]
  ): void {
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_COMMENT,
      null
    );

    const placeholders: Comment[] = [];
    let current: Comment | null = walker.nextNode() as Comment | null;
    while (current) {
      if (current.data.startsWith("dmn-bind-")) {
        placeholders.push(current);
      }
      current = walker.nextNode() as Comment | null;
    }

    placeholders.forEach((comment) => {
      const index = Number(comment.data.replace("dmn-bind-", ""));
      const start = document.createComment(`dmn-part:${index}:start`);
      const end = document.createComment(`dmn-part:${index}:end`);

      const fragment = this.valueToFragment(values[index]);
      const parent = comment.parentNode;
      if (!parent) return;

      parent.insertBefore(start, comment);
      parent.insertBefore(fragment, comment);
      parent.insertBefore(end, comment);
      parent.removeChild(comment);

      this.nodeBindings.set(index, { index });
    });
  }

  private processAttributePlaceholders(
    root: DocumentFragment,
    values: unknown[]
  ): void {
    const elements = root.querySelectorAll("*");
    elements.forEach((el) => {
      for (const attr of Array.from(el.attributes)) {
        const matches = [...attr.value.matchAll(/<!--dmn-bind-(\d+)-->/g)];
        if (!matches.length) continue;

        const valueIndexes = matches.map((match) => Number(match[1]));
        const segments: string[] = [];
        let lastIndex = 0;
        matches.forEach((match) => {
          if (!match.index && match.index !== 0) return;
          segments.push(attr.value.slice(lastIndex, match.index));
          lastIndex = match.index + match[0].length;
        });
        segments.push(attr.value.slice(lastIndex));

        const id = `attr-${attr.name}-${this.attrBindings.size}`;
        const binding: AttributeBindingRuntime = {
          id,
          attrName: attr.name,
          valueIndexes,
          segments,
        };

        const nextValue = this.composeAttributeValue(binding, values);
        el.setAttribute(attr.name, nextValue);
        el.setAttribute(`data-dmn-attr-${id}`, "1");
        this.attrBindings.set(id, binding);
      }
    });
  }

  private composeAttributeValue(
    binding: AttributeBindingDefinition,
    values: unknown[]
  ): string {
    let next = "";
    binding.segments.forEach((segment, idx) => {
      next += segment;
      if (idx < binding.valueIndexes.length) {
        next += this.valueToString(values[binding.valueIndexes[idx]]);
      }
    });
    return next;
  }

  private scheduleHydration(): void {
    if (this.hydrationFrame) {
      cancelAnimationFrame(this.hydrationFrame);
    }
    this.hydrationFrame = requestAnimationFrame(() => {
      this.hydrationFrame = undefined;
      this.hydrateBindings();
    });
  }

  private hydrateBindings(): void {
    const resolved = this.deps.resolveRoot();
    if (!resolved) {
      this.scheduleHydration();
      return;
    }

    const { root } = resolved;
    if (!this.isNodeConnected(root)) {
      this.scheduleHydration();
      return;
    }
    this.hydrateNodeBindings(root);
    this.hydrateAttributeBindings(root);
    this.bindingContext = "host";
    this.virtualBindingsDirty = true;
  }

  private hydrateNodeBindings(root: HTMLElement | ShadowRoot): void {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
    const startMap = new Map<number, Comment>();
    const endMap = new Map<number, Comment>();
    let current = walker.nextNode() as Comment | null;
    while (current) {
      const text = current.data;
      if (text.startsWith("dmn-part:")) {
        const [, indexStr, position] = text.split(":");
        const index = Number(indexStr);
        if (position === "start") {
          startMap.set(index, current);
        } else if (position === "end") {
          endMap.set(index, current);
        }
      }
      current = walker.nextNode() as Comment | null;
    }

    this.nodeBindings.forEach((binding, index) => {
      const start = startMap.get(index);
      const end = endMap.get(index);
      if (!start || !end) return;
      binding.start = start;
      binding.end = end;
    });
  }

  private hydrateAttributeBindings(root: HTMLElement | ShadowRoot): void {
    this.attrBindings.forEach((binding, id) => {
      const selector = `[data-dmn-attr-${id}]`;
      const element = root.querySelector(selector);
      if (!element) return;
      binding.element = element;
    });
  }

  private updateTemplate(
    result: TemplateResult,
    root: HTMLElement | ShadowRoot,
    context: "host" | "virtual"
  ): void {
    const changedIndexes: number[] = [];
    result.values.forEach((value, idx) => {
      if (!Object.is(value, this.lastValues[idx])) {
        changedIndexes.push(idx);
      }
    });

    if (!changedIndexes.length) return;

    const pendingNodeUpdates: Array<{
      binding: NodeBindingRuntime;
      value: unknown;
    }> = [];
    const pendingAttrUpdates = new Set<AttributeBindingRuntime>();

    for (const index of changedIndexes) {
      const nodeBinding = this.nodeBindings.get(index);
      if (nodeBinding) {
        if (!nodeBinding.start || !nodeBinding.end) {
          this.scheduleHydration();
          return;
        }
        pendingNodeUpdates.push({
          binding: nodeBinding,
          value: result.values[index],
        });
        continue;
      }

      let bindingFound = false;
      for (const binding of this.attrBindings.values()) {
        if (!binding.valueIndexes.includes(index)) continue;
        bindingFound = true;
        if (!binding.element) {
          this.scheduleHydration();
          return;
        }
        pendingAttrUpdates.add(binding);
      }

      if (!bindingFound) {
        // 값만 변하고 바인딩은 없을 수 있으므로 무시
        continue;
      }
    }

    pendingNodeUpdates.forEach(({ binding, value }) => {
      this.updateNodeBinding(binding, value);
    });

    pendingAttrUpdates.forEach((binding) => {
      if (!binding.element) return;
      const nextValue = this.composeAttributeValue(binding, result.values);
      binding.element.setAttribute(binding.attrName, nextValue);
    });

    this.lastValues = [...result.values];

    this.deps.syncDom(root);
    const htmlSnapshot = this.getRootHtml(root);
    this.lastHtmlSnapshot = htmlSnapshot;
    if (context === "host") {
      this.syncVirtualRootFromHtml(htmlSnapshot);
    } else {
      this.virtualBindingsDirty = false;
    }
  }

  private updateNodeBinding(binding: NodeBindingRuntime, value: unknown): void {
    if (!binding.start || !binding.end) return;
    const parent = binding.start.parentNode;
    if (!parent) return;

    const oldNodes = this.collectNodesBetween(binding.start, binding.end);
    const fragment = this.valueToFragment(value);
    const newNodes = Array.from(fragment.childNodes);

    const minLength = Math.min(oldNodes.length, newNodes.length);
    for (let i = 0; i < minLength; i++) {
      this.patchNode(oldNodes[i], newNodes[i]);
    }

    if (oldNodes.length > newNodes.length) {
      for (let i = newNodes.length; i < oldNodes.length; i++) {
        oldNodes[i].parentNode?.removeChild(oldNodes[i]);
      }
    } else if (newNodes.length > oldNodes.length) {
      for (let i = oldNodes.length; i < newNodes.length; i++) {
        parent.insertBefore(newNodes[i], binding.end);
      }
    }
  }

  private collectNodesBetween(start: Comment, end: Comment): Node[] {
    const nodes: Node[] = [];
    let current = start.nextSibling;
    while (current && current !== end) {
      nodes.push(current);
      current = current.nextSibling;
    }
    return nodes;
  }

  private patchNode(oldNode: Node, newNode: Node): void {
    if (oldNode.nodeType !== newNode.nodeType) {
      oldNode.parentNode?.replaceChild(newNode, oldNode);
      return;
    }

    if (oldNode.nodeType === Node.TEXT_NODE) {
      if (oldNode.textContent !== newNode.textContent) {
        oldNode.textContent = newNode.textContent || "";
      }
      return;
    }

    if (
      oldNode.nodeType === Node.ELEMENT_NODE &&
      newNode.nodeType === Node.ELEMENT_NODE
    ) {
      const oldEl = oldNode as Element;
      const newEl = newNode as Element;
      if (oldEl.tagName !== newEl.tagName) {
        oldEl.parentNode?.replaceChild(newEl, oldEl);
        return;
      }

      this.syncAttributes(oldEl, newEl);
      this.patchElementChildren(oldEl, newEl);
    }
  }

  private syncAttributes(target: Element, source: Element): void {
    for (const attr of Array.from(target.attributes)) {
      if (!source.hasAttribute(attr.name)) {
        target.removeAttribute(attr.name);
      }
    }
    for (const attr of Array.from(source.attributes)) {
      if (target.getAttribute(attr.name) !== attr.value) {
        target.setAttribute(attr.name, attr.value);
      }
    }
  }

  private patchElementChildren(target: Element, source: Element): void {
    const targetChildren = Array.from(target.childNodes);
    const sourceChildren = Array.from(source.childNodes);
    const minLength = Math.min(targetChildren.length, sourceChildren.length);
    for (let i = 0; i < minLength; i++) {
      this.patchNode(targetChildren[i], sourceChildren[i]);
    }

    if (targetChildren.length > sourceChildren.length) {
      for (let i = sourceChildren.length; i < targetChildren.length; i++) {
        target.removeChild(targetChildren[i]);
      }
    } else if (sourceChildren.length > targetChildren.length) {
      for (let i = targetChildren.length; i < sourceChildren.length; i++) {
        target.appendChild(sourceChildren[i].cloneNode(true));
      }
    }
  }

  private valueToFragment(value: unknown): DocumentFragment {
    const fragment = document.createDocumentFragment();
    if (value === null || value === undefined) {
      return fragment;
    }

    if (isTemplateResult(value)) {
      const template = document.createElement("template");
      template.innerHTML = this.templateResultToString(value);
      fragment.appendChild(template.content.cloneNode(true));
      return fragment;
    }

    if (value instanceof Node) {
      fragment.appendChild(value.cloneNode(true));
      return fragment;
    }

    const template = document.createElement("template");
    template.innerHTML = this.valueToString(value);
    fragment.appendChild(template.content);
    return fragment;
  }

  private valueToString(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (isTemplateResult(value)) {
      return this.templateResultToString(value);
    }
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    if (Array.isArray(value)) {
      return value.map((entry) => this.valueToString(entry)).join("");
    }
    return String(value);
  }

  private templateResultToString(result: TemplateResult): string {
    let html = "";
    result.strings.forEach((chunk, idx) => {
      html += chunk;
      if (idx < result.values.length) {
        html += this.valueToString(result.values[idx]);
      }
    });
    return html;
  }

  private renderToVirtualRoot(result: TemplateResult): void {
    const virtualRoot = this.ensureVirtualRoot();
    if (!virtualRoot.innerHTML && this.lastHtmlSnapshot) {
      virtualRoot.innerHTML = this.lastHtmlSnapshot;
    }

    this.ensureBindingContext(virtualRoot, "virtual");
    this.updateTemplate(result, virtualRoot, "virtual");
  }

  private ensureVirtualRoot(): HTMLElement {
    if (this.virtualRoot) return this.virtualRoot;
    if (typeof document === "undefined") {
      throw new Error("Virtual rendering is unavailable in this environment");
    }
    this.virtualRoot = document.createElement("div");
    if (this.lastHtmlSnapshot) {
      this.virtualRoot.innerHTML = this.lastHtmlSnapshot;
    }
    this.virtualBindingsDirty = true;
    return this.virtualRoot;
  }

  private ensureBindingContext(
    root: HTMLElement | ShadowRoot,
    context: "host" | "virtual"
  ): void {
    if (this.bindingContext === context) {
      if (context === "virtual" && this.virtualBindingsDirty) {
        // fallthrough to rebind
      } else {
        return;
      }
    }
    this.hydrateNodeBindings(root);
    this.hydrateAttributeBindings(root);
    this.bindingContext = context;
    if (context === "virtual") {
      this.virtualBindingsDirty = false;
    } else {
      this.virtualBindingsDirty = true;
    }
  }

  private tryResolveHostRoot(): HTMLElement | ShadowRoot | null {
    const resolved = this.deps.resolveRoot();
    if (!resolved) return null;
    const { root } = resolved;
    if (!this.isNodeConnected(root)) return null;
    return root;
  }

  private isNodeConnected(root: HTMLElement | ShadowRoot): boolean {
    if (root instanceof ShadowRoot) {
      return root.host.isConnected;
    }
    return root.isConnected;
  }

  private syncVirtualRootFromHtml(html: string): void {
    if (!this.virtualRoot) return;
    this.virtualRoot.innerHTML = html;
    this.virtualBindingsDirty = true;
  }

  private getRootHtml(root: HTMLElement | ShadowRoot): string {
    return root instanceof ShadowRoot ? root.innerHTML : root.innerHTML;
  }
}
