import { useEffect } from "react";

const STYLE_ELEMENT_ID = "dmn-custom-css";

export function useCustomCssInjection() {
  useEffect(() => {
    let styleEl = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = STYLE_ELEMENT_ID;
      document.head.appendChild(styleEl);
    } else {
      document.head.appendChild(styleEl);
    }

    const applyContent = (content?: string) => {
      styleEl!.textContent = content || "";
    };

    const applyUsage = (enabled: boolean) => {
      styleEl!.disabled = !enabled;
    };

    window.api.css.get().then((data) => {
      applyContent(data.content);
    });

    window.api.css.getUse().then((enabled) => {
      applyUsage(enabled);
    });

    const unsubUse = window.api.css.onUse(({ enabled }) => applyUsage(enabled));
    const unsubContent = window.api.css.onContent((css) => applyContent(css.content));

    return () => {
      unsubUse();
      unsubContent();
    };
  }, []);
}
