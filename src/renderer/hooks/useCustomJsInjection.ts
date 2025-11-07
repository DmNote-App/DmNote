import { useEffect } from "react";

const SCRIPT_ELEMENT_ID = "dmn-custom-js";

export function useCustomJsInjection() {
  useEffect(() => {
    let scriptEl = document.getElementById(
      SCRIPT_ELEMENT_ID
    ) as HTMLScriptElement | null;
    let enabled = false;
    let currentContent = "";
    let disposed = false;

    const runCleanup = () => {
      try {
        const anyWindow = window as unknown as {
          __dmn_custom_js_cleanup?: () => void;
        };
        if (typeof anyWindow.__dmn_custom_js_cleanup === "function") {
          anyWindow.__dmn_custom_js_cleanup();
        }
      } catch (error) {
        console.error("Error during custom JS cleanup", error);
      }
    };

    const removeElement = () => {
      if (scriptEl) {
        scriptEl.remove();
        scriptEl = null;
      }
    };

    const injectContent = () => {
      if (!enabled) {
        // 비활성화할 때 스크립트가 제공한 cleanup 작업을 실행
        runCleanup();
        removeElement();
        return;
      }
      runCleanup();
      removeElement();
      if (!currentContent) return;
      const el = document.createElement("script");
      el.id = SCRIPT_ELEMENT_ID;
      el.type = "text/javascript";
      el.textContent = currentContent;
      document.head.appendChild(el);
      scriptEl = el;
    };

    window.api.js.get().then((data) => {
      if (disposed) return;
      currentContent = data.content ?? "";
      if (enabled) {
        injectContent();
      }
    });

    window.api.js.getUse().then((value) => {
      if (disposed) return;
      enabled = value;
      injectContent();
    });

    const unsubUse = window.api.js.onUse(({ enabled: next }) => {
      enabled = next;
      injectContent();
    });

    const unsubContent = window.api.js.onContent((payload) => {
      currentContent = payload.content ?? "";
      if (enabled) {
        injectContent();
      }
    });

    return () => {
      disposed = true;
      try {
        unsubUse();
      } catch (error) {
        console.error("Failed to unsubscribe JS use handler", error);
      }
      try {
        unsubContent();
      } catch (error) {
        console.error("Failed to unsubscribe JS content handler", error);
      }
      // 주입된 스크립트가 핸들러나 UI를 추가했을 경우를 대비한 cleanup
      runCleanup();
      removeElement();
    };
  }, []);
}
