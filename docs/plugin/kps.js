// @id kps-counter

/**
 * KPS (Keys Per Second) 카운터 플러그인
 *
 * 주요 기능:
 * 1. 그리드 컨텍스트 메뉴에서 KPS 패널 추가 (다중 패널 지원)
 * 2. Display Element로 드래그 가능한 패널 구현
 * 3. 패널 클릭 시 KPS/AVG/MAX 표시 및 그래프 설정 모달
 * 4. 오버레이에서 계산된 KPS 데이터를 브릿지로 수신
 * 5. 실시간 그래프 표시 (Chart.js)
 * 6. 패널별 위치 및 설정값 영속성 보장
 */
(function () {
  // 메인 윈도우 전용
  if (window.api.window.type !== "main") {
    return;
  }

  // ===== 상태 관리 =====
  const panels = new Map(); // panelId => { elementId, settings, chartData, maxval }
  let currentKpsData = { kps: 0, avg: 0, max: 0 }; // 오버레이로부터 수신한 KPS 데이터
  let nextPanelId = 1;
  const GRAPH_UPDATE_MS = 100; // 그래프 업데이트 주기

  // 기본 설정
  const DEFAULT_PANEL_SETTINGS = {
    position: { x: 100, y: 100 },
    visibility: {
      kps: true,
      avg: true,
      max: true,
    },
    showGraph: true,
    graphType: "line", // "bar" 또는 "line"
    graphSpeed: 1000, // backlog (밀리초) - 그래프에 표시될 데이터 기간
  };

  // ===== 스토리지 초기화 =====
  async function loadPanels() {
    const saved = await window.api.plugin.storage.get("panels");
    if (saved && Array.isArray(saved)) {
      return saved;
    }
    return [];
  }

  async function savePanels() {
    const panelsData = Array.from(panels.entries()).map(([id, panel]) => ({
      id,
      settings: panel.settings,
    }));
    await window.api.plugin.storage.set("panels", panelsData);
  }

  async function saveNextPanelId() {
    await window.api.plugin.storage.set("nextPanelId", nextPanelId);
  }

  async function loadNextPanelId() {
    const saved = await window.api.plugin.storage.get("nextPanelId");
    return saved || 1;
  }

  // ===== KPS 패널 HTML 생성 =====
  function generatePanelHtml(panelId) {
    const panel = panels.get(panelId);
    if (!panel) return "";

    const { kps, avg, max } = currentKpsData;
    const { visibility, showGraph } = panel.settings;

    let rows = "";
    if (visibility.kps) {
      rows += `
        <div class="kps-key-${panelId}">KPS</div>
        <div class="kps-val-${panelId}">${kps}</div>
      `;
    }
    if (visibility.avg) {
      rows += `
        <div class="kps-key-${panelId}">AVG</div>
        <div class="kps-val-${panelId}">${avg}</div>
      `;
    }
    if (visibility.max) {
      rows += `
        <div class="kps-key-${panelId}">MAX</div>
        <div class="kps-val-${panelId}">${max}</div>
      `;
    }

    if (!rows) {
      rows = `
        <div class="kps-key-${panelId} kps-muted-${panelId}">No data</div>
        <div class="kps-val-${panelId} kps-muted-${panelId}">-</div>
      `;
    }

    // CSS 기반 그래프 생성 (KPS만 표시)
    let graphHtml = "";
    if (showGraph) {
      const history = panel.chartData || [];
      const graphType = panel.settings.graphType || "bar";
      const maxval = panel.maxval || 1; // KeysPerSecond 스타일: 지금까지 본 최대값

      if (graphType === "bar") {
        const bars = history
          .map((value, index) => {
            const height =
              maxval > 0 ? Math.min((value / maxval) * 100, 100) : 0;
            const opacity = 0.3 + (index / history.length) * 0.7;
            return `<div class="kps-bar-${panelId}" style="height: ${height}%; opacity: ${opacity};"></div>`;
          })
          .join("");

        graphHtml = `
          <div class="kps-graph-${panelId}">
            ${bars}
          </div>
        `;
      } else {
        // 선 그래프 + 평균선
        if (history.length === 0) {
          graphHtml = `<div class="kps-graph-${panelId}"></div>`;
        } else {
          // 라인 포인트 생성
          const linePoints = history
            .map((value, index) => {
              const x = (index / (history.length - 1)) * 100;
              const y = 100 - Math.min((value / maxval) * 100, 100);
              return `${x},${y}`;
            })
            .join(" ");

          // 면적 채우기용 polygon points (왼쪽 하단 → 라인 → 오른쪽 하단)
          const fillPoints = [
            "0,100", // 시작점 (왼쪽 하단)
            ...history.map((value, index) => {
              const x = (index / (history.length - 1)) * 100;
              const y = 100 - Math.min((value / maxval) * 100, 100);
              return `${x},${y}`;
            }),
            "100,100", // 끝점 (오른쪽 하단)
          ].join(" ");

          // 평균선 위치 계산
          const avgY = 100 - Math.min((avg / maxval) * 100, 100);

          graphHtml = `
            <div class="kps-graph-${panelId}">
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
                <!-- 면적 채우기 -->
                <polygon
                  points="${fillPoints}"
                  fill="url(#fillGradient-${panelId})"
                />
                <!-- 평균선 (KeysPerSecond 스타일) -->
                <line
                  x1="0" y1="${avgY}"
                  x2="100" y2="${avgY}"
                  stroke="#86EFAC"
                  stroke-width="1"
                  stroke-dasharray="2,2"
                  opacity="0.5"
                  vector-effect="non-scaling-stroke"
                />
                <!-- KPS 라인 -->
                <polyline
                  points="${linePoints}"
                  fill="none"
                  stroke="url(#lineGradient-${panelId})"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  vector-effect="non-scaling-stroke"
                />
              </svg>
            </div>
          `;
        }
      }
    }

    return `
      <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css" rel="stylesheet" />
      <style>
        .kps-panel-${panelId} {
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
          font-family: Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, "Helvetica Neue", sans-serif;
        }
        .kps-body-${panelId} {
          display: grid;
          width: 120px;
          grid-template-columns: 1fr auto;
          gap: 4px 8px;
          font-size: 12px;
          line-height: 1.3;
        }
        .kps-key-${panelId} {
          color: #CBD5E1;
          white-space: nowrap;
        }
        .kps-val-${panelId} {
          color: #86EFAC;
          text-align: right;
          font-weight: 700;
        }
        .kps-muted-${panelId} {
          color: #6B7280;
        }
        .kps-graph-${panelId} {
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
        .kps-bar-${panelId} {
          flex: 1;
          background: linear-gradient(to top, #86EFAC, #34D399);
          border-radius: 2px 2px 0 0;
          min-height: 2px;
          transition: height 0.15s ease-out;
        }
        .kps-graph-${panelId} svg {
          position: absolute;
          top: 4px;
          left: 4px;
          right: 4px;
          bottom: 4px;
          width: calc(100% - 8px);
          height: calc(100% - 8px);
        }
      </style>
      <div class="kps-panel-${panelId}">
        <div class="kps-body-${panelId}">
          ${rows}
        </div>
        ${graphHtml}
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
    const chartData = Array(dataPoints).fill(0);

    // panels.set을 먼저 호출 (generatePanelHtml에서 panels.get 사용)
    panels.set(panelId, {
      elementId: null, // 임시로 null
      settings,
      chartData,
      maxval: 1, // KeysPerSecond 스타일: 지금까지 본 최대값
    });

    // ✨ 개선: 함수를 직접 전달 (자동으로 핸들러 등록됨)
    const elementId = window.api.ui.displayElement.add({
      html: generatePanelHtml(panelId),
      position: settings.position,
      draggable: true,
      zIndex: 100,
      scoped: false,
      onClick: async () => await handlePanelClick(panelId),
      onPositionChange: async (pos) => await handlePositionChange(panelId, pos),
      onDelete: async () => await handlePanelDelete(panelId),
      estimatedSize: { width: 250, height: 180 },
      contextMenu: {
        enableDelete: true,
        deleteLabel: "🗑️ KPS 패널 제거",
      },
    });

    // elementId 업데이트
    panels.get(panelId).elementId = elementId;

    await savePanels();

    return panelId;
  }

  // ===== KPS 패널 업데이트 =====
  function updatePanel(panelId) {
    const panel = panels.get(panelId);
    if (!panel) return;

    window.api.ui.displayElement.update(panel.elementId, {
      html: generatePanelHtml(panelId),
    });
  }

  // ===== 모든 패널 업데이트 =====
  function updateAllPanels() {
    const { kps, avg, max } = currentKpsData;

    for (const [panelId, panel] of panels.entries()) {
      // 그래프 데이터 업데이트 (좌→우 스크롤)
      if (panel.settings.showGraph) {
        // KeysPerSecond 스타일: maxval 추적 (지금까지 본 최대값)
        if (kps > panel.maxval) {
          panel.maxval = kps;
        }

        panel.chartData.shift(); // 가장 오래된 데이터 제거
        panel.chartData.push(kps); // 새 데이터 추가

        // backlog 크기 조정
        const targetSize = Math.ceil(
          panel.settings.graphSpeed / GRAPH_UPDATE_MS
        );
        while (panel.chartData.length > targetSize) {
          panel.chartData.shift();
        }
        while (panel.chartData.length < targetSize) {
          panel.chartData.unshift(0);
        }
      }

      // HTML 업데이트 (값 + 그래프 반영)
      window.api.ui.displayElement.update(panel.elementId, {
        html: generatePanelHtml(panelId),
      });
    }
  } // ===== 위치 변경 핸들러 =====
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

    // ✨ 개선: 수동 delete 불필요 (자동으로 정리됨)
    panels.delete(panelId);
    await savePanels();
  }

  // ===== 설정 모달 열기 =====
  async function handlePanelClick(panelId) {
    const panel = panels.get(panelId);
    if (!panel) return;

    const { visibility, showGraph, graphType, graphSpeed } = panel.settings;

    // 임시 설정값
    const tempSettings = {
      visibility: { ...visibility },
      showGraph,
      graphType: graphType || "bar",
      graphSpeed: graphSpeed !== undefined ? graphSpeed : 3000,
    };

    // ✨ 개선된 방식: 함수 직접 전달
    const kpsCheckbox = window.api.ui.components.checkbox({
      checked: visibility.kps,
      id: "kps-kps-checkbox",
      onChange: (checked) => {
        tempSettings.visibility.kps = checked;
      },
    });

    const avgCheckbox = window.api.ui.components.checkbox({
      checked: visibility.avg,
      id: "kps-avg-checkbox",
      onChange: (checked) => {
        tempSettings.visibility.avg = checked;
      },
    });

    const maxCheckbox = window.api.ui.components.checkbox({
      checked: visibility.max,
      id: "kps-max-checkbox",
      onChange: (checked) => {
        tempSettings.visibility.max = checked;
      },
    });

    const graphCheckbox = window.api.ui.components.checkbox({
      checked: showGraph,
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
      selected: tempSettings.graphType,
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
      onInput: (value) => {
        const num = parseInt(value, 10);
        if (!isNaN(num) && num > 0) {
          tempSettings.graphSpeed = num;
        }
      },
      onChange: (value) => {
        const num = parseInt(value, 10);
        if (!isNaN(num) && num > 0) {
          tempSettings.graphSpeed = num;
        }
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
      panel.settings.visibility = { ...tempSettings.visibility };
      panel.settings.showGraph = tempSettings.showGraph;
      panel.settings.graphType = tempSettings.graphType;
      panel.settings.graphSpeed = tempSettings.graphSpeed;

      // graphSpeed 변경 시 chartData 크기 조정
      const newSize = Math.ceil(tempSettings.graphSpeed / GRAPH_UPDATE_MS);
      if (panel.chartData.length !== newSize) {
        const diff = newSize - panel.chartData.length;
        if (diff > 0) {
          // 크기 증가: 앞에 0 추가
          panel.chartData = [...Array(diff).fill(0), ...panel.chartData];
        } else {
          // 크기 감소: 앞에서 제거
          panel.chartData = panel.chartData.slice(-newSize);
        }
      }

      await savePanels();
      updatePanel(panelId);
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
      const chartData = Array(dataPoints).fill(0);

      // panels.set을 먼저 호출 (generatePanelHtml에서 panels.get 사용)
      panels.set(panelId, {
        elementId: null, // 임시로 null
        settings,
        chartData,
        maxval: 1,
      });

      // ✨ 개선: 함수를 직접 전달 (자동으로 핸들러 등록됨)
      const elementId = window.api.ui.displayElement.add({
        html: generatePanelHtml(panelId),
        position: settings.position,
        draggable: true,
        zIndex: 100,
        scoped: false,
        onClick: async () => await handlePanelClick(panelId),
        onPositionChange: async (pos) =>
          await handlePositionChange(panelId, pos),
        onDelete: async () => await handlePanelDelete(panelId),
        estimatedSize: { width: 250, height: 180 },
        contextMenu: {
          enableDelete: true,
          deleteLabel: "🗑️ KPS 패널 제거",
        },
      });

      // elementId 업데이트
      panels.get(panelId).elementId = elementId;

      // ✨ 개선: 핸들러는 add() 호출 시 자동 등록되므로 별도 등록 불필요

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
    window.api.ui.displayElement.clearMyElements(); // ✨ 개선: 핸들러도 자동으로 정리됨

    delete window.__kpsCheckboxHandler;
  });
})();

// ===== 오버레이: KPS 계산 및 메인으로 전송 =====
(function () {
  // 오버레이 윈도우 전용
  if (window.api.window.type !== "overlay") {
    return;
  }

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

  // 유틸리티
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
