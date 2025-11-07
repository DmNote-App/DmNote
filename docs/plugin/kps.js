(function () {
  // 재주입 시 기존 리소스 정리
  if (window.__dmn_cps_cleanup) window.__dmn_cps_cleanup();
  if (window.__dmn_custom_js_cleanup) window.__dmn_custom_js_cleanup();

  // 오버레이 윈도우 전용 
  if (window.__dmn_window_type !== "overlay") {
    return;
  }

  // 설정값
  const WINDOW_MS = 1000; // 집계 윈도우
  const REFRESH_MS = 100; // 패널 갱신 주기
  const PANEL_POS = { top: 10, right: 10 }; // 패널 위치
  const FONT_SIZE = 12; // 글자 크기

  // 내부 상태
  let disposed = false;
  let currentMode = null;
  let keyMap = {}; // { mode: string[] }
  let trackedKeys = new Set(); // 현재 모드의 키들
  const buckets = new Map(); // key => number[] (타임스탬프 ms 배열)

  // AVG/MAX 누적값
  let maxKps = 0;
  let kpsHistory = []; // 각 사이클의 KPS 기록
  let lastRenderKps = 0; // 마지막 렌더링에서의 KPS

  // UI 구성
  const style = document.createElement("style");
  style.textContent = `
  .dmn-cps-panel {
    position: fixed;
    top: ${PANEL_POS.top}px;
    right: ${PANEL_POS.right}px;
    z-index: 999999;
    background: rgba(17, 17, 20, 0.88);
    color: #fff;
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 8px;
    padding: 8px;
    min-width: 100px;
    max-width: 260px;
    backdrop-filter: blur(3px);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    box-shadow: 0 8px 24px rgba(0,0,0,0.35);
  }
  .dmn-cps-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 6px;
    font-size: ${FONT_SIZE + 2}px;
  }
  .dmn-cps-body {
    display: grid; grid-template-columns: 1fr auto; gap: 4px 8px;
    font-size: ${FONT_SIZE}px; line-height: 1.3;
    max-height: 320px; overflow: auto;
  }
  .dmn-cps-key { color: #CBD5E1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dmn-cps-val { color: #86EFAC; text-align: right; }
  .dmn-cps-muted { color: #6B7280; }
  .dmn-cps-controls { display: flex; gap: 6px; }
  .dmn-cps-chip {
    font-size: ${FONT_SIZE - 1}px;
    background: #2a2a31; color: #DBDEE8; border: 1px solid #3A3944;
    padding: 2px 6px; border-radius: 999px; cursor: pointer;
  }
  .dmn-cps-chip[disabled] { opacity: .5; cursor: not-allowed; }
  `;
  document.head.appendChild(style);

  const panel = document.createElement("div");
  panel.className = "dmn-cps-panel";
  panel.innerHTML = `
    <div class=\"dmn-cps-header\">
      <div>Keys per Second</div>
    </div>
    <div class=\"dmn-cps-body\" id=\"dmn-cps-body\">
      <div class=\"dmn-cps-key dmn-cps-muted\">Loading...</div>
      <div class=\"dmn-cps-val dmn-cps-muted\">-</div>
    </div>
  `;
  document.body.appendChild(panel);
  const bodyEl = panel.querySelector("#dmn-cps-body");

  // 유틸리티 함수
  function ensureKeyBucket(k) {
    if (!buckets.has(k)) buckets.set(k, []);
    return buckets.get(k);
  }

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

  function setTrackedKeysFromMode(mode) {
    trackedKeys.clear();
    const list = keyMap[mode] || [];
    for (const k of list) trackedKeys.add(k);
    for (const k of Array.from(buckets.keys())) {
      if (!trackedKeys.has(k)) buckets.delete(k);
    }
    // 모드 변경시 누적값 초기화
    maxKps = 0;
    kpsHistory = [];
    lastRenderKps = 0;
  }

  // 렌더링
  function render() {
    if (!bodyEl) return;
    const now = Date.now();
    pruneOld(now);

    let total = 0;
    for (const k of trackedKeys) {
      total += (buckets.get(k) || []).length;
    }

    // 현재 KPS가 이전과 달라지면 기록
    if (total !== lastRenderKps) {
      if (total > 0) {
        kpsHistory.push(total);
        maxKps = Math.max(maxKps, total);
      }
      lastRenderKps = total;
    }

    const avg =
      kpsHistory.length > 0
        ? Math.round(kpsHistory.reduce((a, b) => a + b, 0) / kpsHistory.length)
        : 0;

    bodyEl.innerHTML = `
      <div class=\"dmn-cps-key\">TOTAL</div>
      <div class=\"dmn-cps-val\">${total}</div>
      <div class=\"dmn-cps-key\">AVG</div>
      <div class=\"dmn-cps-val\">${avg}</div>
      <div class=\"dmn-cps-key\">MAX</div>
      <div class=\"dmn-cps-val\">${maxKps}</div>`;
  }

  const refreshTimer = setInterval(render, REFRESH_MS);

  // 이벤트 구독
  const unsubscribers = [];

  function onKeyState({ key, state }) {
    if (!trackedKeys.has(key)) return;
    if (state !== "DOWN") return;
    const now = Date.now();
    const arr = ensureKeyBucket(key);
    arr.push(now);
  }

  async function bootstrap() {
    try {
      if (!window.api) throw new Error("api unavailable");
      const boot = await window.api.app.bootstrap();
      keyMap = boot.keys || (await window.api.keys.get()) || {};
      currentMode =
        boot.selectedKeyType ||
        boot.currentMode ||
        Object.keys(keyMap)[0] ||
        "4key";
      setTrackedKeysFromMode(currentMode);

      unsubscribers.push(window.api.keys.onKeyState(onKeyState));
      unsubscribers.push(
        window.api.keys.onModeChanged(({ mode }) => {
          currentMode = mode;
          setTrackedKeysFromMode(currentMode);
        })
      );
      unsubscribers.push(
        window.api.keys.onChanged((nextMap) => {
          keyMap = nextMap || {};
          setTrackedKeysFromMode(currentMode);
        })
      );
    } catch (err) {
      bodyEl.innerHTML = `
        <div class=\"dmn-cps-key dmn-cps-muted\">API not available</div>
        <div class=\"dmn-cps-val dmn-cps-muted\">-</div>
      `;
      console.error("[CPS] bootstrap failed:", err);
    }
  }

  bootstrap();

  // cleanup 함수 (재주입/비활성화 대비)
  const __cleanup = function () {
    if (disposed) return;
    disposed = true;
    try {
      clearInterval(refreshTimer);
    } catch {}
    try {
      for (const un of unsubscribers) {
        try {
          un && un();
        } catch {}
      }
    } catch {}
    try {
      panel.remove();
    } catch {}
    try {
      style.remove();
    } catch {}
    delete window.__dmn_cps_cleanup;
    delete window.__dmn_custom_js_cleanup;
  };
  window.__dmn_cps_cleanup = __cleanup;
  window.__dmn_custom_js_cleanup = __cleanup;
})();
