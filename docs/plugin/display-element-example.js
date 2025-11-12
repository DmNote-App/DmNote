// @id display-element-demo
// Display Element API 데모: 타이머 위젯 (내장 컨텍스트 메뉴 사용)

(function () {
  if (window.__dmn_custom_js_cleanup) window.__dmn_custom_js_cleanup();
  if (window.__dmn_window_type !== "main") return;

  console.log("[Display Element Demo] 플러그인 로드됨");

  const timers = new Map(); // timerId -> { elementId, interval, seconds }
  let timerCounter = 0;
  const createTimer = (x, y, initialSeconds = 0) => {
    timerCounter++;
    const timerId = `timer-${timerCounter}`;
    let seconds = initialSeconds;

    // HTML 생성 함수
    const getTimerHtml = (time) => {
      const mins = Math.floor(time / 60);
      const secs = time % 60;
      const timeStr = `${String(mins).padStart(2, "0")}:${String(secs).padStart(
        2,
        "0"
      )}`;

      return `
        <div style="
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 20px 30px;
          border-radius: 12px;
          font-size: 28px;
          font-weight: bold;
          text-align: center;
          cursor: move;
          user-select: none;
          box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        ">
          ⏱️ ${timeStr}
        </div>
      `;
    };

    // Display Element 추가 (커스텀 컨텍스트 메뉴)
    const elementId = window.api.ui.displayElement.add({
      html: getTimerHtml(seconds),
      position: { x, y },
      draggable: true,
      estimatedSize: { width: 150, height: 80 },
      contextMenu: {
        enableDelete: true,
        deleteLabel: "🗑️ 타이머 삭제", // 삭제 텍스트 커스터마이징
        customItems: [
          {
            id: "duplicate",
            label: "📋 복제",
            onClick: ({ element }) => {
              // 현재 타이머 찾기
              const currentTimer = Array.from(timers.values()).find(
                (t) => t.elementId === element.fullId
              );
              if (currentTimer) {
                // 현재 시간으로 새 타이머 생성
                createTimer(
                  element.position.x + 20,
                  element.position.y + 20,
                  currentTimer.seconds
                );
              }
            },
          },
        ],
      },
    });

    // 타이머 시작
    const interval = setInterval(() => {
      seconds++;
      window.api.ui.displayElement.update(elementId, {
        html: getTimerHtml(seconds),
      });
    }, 1000);

    // 타이머 정보 저장
    timers.set(timerId, { elementId, interval, seconds });

    return timerId;
  };

  // ============================================================
  // 그리드 컨텍스트 메뉴: 타이머 추가
  // ============================================================
  window.api.ui.contextMenu.addGridMenuItem({
    id: "add-timer",
    label: "⏱️ 타이머 추가",
    onClick: (context) => {
      const { dx, dy } = context.position;
      createTimer(dx, dy);
    },
  });

  // ============================================================
  // 초기 타이머 생성
  // ============================================================
  // createTimer(300, 100);

  // ============================================================
  // Cleanup
  // ============================================================
  window.__dmn_custom_js_cleanup = function () {
    // 모든 타이머 정리
    timers.forEach((timer) => {
      clearInterval(timer.interval);
    });
    timers.clear();

    // 컨텍스트 메뉴 제거
    window.api.ui.contextMenu.clearMyMenuItems();

    // Display Element 제거
    window.api.ui.displayElement.clearMyElements();

    delete window.__dmn_custom_js_cleanup;
  };
})();
