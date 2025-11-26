// @id keystroke-visualizer

/**
 * Keystroke Visualizer Plugin
 *
 * Raw Key Input API를 사용하여 실시간으로 키 입력을 시각화합니다.
 * defineElement와 rawKey 이벤트 훅을 활용합니다.
 */

dmn.plugin.defineElement({
  name: "Keystroke Visualizer",

  contextMenu: {
    create: "menu.create",
    delete: "menu.delete",
    items: [
      {
        label: "menu.clear",
        onClick: ({ actions }) => actions.clear(),
      },
    ],
  },

  messages: {
    en: {
      "menu.create": "Create Keystroke Visualizer",
      "menu.delete": "Delete Keystroke Visualizer",
      "menu.clear": "Clear History",
      "settings.maxItems": "Max Items",
      "settings.showDevice": "Show Device Icon",
      "settings.showTimestamp": "Show Timestamp",
      "settings.fadeTime": "Fade Time (ms)",
      "settings.bgColor": "Background Color",
      "settings.textColor": "Text Color",
      "settings.accentColor": "Accent Color",
      "settings.keyDownColor": "Key Down Color",
      "settings.keyUpColor": "Key Up Color",
    },
    ko: {
      "menu.create": "키 입력 시각화 생성",
      "menu.delete": "키 입력 시각화 삭제",
      "menu.clear": "기록 지우기",
      "settings.maxItems": "최대 항목 수",
      "settings.showDevice": "장치 아이콘 표시",
      "settings.showTimestamp": "타임스탬프 표시",
      "settings.fadeTime": "페이드 시간 (ms)",
      "settings.bgColor": "배경 색상",
      "settings.textColor": "텍스트 색상",
      "settings.accentColor": "강조 색상",
      "settings.keyDownColor": "키 누름 색상",
      "settings.keyUpColor": "키 뗌 색상",
    },
  },

  settings: {
    maxItems: {
      type: "number",
      default: 8,
      min: 3,
      max: 20,
      step: 1,
      label: "settings.maxItems",
    },
    showDevice: {
      type: "boolean",
      default: true,
      label: "settings.showDevice",
    },
    showTimestamp: {
      type: "boolean",
      default: false,
      label: "settings.showTimestamp",
    },
    fadeTime: {
      type: "number",
      default: 2000,
      min: 500,
      max: 10000,
      step: 100,
      label: "settings.fadeTime",
    },
    bgColor: {
      type: "color",
      default: "rgba(17, 17, 20, 0.9)",
      label: "settings.bgColor",
    },
    textColor: {
      type: "color",
      default: "#DBDEE8",
      label: "settings.textColor",
    },
    accentColor: {
      type: "color",
      default: "#86EFAC",
      label: "settings.accentColor",
    },
    keyDownColor: {
      type: "color",
      default: "#86EFAC",
      label: "settings.keyDownColor",
    },
    keyUpColor: {
      type: "color",
      default: "#F87171",
      label: "settings.keyUpColor",
    },
  },

  template: (state, settings, { html }) => {
    const { keystrokes = [] } = state;
    const {
      bgColor = "rgba(17, 17, 20, 0.9)",
      textColor = "#DBDEE8",
      accentColor = "#86EFAC",
      keyDownColor = "#86EFAC",
      keyUpColor = "#F87171",
      showDevice = true,
      showTimestamp = false,
    } = settings;

    const getDeviceIcon = (device) => {
      switch (device) {
        case "keyboard":
          return "⌨️";
        case "mouse":
          return "🖱️";
        case "gamepad":
          return "🎮";
        default:
          return "❓";
      }
    };

    const formatTime = (timestamp) => {
      const date = new Date(timestamp);
      const ms = String(date.getMilliseconds()).padStart(3, "0");
      const s = String(date.getSeconds()).padStart(2, "0");
      const m = String(date.getMinutes()).padStart(2, "0");
      return `${m}:${s}.${ms}`;
    };

    const renderKeystroke = (keystroke, index) => {
      const isDown = keystroke.state === "DOWN";
      const stateColor = isDown ? keyDownColor : keyUpColor;
      const opacity = 1 - index * 0.1;

      return html`
        <div
          style="
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 4px 8px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 4px;
            border-left: 3px solid ${stateColor};
            opacity: ${Math.max(0.3, opacity)};
            transition: all 0.15s ease-out;
          "
        >
          ${showDevice
            ? html`
                <span style="font-size: 12px; min-width: 20px;"
                  >${getDeviceIcon(keystroke.device)}</span
                >
              `
            : ""}

          <span
            style="
              font-weight: 600;
              font-size: 13px;
              color: ${textColor};
              min-width: 60px;
            "
          >
            ${keystroke.label}
          </span>

          <span
            style="
              font-size: 10px;
              padding: 2px 6px;
              border-radius: 3px;
              background: ${isDown
              ? "rgba(134, 239, 172, 0.2)"
              : "rgba(248, 113, 113, 0.2)"};
              color: ${stateColor};
              font-weight: 500;
            "
          >
            ${isDown ? "↓" : "↑"}
          </span>

          ${showTimestamp
            ? html`
                <span
                  style="
                font-size: 10px;
                color: rgba(255, 255, 255, 0.4);
                margin-left: auto;
                font-family: monospace;
              "
                >
                  ${formatTime(keystroke.timestamp)}
                </span>
              `
            : ""}
        </div>
      `;
    };

    return html`
      <link
        href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css"
        rel="stylesheet"
      />
      <div
        style="
          background: ${bgColor};
          color: ${textColor};
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          padding: 12px;
          min-width: 180px;
          max-width: 300px;
          backdrop-filter: blur(4px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
          cursor: pointer;
          user-select: none;
          font-family: Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, 'Helvetica Neue', sans-serif;
        "
      >
        <div
          style="
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 10px;
            padding-bottom: 8px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          "
        >
          <span style="font-size: 14px;">⌨️</span>
          <span
            style="font-size: 12px; font-weight: 600; color: ${accentColor};"
          >
            Keystroke Visualizer
          </span>
        </div>

        <div
          style="
            display: flex;
            flex-direction: column;
            gap: 4px;
            max-height: 300px;
            overflow-y: auto;
          "
        >
          ${keystrokes.length === 0
            ? html`
                <div
                  style="
                    text-align: center;
                    padding: 20px 10px;
                    color: rgba(255, 255, 255, 0.4);
                    font-size: 11px;
                  "
                >
                  키를 입력하면 여기에 표시됩니다
                </div>
              `
            : keystrokes.map((ks, i) => renderKeystroke(ks, i))}
        </div>
      </div>
    `;
  },

  previewState: {
    keystrokes: [
      {
        device: "keyboard",
        label: "A",
        state: "DOWN",
        timestamp: Date.now() - 500,
      },
      {
        device: "keyboard",
        label: "A",
        state: "UP",
        timestamp: Date.now() - 400,
      },
      {
        device: "keyboard",
        label: "S",
        state: "DOWN",
        timestamp: Date.now() - 300,
      },
      {
        device: "mouse",
        label: "MOUSE1",
        state: "DOWN",
        timestamp: Date.now() - 200,
      },
      {
        device: "keyboard",
        label: "S",
        state: "UP",
        timestamp: Date.now() - 100,
      },
    ],
  },

  onMount: ({ setState, getSettings, onHook, expose }) => {
    let keystrokes = [];
    let timeoutIds = new Map();

    const clearHistory = () => {
      keystrokes = [];
      timeoutIds.forEach((id) => clearTimeout(id));
      timeoutIds.clear();
      setState({ keystrokes: [] });
    };

    expose({
      clear: clearHistory,
    });

    // Raw key 이벤트 사용 (구독 기반)
    onHook("rawKey", (payload) => {
      const settings = getSettings();
      const maxItems = settings.maxItems || 8;
      const fadeTime = settings.fadeTime || 2000;

      const keystroke = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        device: payload.device,
        label: payload.label,
        state: payload.state,
        timestamp: Date.now(),
      };

      // 새 키 입력 추가
      keystrokes = [keystroke, ...keystrokes].slice(0, maxItems);

      setState({ keystrokes: [...keystrokes] });

      // 일정 시간 후 자동 제거
      const timeoutId = setTimeout(() => {
        keystrokes = keystrokes.filter((ks) => ks.id !== keystroke.id);
        timeoutIds.delete(keystroke.id);
        setState({ keystrokes: [...keystrokes] });
      }, fadeTime);

      timeoutIds.set(keystroke.id, timeoutId);
    });

    return () => {
      // 정리: 모든 타임아웃 제거
      timeoutIds.forEach((id) => clearTimeout(id));
      timeoutIds.clear();
    };
  },
});
