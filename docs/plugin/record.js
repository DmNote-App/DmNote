(function () {
  // 재주입 시 기존 리소스 정리
  if (window.__dmn_custom_js_cleanup) window.__dmn_custom_js_cleanup();

  // 메인 윈도우 전용
  if (window.__dmn_window_type !== "main") {
    return;
  }

  // 상태 관리
  let disposed = false;
  let isRecording = false;
  let recordedData = []; // { key: string, action: 'DOWN'|'UP', timestamp: number }
  let recordingStartTime = 0;

  // UI 요소
  let recordButton = null;
  let statusIndicator = null;
  let buttonObserver = null;
  let insertInterval = null;

  // 스타일 추가
  const style = document.createElement("style");
  style.textContent = `
    .dmn-record-button {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 40px;
      padding: 5px;
      background: #000000;
      border-radius: 7px;
      cursor: pointer;
      font-family: ui-sans-serif, system-ui, sans-serif;
      font-size: 14px;
      color: #DBDEE8;
      border: none;
      outline: none;
      user-select: none;
    }
    .dmn-record-button:hover .dmn-record-button-inner {
      background: rgba(255, 255, 255, 0.08);
    }
    .dmn-record-button:active .dmn-record-button-inner {
      background: rgba(255, 255, 255, 0.12);
    }
    .dmn-record-button-inner {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      flex: 1;
      height: 30px;
      border-radius: 7px;
      transition: background 0.2s;
      padding: 0 8px;
    }
    .dmn-record-indicator {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #6B7280;
      transition: all 0.3s;
    }
    .dmn-record-indicator.recording {
      background: #EF4444;
      animation: dmn-record-pulse 1.5s ease-in-out infinite;
    }
    @keyframes dmn-record-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    .dmn-record-text {
      font-weight: 500;
      letter-spacing: 0.02em;
    }
  `;
  document.head.appendChild(style);

  // 녹화 버튼 생성 및 삽입
  function createRecordButton() {
    // 이미 버튼이 있으면 재사용
    if (!recordButton) {
      recordButton = document.createElement("button");
      recordButton.className = "dmn-record-button";
      recordButton.innerHTML = `
        <div class="dmn-record-button-inner">
          <div class="dmn-record-indicator"></div>
          <span class="dmn-record-text">녹화</span>
        </div>
      `;

      statusIndicator = recordButton.querySelector(".dmn-record-indicator");
      recordButton.addEventListener("click", toggleRecording);
    }

    // 버튼 삽입 로직
    const insertButton = () => {
      // 이미 DOM에 존재하면 스킵
      if (document.body.contains(recordButton)) {
        return true;
      }

      // 툴바의 왼쪽 섹션 찾기 (TabTool이 있는 영역)
      const toolbar = document.querySelector(
        "div.flex.flex-row.items-center.w-full.h-\\[60px\\]"
      );
      if (!toolbar) {
        return false;
      }

      // 툴바의 첫 번째 자식 찾기
      const leftSection = toolbar.firstElementChild;
      if (!leftSection) {
        return false;
      }

      // 버튼을 왼쪽 섹션에 추가
      if (leftSection.classList && leftSection.classList.contains("flex")) {
        // 기존 wrapper 찾기 또는 새로 생성
        let wrapper = leftSection.querySelector(".dmn-record-wrapper");
        if (!wrapper) {
          wrapper = document.createElement("div");
          wrapper.className = "dmn-record-wrapper flex gap-[10px]";
          leftSection.appendChild(wrapper);
        }
        wrapper.appendChild(recordButton);
        console.log("[Record] Button inserted");
        return true;
      }

      return false;
    };

    // 즉시 삽입 시도
    if (!insertButton()) {
      // 실패하면 주기적으로 재시도
      let retryCount = 0;
      const maxRetries = 20;
      insertInterval = setInterval(() => {
        if (insertButton() || retryCount >= maxRetries) {
          clearInterval(insertInterval);
          insertInterval = null;
          if (retryCount >= maxRetries) {
            console.warn("[Record] Failed to insert button after max retries");
          }
        }
        retryCount++;
      }, 100);
    }

    // DOM 변경 감지 (설정창 등으로 이동 후 돌아올 때)
    if (!buttonObserver) {
      buttonObserver = new MutationObserver(() => {
        // 버튼이 DOM에서 사라졌는지 체크
        if (recordButton && !document.body.contains(recordButton)) {
          console.log("[Record] Button removed from DOM, re-inserting...");
          // 짧은 지연 후 재삽입 (React 렌더링 완료 대기)
          setTimeout(() => {
            insertButton();
          }, 50);
        }
      });

      // body 전체를 감시
      buttonObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }
  }

  // 녹화 시작/종료 토글
  async function toggleRecording() {
    if (isRecording) {
      // 녹화 종료 및 저장
      await stopRecording();
    } else {
      // 녹화 시작
      startRecording();
    }
  }

  // 녹화 시작
  function startRecording() {
    isRecording = true;
    recordedData = [];
    recordingStartTime = Date.now();

    // UI 업데이트
    if (statusIndicator) {
      statusIndicator.classList.add("recording");
    }
    if (recordButton) {
      recordButton.querySelector(".dmn-record-text").textContent = "녹화 중지";
    }

    console.log("[Record] Recording started");
  }

  // 녹화 종료 및 저장
  async function stopRecording() {
    isRecording = false;

    // UI 업데이트
    if (statusIndicator) {
      statusIndicator.classList.remove("recording");
    }
    if (recordButton) {
      recordButton.querySelector(".dmn-record-text").textContent = "녹화";
    }

    console.log(
      "[Record] Recording stopped. Total events:",
      recordedData.length
    );

    // 데이터가 있으면 저장 다이얼로그 표시
    if (recordedData.length > 0) {
      await saveRecording();
    } else {
      console.log("[Record] No data to save");
    }

    // 데이터 초기화
    recordedData = [];
    recordingStartTime = 0;
  }

  // 밀리초를 분:초.밀리초 형식으로 변환
  function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = ms % 1000;

    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
      2,
      "0"
    )}.${String(milliseconds).padStart(3, "0")}`;
  }

  // 녹화 데이터 저장
  async function saveRecording() {
    try {
      // JSON 데이터 생성
      const exportData = {
        version: "1.0",
        recordedAt: new Date(recordingStartTime).toISOString(),
        duration: Date.now() - recordingStartTime,
        totalEvents: recordedData.length,
        events: recordedData.map((event) => {
          const relativeMs = event.timestamp - recordingStartTime;
          return {
            key: event.key,
            action: event.action,
            time: formatTime(relativeMs), // 분:초.밀리초 형식
            relativeMs: relativeMs,
          };
        }),
      };

      const jsonString = JSON.stringify(exportData, null, 2);

      // 브라우저 다운로드 API 사용
      const defaultFileName = `recording_${new Date(recordingStartTime)
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19)}.json`;

      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = defaultFileName;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();

      // 클린업
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);

      console.log("[Record] File download started:", defaultFileName);
      alert(`녹화 파일이 다운로드됩니다!\n${defaultFileName}`);
    } catch (error) {
      console.error("[Record] Failed to save recording:", error);
      alert("녹화 파일 저장에 실패했습니다. 콘솔을 확인해주세요.");
    }
  }

  // 키 입력 이벤트 핸들러
  function onKeyState({ key, state }) {
    if (!isRecording) return;

    const event = {
      key,
      action: state, // 'DOWN' or 'UP'
      timestamp: Date.now(),
    };

    recordedData.push(event);
  }

  // 이벤트 구독
  const unsubscribers = [];

  async function bootstrap() {
    try {
      if (!window.api) {
        throw new Error("API not available");
      }

      // 키 입력 이벤트 구독
      unsubscribers.push(window.api.keys.onKeyState(onKeyState));

      // 버튼 생성
      createRecordButton();

      console.log("[Record] Bootstrap completed");
    } catch (error) {
      console.error("[Record] Bootstrap failed:", error);
    }
  }

  // 초기화
  bootstrap();

  // 클린업 함수
  const __cleanup = function () {
    if (disposed) return;
    disposed = true;

    console.log("[Record] Cleanup started");

    // 녹화 중이면 중지
    if (isRecording) {
      isRecording = false;
      recordedData = [];
    }

    // MutationObserver 정리
    try {
      if (buttonObserver) {
        buttonObserver.disconnect();
        buttonObserver = null;
      }
    } catch (e) {
      console.error("[Record] Observer cleanup error:", e);
    }

    // Interval 정리
    try {
      if (insertInterval) {
        clearInterval(insertInterval);
        insertInterval = null;
      }
    } catch (e) {
      console.error("[Record] Interval cleanup error:", e);
    }

    // 이벤트 구독 해제
    try {
      for (const unsub of unsubscribers) {
        try {
          unsub && unsub();
        } catch (e) {
          console.error("[Record] Unsubscribe error:", e);
        }
      }
    } catch (e) {
      console.error("[Record] Cleanup error:", e);
    }

    // DOM 정리
    try {
      if (recordButton) {
        recordButton.remove();
        recordButton = null;
      }
    } catch (e) {
      console.error("[Record] Button removal error:", e);
    }

    try {
      if (style) {
        style.remove();
      }
    } catch (e) {
      console.error("[Record] Style removal error:", e);
    }

    delete window.__dmn_custom_js_cleanup;

    console.log("[Record] Cleanup completed");
  };

  window.__dmn_custom_js_cleanup = __cleanup;
})();
