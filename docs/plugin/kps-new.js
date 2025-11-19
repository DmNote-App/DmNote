// @id kps-new

window.api.plugin.defineElement({
  name: "Simple KPS",

  contextMenu: {
    create: "KPS 패널 생성",
    delete: "KPS 패널 삭제",
  },

  settings: {
    showGraph: { type: "boolean", default: true, label: "그래프 표시" },
    textColor: { type: "color", default: "#FFFFFF", label: "텍스트 색상" },
    graphColor: { type: "color", default: "#00FF00", label: "그래프 색상" },
  },

  template: (state, settings, { html }) => html`
    <div
      style="
      background: rgba(0, 0, 0, 0.7);
      padding: 10px;
      border-radius: 8px;
      color: ${settings.textColor};
      font-family: sans-serif;
      min-width: 100px;
      text-align: center;
    "
    >
      <div style="font-size: 24px; font-weight: bold;">
        ${state.kps || 0}
        <span style="font-size: 12px; opacity: 0.7;">KPS</span>
      </div>
      ${settings.showGraph
        ? html`
            <div
              style="
          margin-top: 5px;
          height: 4px;
          background: #333;
          border-radius: 2px;
          overflow: hidden;
        "
            >
              <div
                style="
            height: 100%;
            width: ${Math.min(((state.kps || 0) / 20) * 100, 100)}%;
            background: ${settings.graphColor};
            transition: width 0.1s linear;
          "
              ></div>
            </div>
          `
        : ""}
    </div>
  `,

  previewState: {
    kps: 12,
  },

  onMount: ({ setState, onHook }) => {
    const timestamps = [];
    console.log("[KPS Plugin] Mounted");

    // 키 입력 감지
    onHook("key", ({ state }) => {
      // console.log("[KPS Plugin] Key event:", state);
      // 대소문자 구분 없이 비교
      if (typeof state === "string" && state.toLowerCase() === "down") {
        const now = Date.now();
        timestamps.push(now);
      }
    });

    // KPS 계산 루프 (100ms 마다)
    const interval = setInterval(() => {
      const now = Date.now();
      // 1초 지난 기록 제거
      while (timestamps.length > 0 && timestamps[0] < now - 1000) {
        timestamps.shift();
      }

      // console.log("[KPS Plugin] Update KPS:", timestamps.length);
      setState({ kps: timestamps.length });
    }, 100);

    return () => {
      console.log("[KPS Plugin] Unmounted");
      clearInterval(interval);
    };
  },
});
