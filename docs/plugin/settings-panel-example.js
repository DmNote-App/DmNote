// @id: settings-panel-example

/**
 * 스토리지 활용 예제: 사용자 설정 패널
 *
 * 이 플러그인은 오버레이에 커스터마이징 가능한 패널을 표시하며,
 * 모든 설정을 window.api.plugin.storage를 통해 영속화합니다.
 *
 * 기능:
 * - 드래그로 패널 위치 변경
 * - 색상, 크기, 투명도 조절
 * - 설정 자동 저장 및 복원
 * - 초기화 기능
 *
 * 참고: 플러그인별 스토리지는 자동으로 네임스페이스가 분리됩니다.
 * prefix를 수동으로 관리할 필요가 없으며, 플러그인 삭제 시 모든 데이터가 자동으로 정리됩니다.
 */

(function () {
  // 재주입 대비 기존 리소스 정리
  if (window.__dmn_custom_js_cleanup) window.__dmn_custom_js_cleanup();

  // 메인 전용
  if (window.__dmn_window_type == "overlay") return;

  // 기본 설정값
  const DEFAULT_SETTINGS = {
    position: { x: 10, y: 10 },
    size: { width: 250, height: 300 },
    backgroundColor: "#2d2d3a",
    textColor: "#ffffff",
    opacity: 0.9,
    fontSize: 12,
    showStats: true,
    showHistory: true,
  };

  let settings = null;
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };
  let keyPressCount = 0;
  let keyHistory = [];
  const MAX_HISTORY = 10;

  // === UI 생성 ===
  const style = document.createElement("style");
  style.textContent = `
    .storage-demo-panel {
      position: fixed;
      display: flex;
      flex-direction: column;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      font-family: 'Segoe UI', Arial, sans-serif;
      user-select: none;
      z-index: 999999;
      transition: opacity 0.3s;
    }
    .storage-demo-header {
      padding: 10px;
      background: rgba(0, 0, 0, 0.2);
      border-radius: 8px 8px 0 0;
      cursor: move;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: 600;
      font-size: 13px;
    }
    .storage-demo-body {
      padding: 12px;
      flex: 1;
      overflow-y: auto;
      font-size: 11px;
    }
    .storage-demo-section {
      margin-bottom: 12px;
    }
    .storage-demo-section h4 {
      margin: 0 0 6px 0;
      font-size: 11px;
      opacity: 0.7;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .storage-demo-stat {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    .storage-demo-control {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 0;
    }
    .storage-demo-control label {
      font-size: 11px;
      flex: 1;
    }
    .storage-demo-control input[type="color"],
    .storage-demo-control input[type="range"] {
      cursor: pointer;
    }
    .storage-demo-button {
      background: rgba(255, 255, 255, 0.1);
      border: none;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 10px;
      transition: background 0.2s;
    }
    .storage-demo-button:hover {
      background: rgba(255, 255, 255, 0.2);
    }
    .storage-demo-button.danger {
      background: rgba(255, 59, 48, 0.3);
    }
    .storage-demo-button.danger:hover {
      background: rgba(255, 59, 48, 0.5);
    }
    .storage-demo-history-item {
      font-size: 10px;
      padding: 2px 0;
      opacity: 0.8;
    }
  `;
  document.head.appendChild(style);

  const panel = document.createElement("div");
  panel.className = "storage-demo-panel";
  panel.innerHTML = `
    <div class="storage-demo-header">
      <span>⚙️ 커스텀 패널</span>
      <button class="storage-demo-button danger" id="reset-settings">초기화</button>
    </div>
    <div class="storage-demo-body">
      <!-- 통계 -->
      <div class="storage-demo-section">
        <h4>📊 통계</h4>
        <div class="storage-demo-stat">
          <span>총 키 입력:</span>
          <span id="total-keys">0</span>
        </div>
      </div>

      <!-- 최근 키 히스토리 -->
      <div class="storage-demo-section">
        <h4>📜 최근 키 입력</h4>
        <div id="key-history"></div>
      </div>

      <!-- 설정 -->
      <div class="storage-demo-section">
        <h4>🎨 설정</h4>
        
        <div class="storage-demo-control">
          <label for="bg-color">배경색:</label>
          <input type="color" id="bg-color" />
        </div>
        
        <div class="storage-demo-control">
          <label for="text-color">글자색:</label>
          <input type="color" id="text-color" />
        </div>
        
        <div class="storage-demo-control">
          <label for="opacity">투명도: <span id="opacity-value">90</span>%</label>
          <input type="range" id="opacity" min="10" max="100" />
        </div>
        
        <div class="storage-demo-control">
          <label for="font-size">글자 크기: <span id="font-size-value">12</span>px</label>
          <input type="range" id="font-size" min="10" max="20" />
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  // 요소 참조
  const header = panel.querySelector(".storage-demo-header");
  const totalKeysEl = panel.querySelector("#total-keys");
  const historyEl = panel.querySelector("#key-history");
  const bgColorInput = panel.querySelector("#bg-color");
  const textColorInput = panel.querySelector("#text-color");
  const opacityInput = panel.querySelector("#opacity");
  const opacityValueEl = panel.querySelector("#opacity-value");
  const fontSizeInput = panel.querySelector("#font-size");
  const fontSizeValueEl = panel.querySelector("#font-size-value");
  const resetButton = panel.querySelector("#reset-settings");

  // === 설정 관련 함수 ===
  async function loadSettings() {
    settings = (await window.api.plugin.storage.get("settings")) || {
      ...DEFAULT_SETTINGS,
    };

    // 히스토리 별도 로드
    keyHistory = (await window.api.plugin.storage.get("history")) || [];
    keyPressCount = (await window.api.plugin.storage.get("press-count")) || 0;

    applySettings();
  }

  async function saveSettings() {
    await window.api.plugin.storage.set("settings", settings);
  }

  async function saveHistory() {
    // 빈 값은 저장하지 않음 (불필요한 스토리지 키 생성 방지)
    if (keyHistory.length > 0) {
      await window.api.plugin.storage.set("history", keyHistory);
    }
    if (keyPressCount > 0) {
      await window.api.plugin.storage.set("press-count", keyPressCount);
    }
  }

  function applySettings() {
    // 패널 위치 및 크기
    panel.style.left = settings.position.x + "px";
    panel.style.top = settings.position.y + "px";
    panel.style.width = settings.size.width + "px";
    panel.style.height = settings.size.height + "px";

    // 색상 및 스타일
    panel.style.backgroundColor = settings.backgroundColor;
    panel.style.color = settings.textColor;
    panel.style.opacity = settings.opacity;
    panel.style.fontSize = settings.fontSize + "px";

    // 입력 요소 값 설정
    bgColorInput.value = settings.backgroundColor;
    textColorInput.value = settings.textColor;
    opacityInput.value = settings.opacity * 100;
    opacityValueEl.textContent = Math.round(settings.opacity * 100);
    fontSizeInput.value = settings.fontSize;
    fontSizeValueEl.textContent = settings.fontSize;

    // 통계 표시
    totalKeysEl.textContent = keyPressCount;
    updateHistoryDisplay();
  }

  function updateHistoryDisplay() {
    if (keyHistory.length === 0) {
      historyEl.innerHTML = '<div style="opacity: 0.5;">입력 기록 없음</div>';
      return;
    }

    historyEl.innerHTML = keyHistory
      .slice(-MAX_HISTORY)
      .reverse()
      .map((item) => {
        const time = new Date(item.timestamp).toLocaleTimeString();
        return `<div class="storage-demo-history-item">${item.key} - ${time}</div>`;
      })
      .join("");
  }

  async function resetSettings() {
    const confirmed = confirm(
      "모든 설정과 데이터를 초기화하시겠습니까?\n(패널 위치, 색상, 히스토리 등)"
    );
    if (!confirmed) return;

    // 스토리지 완전 초기화 (이 플러그인의 모든 데이터)
    await window.api.plugin.storage.clear();

    // 기본값으로 복원
    settings = { ...DEFAULT_SETTINGS };
    keyHistory = [];
    keyPressCount = 0;

    applySettings();
    await saveSettings();
    await saveHistory();

    console.log("[Settings Panel] 설정이 초기화되었습니다.");
  }

  // === 이벤트 핸들러 ===

  // 드래그로 위치 변경
  header.addEventListener("mousedown", (e) => {
    isDragging = true;
    dragOffset.x = e.clientX - settings.position.x;
    dragOffset.y = e.clientY - settings.position.y;
    panel.style.cursor = "grabbing";
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;

    settings.position.x = e.clientX - dragOffset.x;
    settings.position.y = e.clientY - dragOffset.y;

    panel.style.left = settings.position.x + "px";
    panel.style.top = settings.position.y + "px";
  });

  document.addEventListener("mouseup", async () => {
    if (isDragging) {
      isDragging = false;
      panel.style.cursor = "default";
      await saveSettings();
      console.log("[Settings Panel] 위치 저장됨:", settings.position);
    }
  });

  // 색상 변경
  bgColorInput.addEventListener("change", async (e) => {
    settings.backgroundColor = e.target.value;
    panel.style.backgroundColor = settings.backgroundColor;
    await saveSettings();
  });

  textColorInput.addEventListener("change", async (e) => {
    settings.textColor = e.target.value;
    panel.style.color = settings.textColor;
    await saveSettings();
  });

  // 투명도 변경
  opacityInput.addEventListener("input", async (e) => {
    settings.opacity = e.target.value / 100;
    panel.style.opacity = settings.opacity;
    opacityValueEl.textContent = e.target.value;
  });

  opacityInput.addEventListener("change", async () => {
    await saveSettings();
  });

  // 글자 크기 변경
  fontSizeInput.addEventListener("input", async (e) => {
    settings.fontSize = parseInt(e.target.value);
    panel.style.fontSize = settings.fontSize + "px";
    fontSizeValueEl.textContent = settings.fontSize;
  });

  fontSizeInput.addEventListener("change", async () => {
    await saveSettings();
  });

  // 초기화 버튼
  resetButton.addEventListener("click", resetSettings);

  // 키 입력 감지
  const unsubKeyState = window.api.keys.onKeyState(async ({ key, state }) => {
    if (state !== "DOWN") return;

    keyPressCount++;
    keyHistory.push({
      key,
      timestamp: Date.now(),
    });

    // 최대 히스토리 개수 제한
    if (keyHistory.length > MAX_HISTORY * 2) {
      keyHistory = keyHistory.slice(-MAX_HISTORY);
    }

    totalKeysEl.textContent = keyPressCount;
    updateHistoryDisplay();

    // 5회 입력마다 자동 저장 (성능 고려)
    if (keyPressCount % 5 === 0) {
      await saveHistory();
    }
  });

  // === 초기화 ===
  loadSettings().then(() => {
    console.log("[Settings Panel] 설정 로드 완료");
  });

  // === 클린업 ===
  window.__dmn_custom_js_cleanup = async function () {
    // 마지막 히스토리 저장
    await saveHistory();

    unsubKeyState();
    panel.remove();
    style.remove();
    delete window.__dmn_custom_js_cleanup;

    console.log("[Settings Panel] 클린업 완료");
  };
})();
