// @id kps-new

dmn.plugin.defineElement({
  name: "Simple KPS",

  contextMenu: {
    create: "menu.create",
    delete: "menu.delete",
    items: [
      {
        label: "menu.reset",
        onClick: ({ actions }) => actions.reset(),
      },
    ],
  },

  messages: {
    en: {
      "menu.create": "Create KPS Panel",
      "menu.delete": "Delete KPS Panel",
      "settings.showKps": "Show KPS",
      "settings.showAvg": "Show AVG",
      "settings.showMax": "Show MAX",
      "settings.showGraph": "Show Graph",
      "settings.graphType": "Graph Type",
      "settings.graphType.line": "Line Graph",
      "settings.graphType.bar": "Bar Graph",
      "settings.graphSpeed": "Graph Speed (ms)",
      "settings.graphColor": "Graph Color",
      "metrics.kps": "KPS",
      "metrics.avg": "AVG",
      "metrics.max": "MAX",
      "menu.reset": "Reset Stats",
    },
    ko: {
      "menu.create": "KPS 패널 생성",
      "menu.delete": "KPS 패널 삭제",
      "settings.showKps": "KPS 표시",
      "settings.showAvg": "AVG 표시",
      "settings.showMax": "MAX 표시",
      "settings.showGraph": "그래프 표시",
      "settings.graphType": "그래프 형태",
      "settings.graphType.line": "선 그래프",
      "settings.graphType.bar": "바 그래프",
      "settings.graphSpeed": "그래프 속도 (ms)",
      "settings.graphColor": "그래프 색상",
      "metrics.kps": "KPS",
      "metrics.avg": "AVG",
      "metrics.max": "MAX",
      "menu.reset": "통계 초기화",
    },
  },

  settings: {
    showKps: { type: "boolean", default: true, label: "settings.showKps" },
    showAvg: { type: "boolean", default: true, label: "settings.showAvg" },
    showMax: { type: "boolean", default: true, label: "settings.showMax" },
    showGraph: {
      type: "boolean",
      default: true,
      label: "settings.showGraph",
    },
    graphType: {
      type: "select",
      options: [
        { value: "line", label: "settings.graphType.line" },
        { value: "bar", label: "settings.graphType.bar" },
      ],
      default: "line",
      label: "settings.graphType",
    },
    graphSpeed: {
      type: "number",
      default: 1000,
      min: 500,
      max: 5000,
      step: 100,
      label: "settings.graphSpeed",
    },
    graphColor: {
      type: "color",
      default: "#86EFAC",
      label: "settings.graphColor",
    },
  },

  template: (state, settings, { html, t }) => {
    const {
      kps = 0,
      avg = 0,
      max = 0,
      history = [],
      maxval = 1,
      uid = "",
    } = state;
    const safeMax = maxval > 0 ? maxval : 1;
    const graphColor = settings.graphColor || "#86EFAC";

    // 그래프 렌더링
    const renderGraphContent = () => {
      if (!settings.showGraph) return "";

      if (settings.graphType === "bar") {
        // 바 그래프
        const bars = history.map((value, index) => {
          const height = Math.min((value / safeMax) * 100, 100);
          const opacity = 0.3 + (index / history.length) * 0.7;
          return html`<div
            style="flex: 1; border-radius: 2px 2px 0 0; min-height: 2px; transition: height 0.15s ease-out; background: ${graphColor}; height: ${height}%; opacity: ${opacity};"
          ></div>`;
        });
        return html`<div
          style="display: flex; align-items: flex-end; justify-content: space-between; height: 60px; margin-top: 8px; padding: 4px; background: rgba(0, 0, 0, 0.3); border-radius: 4px; gap: 1px; position: relative;"
        >
          ${bars}
        </div>`;
      } else {
        // 선 그래프
        const denominator = Math.max(history.length - 1, 1);
        const linePoints = history
          .map((value, index) => {
            const x = (index / denominator) * 100;
            const y = 100 - Math.min((value / safeMax) * 100, 100);
            return `${x},${y}`;
          })
          .join(" ");

        const fillPoints = [
          "0,100",
          ...history.map((value, index) => {
            const x = (index / denominator) * 100;
            const y = 100 - Math.min((value / safeMax) * 100, 100);
            return `${x},${y}`;
          }),
          "100,100",
        ].join(" ");

        const avgY = 100 - Math.min((avg / safeMax) * 100, 100);

        return html`
          <div
            style="display: flex; align-items: flex-end; justify-content: space-between; height: 60px; margin-top: 8px; padding: 4px; background: rgba(0, 0, 0, 0.3); border-radius: 4px; gap: 1px; position: relative;"
          >
            <svg
              width="100%"
              height="100%"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              style="position: absolute; top: 4px; left: 4px; right: 4px; bottom: 4px; width: calc(100% - 8px); height: calc(100% - 8px);"
            >
              <defs>
                <linearGradient
                  id=${`lineGradient-${uid}`}
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="0%"
                >
                  <stop
                    offset="0%"
                    style="stop-color: ${graphColor}; stop-opacity: 0.3"
                  />
                  <stop
                    offset="100%"
                    style="stop-color: ${graphColor}; stop-opacity: 1"
                  />
                </linearGradient>
                <linearGradient
                  id=${`fillGradient-${uid}`}
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="0%"
                >
                  <stop
                    offset="0%"
                    style="stop-color: ${graphColor}; stop-opacity: 0.05"
                  />
                  <stop
                    offset="100%"
                    style="stop-color: ${graphColor}; stop-opacity: 0.15"
                  />
                </linearGradient>
              </defs>
              <polygon
                points=${fillPoints}
                fill=${`url(#fillGradient-${uid})`}
              />
              <line
                x1="0"
                y1=${avgY}
                x2="100"
                y2=${avgY}
                stroke=${graphColor}
                stroke-width="1"
                stroke-dasharray="2,2"
                opacity="0.5"
                vector-effect="non-scaling-stroke"
              />
              <polyline
                points=${linePoints}
                fill="none"
                stroke=${`url(#lineGradient-${uid})`}
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                vector-effect="non-scaling-stroke"
              />
            </svg>
          </div>
        `;
      }
    };

    return html`
      <link
        href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css"
        rel="stylesheet"
      />
      <div
        style="background: rgba(17, 17, 20, 0.9); color: #fff; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 8px; min-width: 100px; max-width: 260px; backdrop-filter: blur(4px); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35); cursor: pointer; user-select: none; font-family: Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, 'Helvetica Neue', sans-serif;"
      >
        <div
          style="display: grid; width: 120px; grid-template-columns: 1fr auto; gap: 4px 8px; font-size: 12px; line-height: 1.3;"
        >
          ${settings.showKps
            ? html`
                <div style="display: contents;">
                  <div style="color: #cbd5e1; white-space: nowrap;">
                    ${t("metrics.kps")}
                  </div>
                  <div
                    style="color: ${graphColor}; text-align: right; font-weight: 700;"
                  >
                    ${kps}
                  </div>
                </div>
              `
            : ""}
          ${settings.showAvg
            ? html`
                <div style="display: contents;">
                  <div style="color: #cbd5e1; white-space: nowrap;">
                    ${t("metrics.avg")}
                  </div>
                  <div
                    style="color: ${graphColor}; text-align: right; font-weight: 700;"
                  >
                    ${avg}
                  </div>
                </div>
              `
            : ""}
          ${settings.showMax
            ? html`
                <div style="display: contents;">
                  <div style="color: #cbd5e1; white-space: nowrap;">
                    ${t("metrics.max")}
                  </div>
                  <div
                    style="color: ${graphColor}; text-align: right; font-weight: 700;"
                  >
                    ${max}
                  </div>
                </div>
              `
            : ""}
        </div>
        ${renderGraphContent()}
      </div>
    `;
  },
  previewState: {
    kps: 14,
    avg: 12,
    max: 18,
    history: [8, 10, 11, 13, 12, 14, 15, 16, 14, 13, 12, 14, 15, 14, 14],
    maxval: 18,
    uid: "preview",
  },

  onMount: ({ setState, onHook, getSettings, expose }) => {
    const timestamps = [];
    let max = 0;
    let kpsSum = 0;
    let kpsCount = 0;
    let maxval = 1;

    // 초기 설정으로 historyBuffer 크기 결정
    const initialSettings = getSettings();
    const GRAPH_UPDATE_MS = 100; // 그래프 히스토리 업데이트 주기
    const initialTargetSize = Math.ceil(
      (initialSettings.graphSpeed || 1000) / GRAPH_UPDATE_MS
    );
    let historyBuffer = new Array(initialTargetSize).fill(0);

    const uid = Math.random().toString(36).substr(2, 9);
    setState({ uid, history: [...historyBuffer] });

    const resetStats = () => {
      const currentSettings = getSettings();
      const targetSize = Math.ceil(
        (currentSettings.graphSpeed || 1000) / GRAPH_UPDATE_MS
      );

      timestamps.length = 0;
      max = 0;
      kpsSum = 0;
      kpsCount = 0;
      maxval = 1;
      historyBuffer = new Array(targetSize).fill(0);

      setState({
        kps: 0,
        max: 0,
        avg: 0,
        history: [...historyBuffer],
        maxval,
      });
    };

    expose({
      reset: resetStats,
    });

    // 현재 눌린 키를 추적하기 위한 Set
    const pressedKeys = new Set();

    // 키 입력 감지
    onHook("key", ({ key, state }) => {
      if (typeof state === "string") {
        const keyState = state.toLowerCase();

        if (keyState === "down") {
          // 키가 이미 눌려있지 않은 경우에만 카운팅 (홀드 방지)
          if (!pressedKeys.has(key)) {
            pressedKeys.add(key);
            const now = Date.now();
            timestamps.push(now);
          }
        } else if (keyState === "up") {
          pressedKeys.delete(key);
        }
      }
    });

    // KPS 계산 루프 (50ms마다)
    const interval = setInterval(() => {
      const now = Date.now();
      // 1초 지난 기록 제거
      while (timestamps.length > 0 && timestamps[0] < now - 1000) {
        timestamps.shift();
      }

      const kps = timestamps.length;

      // 최대값 업데이트
      if (kps > max) max = kps;

      // 평균값 업데이트
      if (kps > 0) {
        kpsSum += kps;
        kpsCount++;
      }
      const avg = kpsCount > 0 ? Math.round(kpsSum / kpsCount) : 0;

      // 그래프 스케일링용 최대값 업데이트
      if (kps > maxval) maxval = kps;

      // 히스토리 업데이트 (50ms마다)
      historyBuffer.shift();
      historyBuffer.push(kps);

      // targetSize로 배열 크기 조정
      const settings = getSettings();
      const targetSize = Math.ceil(
        (settings.graphSpeed || 1000) / GRAPH_UPDATE_MS
      );

      while (historyBuffer.length > targetSize) historyBuffer.shift();
      while (historyBuffer.length < targetSize) historyBuffer.unshift(0);

      setState({
        kps,
        max,
        avg,
        history: [...historyBuffer],
        maxval,
      });
    }, 50);

    return () => {
      clearInterval(interval);
    };
  },
});

