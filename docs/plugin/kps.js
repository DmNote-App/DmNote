// @id kps-counter

/**
 * KPS (Keys Per Second) 카운터 플러그인
 *
 * 주요 기능:
 * 1. 그리드 컨텍스트 메뉴에서 KPS 패널 추가 (다중 패널 지원)
 * 2. DisplayElement 템플릿/상태 기반 렌더링
 * 3. 패널 클릭 시 KPS/AVG/MAX 표시 및 그래프 설정 모달
 * 4. 오버레이에서 계산된 KPS 데이터를 브릿지로 수신
 * 5. 실시간 그래프 표시 (바/선 그래프)
 * 6. 패널별 위치 및 설정값 영속성 보장
 */
(function () {
  if (window.api.window.type !== "main") return;

  // ===== 상태 관리 =====
  const panels = new Map(); // panelId => { instance, settings }
  let currentKpsData = { kps: 0, avg: 0, max: 0 }; // 오버레이로부터 수신된 KPS 데이터
  let nextPanelId = 1;
  const GRAPH_UPDATE_MS = 100; // 그래프 업데이트 주기

  // 기본 설정
  const DEFAULT_PANEL_SETTINGS = {
    position: { x: 100, y: 100 },
    visibility: { kps: true, avg: true, max: true },
    showGraph: true,
    graphType: "line", // "bar" 또는 "line"
    graphSpeed: 1000, // backlog (밀리초) - 그래프에 표시될 데이터 기간
  };

  // ===== 스토리지 초기화 =====
  async function loadPanels() {
    const saved = await window.api.plugin.storage.get("panels");
    return Array.isArray(saved) ? saved : [];
  }

  async function savePanels() {
    const panelsData = Array.from(panels.entries()).map(([id, panel]) => ({
      id,
      settings: panel.settings,
    }));
    if (panelsData.length > 0) {
      await window.api.plugin.storage.set("panels", panelsData);
    }
  }

  async function loadNextPanelId() {
    return (await window.api.plugin.storage.get("nextPanelId")) || 1;
  }

  async function saveNextPanelId() {
    await window.api.plugin.storage.set("nextPanelId", nextPanelId);
  }

  // ===== KPS 패널 HTML 생성 (템플릿 함수) =====
  function generateTemplate(panelId) {
    const renderRowClass = (key) => (state) => {
      const visibility = state.visibility || {};
      return `kps-row ${visibility[key] ? "" : "kps-row--hidden"}`;
    };

    const renderNoDataClass = (state) => {
      const visibility = state.visibility || {};
      const hasStats = visibility.kps || visibility.avg || visibility.max;
      return `kps-row ${hasStats ? "kps-row--hidden" : ""}`;
    };

    const renderGraph = (state) => {
      const { showGraph, history = [], graphType, maxval, avg } = state;
      if (!showGraph || history.length === 0) return "";

      const safeMax = maxval > 0 ? maxval : 1;
      if (graphType === "bar") {
        const bars = history
          .map((value, index) => {
            const height = Math.min((value / safeMax) * 100, 100);
            const opacity = 0.3 + (index / history.length) * 0.7;
            return `<div class="kps-bar" style="height: ${height}%; opacity: ${opacity};"></div>`;
          })
          .join("");
        return `<div class="kps-graph">${bars}</div>`;
      }

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

      const avgY = 100 - Math.min(((avg || 0) / safeMax) * 100, 100);

      return `
        <div class="kps-graph">
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <linearGradient id="lineGradient-${panelId}" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" style="stop-color:#86EFAC;stop-opacity:0.3" />
                <stop offset="100%" style="stop-color:#86EFAC;stop-opacity:1" />
              </linearGradient>
              <linearGradient id="fillGradient-${panelId}" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" style="stop-color:#86EFAC;stop-opacity:0.05" />
                <stop offset="100%" style="stop-color:#86EFAC;stop-opacity:0.15" />
              </linearGradient>
            </defs>
            <polygon points="${fillPoints}" fill="url(#fillGradient-${panelId})" />
            <line x1="0" y1="${avgY}" x2="100" y2="${avgY}" stroke="#86EFAC" stroke-width="1" stroke-dasharray="2,2" opacity="0.5" vector-effect="non-scaling-stroke" />
            <polyline points="${linePoints}" fill="none" stroke="url(#lineGradient-${panelId})" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
          </svg>
        </div>
      `;
    };

    return window.api.ui.displayElement.template`
      <link
        href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css"
        rel="stylesheet"
      />
      <style>
        .kps-panel {
          background: rgba(17, 17, 20, 0.9);
          color: #fff;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          padding: 8px;
          min-width: 100px;
          max-width: 260px;
          backdrop-filter: blur(4px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
          cursor: pointer;
          user-select: none;
          font-family: Pretendard, -apple-system, BlinkMacSystemFont,
            system-ui, Roboto, "Helvetica Neue", sans-serif;
        }
        .kps-body {
          display: grid;
          width: 120px;
          grid-template-columns: 1fr auto;
          gap: 4px 8px;
          font-size: 12px;
          line-height: 1.3;
        }
        .kps-row {
          display: contents;
        }
        .kps-row--hidden {
          display: none;
        }
        .kps-key {
          color: #cbd5e1;
          white-space: nowrap;
        }
        .kps-val {
          color: #86efac;
          text-align: right;
          font-weight: 700;
        }
        .kps-muted {
          color: #6b7280;
        }
        .kps-graph {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          height: 60px;
          margin-top: 8px;
          padding: 4px;
          background: rgba(0, 0, 0, 0.3);
          border-radius: 4px;
          gap: 1px;
          position: relative;
        }
        .kps-bar {
          flex: 1;
          background: linear-gradient(to top, #86efac, #34d399);
          border-radius: 2px 2px 0 0;
          min-height: 2px;
          transition: height 0.15s ease-out;
        }
        .kps-graph svg {
          position: absolute;
          top: 4px;
          left: 4px;
          right: 4px;
          bottom: 4px;
          width: calc(100% - 8px);
          height: calc(100% - 8px);
        }
      </style>
      <div class="kps-panel">
        <div class="kps-body">
          <div class="${renderRowClass("kps")}">
            <div class="kps-key">KPS</div>
            <div class="kps-val">${(state) => state.kps}</div>
          </div>
          <div class="${renderRowClass("avg")}">
            <div class="kps-key">AVG</div>
            <div class="kps-val">${(state) => state.avg}</div>
          </div>
          <div class="${renderRowClass("max")}">
            <div class="kps-key">MAX</div>
            <div class="kps-val">${(state) => state.max}</div>
          </div>
          <div class="${renderNoDataClass}">
            <div class="kps-key kps-muted">No data</div>
            <div class="kps-val kps-muted">-</div>
          </div>
        </div>
        ${renderGraph}
      </div>
    `;
  }

  // ===== KPS 패널 생성 =====
  async function createPanel(position) {
    const panelId = nextPanelId++;
    await saveNextPanelId();

    const settings = {
      ...JSON.parse(JSON.stringify(DEFAULT_PANEL_SETTINGS)),
      position: position || DEFAULT_PANEL_SETTINGS.position,
    };

    // 그래프 데이터 초기화
    const dataPoints = Math.ceil(settings.graphSpeed / GRAPH_UPDATE_MS);
    const initialState = {
      kps: currentKpsData.kps,
      avg: currentKpsData.avg,
      max: currentKpsData.max,
      visibility: settings.visibility,
      showGraph: settings.showGraph,
      graphType: settings.graphType,
      history: Array(dataPoints).fill(0),
      maxval: 1, // KeysPerSecond 평균값 지금까지 본 최댓값
    };

    // 개선된 방식: 함수를 직접 전달 (자동으로 핸들러 등록됨)
    const instance = window.api.ui.displayElement.add({
      position: settings.position,
      draggable: true,
      zIndex: 100,
      scoped: false,
      estimatedSize: { width: 250, height: 180 },
      contextMenu: {
        enableDelete: true,
        deleteLabel: "🗑️ KPS 패널 제거",
      },
      state: initialState,
      template: generateTemplate(panelId),
      onClick: async () => await handlePanelClick(panelId),
      onPositionChange: async (pos) => await handlePositionChange(panelId, pos),
      onDelete: async () => await handlePanelDelete(panelId),
    });

    panels.set(panelId, { instance, settings });
    await savePanels();
    return panelId;
  }

  // ===== KPS 패널 업데이트 =====
  // 모든 패널 업데이트
  function updateAllPanels() {
    const { kps, avg, max } = currentKpsData;

    for (const [panelId, panel] of panels.entries()) {
      const state = panel.instance.getState();

      // 그래프 데이터 업데이트 (좌측에서 스크롤)
      if (state.showGraph) {
        // KeysPerSecond 평균값 maxval 추적 (지금까지 본 최댓값)
        const newMaxval = Math.max(state.maxval, kps);
        let newHistory = [...state.history];
        newHistory.shift(); // 가장 오래된 데이터 제거
        newHistory.push(kps); // 새 데이터 추가

        // backlog 크기 조정
        const targetSize = Math.ceil(
          panel.settings.graphSpeed / GRAPH_UPDATE_MS
        );
        while (newHistory.length > targetSize) newHistory.shift();
        while (newHistory.length < targetSize) newHistory.unshift(0);

        // HTML 업데이트 (값 + 그래프 반영)
        panel.instance.setState({
          kps,
          avg,
          max,
          history: newHistory,
          maxval: newMaxval,
        });
      } else {
        panel.instance.setState({ kps, avg, max });
      }
    }
  }

  // ===== 위치 변경 핸들러 =====
  async function handlePositionChange(panelId, position) {
    const panel = panels.get(panelId);
    if (!panel) return;

    panel.settings.position = position;
    await savePanels();
  }

  // ===== 삭제 핸들러 =====
  async function handlePanelDelete(panelId) {
    const panel = panels.get(panelId);
    if (!panel) return;

    // 개선됨: 자동 delete 불필요 (자동으로 정리됨)
    panels.delete(panelId);
    await savePanels();
  }

  // ===== 설정 모달 열기 =====
  async function handlePanelClick(panelId) {
    const panel = panels.get(panelId);
    if (!panel) return;

    const state = panel.instance.getState();

    // 임시 설정값
    const tempSettings = {
      visibility: { ...state.visibility },
      showGraph: state.showGraph,
      graphType: state.graphType,
      graphSpeed: panel.settings.graphSpeed,
    };

    // 개선된 방식: 함수 직접 전달
    const kpsCheckbox = window.api.ui.components.checkbox({
      checked: state.visibility.kps,
      id: "kps-kps-checkbox",
      onChange: (checked) => {
        tempSettings.visibility.kps = checked;
      },
    });

    const avgCheckbox = window.api.ui.components.checkbox({
      checked: state.visibility.avg,
      id: "kps-avg-checkbox",
      onChange: (checked) => {
        tempSettings.visibility.avg = checked;
      },
    });

    const maxCheckbox = window.api.ui.components.checkbox({
      checked: state.visibility.max,
      id: "kps-max-checkbox",
      onChange: (checked) => {
        tempSettings.visibility.max = checked;
      },
    });

    const graphCheckbox = window.api.ui.components.checkbox({
      checked: state.showGraph,
      id: "kps-graph-checkbox",
      onChange: (checked) => {
        tempSettings.showGraph = checked;
      },
    });

    const graphTypeDropdown = window.api.ui.components.dropdown({
      options: [
        { value: "bar", label: "바 그래프" },
        { value: "line", label: "선 그래프" },
      ],
      selected: state.graphType,
      id: "kps-graph-type",
      onChange: (value) => {
        tempSettings.graphType = value;
      },
    });

    const graphSpeedInput = window.api.ui.components.input({
      type: "number",
      value: tempSettings.graphSpeed,
      min: 500,
      max: 5000,
      step: 100,
      width: 60,
      id: "kps-speed-input",
      onChange: (value) => {
        const num = parseInt(value, 10);
        if (!isNaN(num) && num > 0) tempSettings.graphSpeed = num;
      },
    });

    const formHtml = `
      <div class="flex flex-col gap-[16px] w-full">
        ${window.api.ui.components.formRow("KPS 표시", kpsCheckbox)}
        ${window.api.ui.components.formRow("AVG 표시", avgCheckbox)}
        ${window.api.ui.components.formRow("MAX 표시", maxCheckbox)}
        ${window.api.ui.components.formRow("그래프 표시", graphCheckbox)}
        ${window.api.ui.components.formRow("그래프 형태", graphTypeDropdown)}
        ${window.api.ui.components.formRow("그래프 속도 (ms)", graphSpeedInput)}
      </div>
    `;

    const confirmed = await window.api.ui.dialog.custom(formHtml, {
      title: "KPS 패널 설정",
      confirmText: "저장",
      showCancel: true,
    });

    if (confirmed) {
      panel.settings.visibility = tempSettings.visibility;
      panel.settings.showGraph = tempSettings.showGraph;
      panel.settings.graphType = tempSettings.graphType;
      panel.settings.graphSpeed = tempSettings.graphSpeed;

      // graphSpeed 변경 시 chartData 크기 조정
      const currentState = panel.instance.getState();
      const newSize = Math.ceil(tempSettings.graphSpeed / GRAPH_UPDATE_MS);
      let newHistory = [...currentState.history];
      const diff = newSize - newHistory.length;
      if (diff > 0) {
        // 크기 증가: 왼쪽에 0 추가
        newHistory = [...Array(diff).fill(0), ...newHistory];
      } else if (diff < 0) {
        // 크기 감소: 왼쪽에서 제거
        newHistory = newHistory.slice(-newSize);
      }

      panel.instance.setState({
        visibility: tempSettings.visibility,
        showGraph: tempSettings.showGraph,
        graphType: tempSettings.graphType,
        history: newHistory,
      });

      await savePanels();
    }
  }

  // ===== 그리드 컨텍스트 메뉴에 KPS 패널 추가 메뉴 등록 =====
  const menuId = window.api.ui.contextMenu.addGridMenuItem({
    id: "add-kps-panel",
    label: "📊 KPS 패널 추가",
    onClick: async (context) => {
      await createPanel({ x: context.position.dx, y: context.position.dy });
    },
  });

  // ===== 브릿지로 오버레이로부터 KPS 데이터 수신 =====
  const unsubBridge = window.api.bridge.on("KPS_UPDATE", (data) => {
    currentKpsData = {
      kps: data.kps || 0,
      avg: data.avg || 0,
      max: data.max || 0,
    };
    updateAllPanels();
  });

  // ===== 초기화 =====
  async function init() {
    nextPanelId = await loadNextPanelId();
    const savedPanels = await loadPanels();

    for (const savedPanel of savedPanels) {
      const panelId = savedPanel.id;
      const settings = {
        ...JSON.parse(JSON.stringify(DEFAULT_PANEL_SETTINGS)),
        ...savedPanel.settings,
        visibility: {
          ...DEFAULT_PANEL_SETTINGS.visibility,
          ...(savedPanel.settings?.visibility || {}),
        },
      };

      const dataPoints = Math.ceil(settings.graphSpeed / GRAPH_UPDATE_MS);
      const initialState = {
        kps: currentKpsData.kps,
        avg: currentKpsData.avg,
        max: currentKpsData.max,
        visibility: settings.visibility,
        showGraph: settings.showGraph,
        graphType: settings.graphType,
        history: Array(dataPoints).fill(0),
        maxval: 1,
      };

      // 개선된 방식: 함수를 직접 전달 (자동으로 핸들러 등록됨)
      const instance = window.api.ui.displayElement.add({
        position: settings.position,
        draggable: true,
        zIndex: 100,
        scoped: false,
        estimatedSize: { width: 250, height: 180 },
        contextMenu: {
          enableDelete: true,
          deleteLabel: "🗑️ KPS 패널 제거",
        },
        state: initialState,
        template: generateTemplate(panelId),
        onClick: async () => await handlePanelClick(panelId),
        onPositionChange: async (pos) =>
          await handlePositionChange(panelId, pos),
        onDelete: async () => await handlePanelDelete(panelId),
      });

      panels.set(panelId, { instance, settings });

      // 개선됨: 핸들러는 add() 시점 시 자동 등록되므로 별도 등록 불필요
      if (panelId >= nextPanelId) {
        nextPanelId = panelId + 1;
      }
    }
  }

  init();

  // ===== 클린업 등록 =====
  window.api.plugin.registerCleanup(() => {
    unsubBridge();
    window.api.ui.contextMenu.removeMenuItem(menuId);
    window.api.ui.displayElement.clearMyElements(); // 개선됨: 핸들러도 자동으로 정리됨
    delete window.__kpsCheckboxHandler;
  });
})();

