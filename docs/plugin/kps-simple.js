// @id kps-simple

(function () {
  if (window.api.window.type !== "main") return;

  const MAX_HISTORY = 32;
  let unsubBridge = null;

  const renderStats = (state) => {
    const rows = [
      { label: "KPS", value: state.kps.toFixed(1) },
      { label: "AVG", value: state.avg.toFixed(1) },
      { label: "MAX", value: state.max.toFixed(1) },
    ];

    return rows
      .map(
        (row) => `
          <div class="kps-stat">
            <span>${row.label}</span>
            <strong>${row.value}</strong>
          </div>
        `
      )
      .join("");
  };

  const renderBars = (state) => {
    const history = Array.isArray(state.history) ? state.history : [];
    return history
      .map((value) => {
        const ratio = state.max ? Math.min(value / state.max, 1) : 0;
        return `<div class="bar" style="height:${Math.round(
          ratio * 100
        )}%"></div>`;
      })
      .join("");
  };

  const kpsTemplate = window.api.ui.displayElement.template`
    <style>
      .kps-card {
        width: 220px;
        padding: 16px;
        border-radius: 16px;
        background: rgba(8, 10, 16, 0.85);
        border: 1px solid rgba(255, 255, 255, 0.08);
        backdrop-filter: blur(10px);
        font-family: "Pretendard", -apple-system, BlinkMacSystemFont,
          system-ui;
        color: #f8fafc;
        box-shadow: 0 15px 35px rgba(0, 0, 0, 0.55);
      }
      .kps-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
        font-size: 13px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: #cbd5f5;
      }
      .kps-pill {
        padding: 2px 10px;
        border-radius: 999px;
        font-size: 12px;
        background: rgba(99, 102, 241, 0.15);
        color: #a5b4fc;
      }
      .kps-value {
        font-size: 48px;
        font-weight: 700;
        line-height: 1;
        color: #f8fafc;
      }
      .kps-stats {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
        margin-top: 16px;
      }
      .kps-stat span {
        display: block;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #a5adcb;
      }
      .kps-stat strong {
        display: block;
        margin-top: 4px;
        font-size: 18px;
        color: #fdf4ff;
      }
      .kps-bars {
        display: flex;
        gap: 3px;
        align-items: flex-end;
        height: 48px;
        margin-top: 20px;
      }
      .kps-bars .bar {
        flex: 1;
        border-radius: 3px 3px 0 0;
        background: linear-gradient(180deg, #a855f7 0%, #6366f1 100%);
        opacity: 0.3;
        transition: height 120ms ease;
      }
      .kps-bars .bar:last-child {
        opacity: 1;
        box-shadow: 0 0 12px rgba(99, 102, 241, 0.45);
      }
    </style>
    <div class="kps-card">
      <div class="kps-header">
        <span>Live Keys</span>
        <span class="kps-pill">real time</span>
      </div>
      <div class="kps-value">${(state) => state.kps.toFixed(1)}</div>
      <div class="kps-stats">${renderStats}</div>
      <div class="kps-bars">${renderBars}</div>
    </div>
  `;

  const panel = window.api.ui.displayElement.add({
    position: { x: 120, y: 90 },
    draggable: true,
    zIndex: 120,
    contextMenu: { enableDelete: true, deleteLabel: "패널 제거" },
    state: { kps: 0, avg: 0, max: 0, history: [] },
    template: kpsTemplate,
  });

  panel.setStyle(":root", { cursor: "grab" });

  unsubBridge = window.api.bridge.on("KPS_UPDATE", ({ kps, avg, max }) => {
    const nextHistory = [...panel.getState().history, kps].slice(-MAX_HISTORY);
    panel.setState({
      kps: Number(kps || 0),
      avg: Number(avg || 0),
      max: Math.max(max || 0, 0),
      history: nextHistory,
    });
  });

  window.api.plugin.registerCleanup(() => {
    if (typeof unsubBridge === "function") unsubBridge();
    panel.remove();
  });
})();

(function () {
  if (window.api.window.type !== "overlay") return;

  const WINDOW_MS = 1000;
  const REFRESH_MS = 60;

  const buckets = new Map();
  const trackedKeys = new Set();
  const history = [];
  let currentMode = "";
  let keyMap = {};
  let maxKps = 0;

  function trim(now) {
    const cutoff = now - WINDOW_MS;
    for (const arr of buckets.values()) {
      let w = 0;
      for (let i = 0; i < arr.length; i++) {
        if (arr[i] >= cutoff) arr[w++] = arr[i];
      }
      arr.length = w;
    }
  }

  function setTracked(mode) {
    trackedKeys.clear();
    (keyMap[mode] || []).forEach((code) => trackedKeys.add(code));
    for (const key of Array.from(buckets.keys())) {
      if (!trackedKeys.has(key)) buckets.delete(key);
    }
    maxKps = 0;
  }

  const timer = setInterval(() => {
    const now = Date.now();
    trim(now);
    let total = 0;
    trackedKeys.forEach((key) => {
      total += buckets.get(key)?.length || 0;
    });
    maxKps = Math.max(maxKps, total);

    history.push(total);
    if (history.length > 30) history.shift();
    const avg =
      history.length > 0
        ? history.reduce((sum, value) => sum + value, 0) / history.length
        : 0;

    window.api.bridge.sendTo("main", "KPS_UPDATE", {
      kps: total,
      avg,
      max: maxKps,
    });
  }, REFRESH_MS);

  const unsubKey = window.api.keys.onKeyState(({ key, state }) => {
    if (state !== "DOWN" || !trackedKeys.has(key)) return;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(Date.now());
  });

  const unsubMode = window.api.keys.onModeChanged(({ mode }) => {
    currentMode = mode;
    setTracked(mode);
  });

  const unsubKeys = window.api.keys.onChanged((map) => {
    keyMap = map || {};
    setTracked(currentMode);
  });

  (async () => {
    try {
      const boot = await window.api.app.bootstrap();
      keyMap = boot.keys || {};
      currentMode = boot.selectedKeyType || Object.keys(keyMap)[0] || "4key";
      setTracked(currentMode);
    } catch (error) {
      console.error("[kps-simple] bootstrap 실패", error);
    }
  })();

  window.api.plugin.registerCleanup(() => {
    clearInterval(timer);
    unsubKey();
    unsubMode();
    unsubKeys();
  });
})();