// ===== 오버레이: KPS 계산 및 메인으로 전송 =====
(function () {
  // 오버레이 윈도우만 사용
  if (window.api.window.type !== "overlay") return;

  // 설정값
  const WINDOW_MS = 1000; // 집계 윈도우
  const REFRESH_MS = 50; // 계산 주기

  // 내부 상태
  let currentMode = null;
  let keyMap = {};
  let trackedKeys = new Set();
  const buckets = new Map(); // key => number[] (타임스탬프 배열)

  // 통계값
  let maxKps = 0;
  let kpsHistory = [];
  let lastKps = 0;

  // 옛날 타임스탬프 제거
  function pruneOld(now) {
    const cutoff = now - WINDOW_MS;
    for (const [k, arr] of buckets.entries()) {
      let w = 0;
      for (let i = 0; i < arr.length; i++) {
        if (arr[i] >= cutoff) arr[w++] = arr[i];
      }
      arr.length = w;
    }
  }

  function setTrackedKeys(mode) {
    trackedKeys.clear();
    const list = keyMap[mode] || [];
    for (const k of list) trackedKeys.add(k);
    for (const k of Array.from(buckets.keys())) {
      if (!trackedKeys.has(k)) buckets.delete(k);
    }
    // 모드 변경 시 초기화
    maxKps = 0;
    kpsHistory = [];
    lastKps = 0;
  }

  // KPS 계산 및 브로드캐스트
  function calculate() {
    const now = Date.now();
    pruneOld(now);

    let total = 0;
    for (const k of trackedKeys) {
      total += (buckets.get(k) || []).length;
    }

    // 통계 업데이트
    if (total !== lastKps && total > 0) {
      kpsHistory.push(total);
      maxKps = Math.max(maxKps, total);
      lastKps = total;
    }

    const avg =
      kpsHistory.length > 0
        ? Math.round(kpsHistory.reduce((a, b) => a + b, 0) / kpsHistory.length)
        : 0;

    // 메인 윈도우로 브릿지 전송 (Display Element 업데이트용)
    window.api.bridge.sendTo("main", "KPS_UPDATE", {
      kps: total,
      avg,
      max: maxKps,
    });
  }

  const timer = setInterval(calculate, REFRESH_MS);

  // 키 이벤트 구독
  const unsubKey = window.api.keys.onKeyState(({ key, state }) => {
    if (!trackedKeys.has(key) || state !== "DOWN") return;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(Date.now());
  });

  const unsubMode = window.api.keys.onModeChanged(({ mode }) => {
    currentMode = mode;
    setTrackedKeys(currentMode);
  });

  const unsubKeys = window.api.keys.onChanged((nextMap) => {
    keyMap = nextMap || {};
    setTrackedKeys(currentMode);
  });

  // 초기화
  (async () => {
    try {
      const boot = await window.api.app.bootstrap();
      keyMap = boot.keys || {};
      currentMode = boot.selectedKeyType || Object.keys(keyMap)[0] || "4key";
      setTrackedKeys(currentMode);
    } catch (error) {
      console.error("[KPS] 초기화 실패:", error);
    }
  })();

  // 클린업
  window.api.plugin.registerCleanup(() => {
    clearInterval(timer);
    unsubKey();
    unsubMode();
    unsubKeys();
  });
})();
