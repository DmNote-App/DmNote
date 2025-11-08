/**
 * 윈도우 간 통신 예제 플러그인
 *
 * 이 예제는 메인 윈도우와 오버레이 윈도우 간에 메시지를 주고받는 방법을 보여줍니다.
 *
 * 사용 방법:
 * 1. 메인 창과 오버레이 창에서 모두 이 플러그인을 활성화합니다.
 * 2. 메인 창에서 버튼을 클릭하면 오버레이에 메시지가 표시됩니다.
 * 3. 오버레이에서 키를 누르면 메인 창에 통계가 표시됩니다.
 */

(function () {
  // 재주입 대비 기존 리소스 정리
  if (window.__dmn_custom_js_cleanup) window.__dmn_custom_js_cleanup();

  const windowType = window.__dmn_window_type;
  const unsubs = [];

  // === 공통: 모든 브릿지 메시지 로깅 (디버깅용) ===
  const debugMode = false; // true로 설정하면 모든 메시지 로깅
  if (debugMode) {
    unsubs.push(
      window.api.bridge.onAny((type, data) => {
        console.log(`[Bridge Debug][${windowType}] ${type}:`, data);
      })
    );
  }

  // === 메인 윈도우 전용 코드 ===
  if (windowType === "main") {
    // UI 생성
    const style = document.createElement("style");
    style.textContent = `
      .bridge-demo-main {
        position: fixed;
        top: 10px;
        left: 10px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 15px;
        border-radius: 10px;
        font-family: 'Segoe UI', Arial, sans-serif;
        z-index: 999999;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
        min-width: 250px;
      }
      .bridge-demo-main h3 {
        margin: 0 0 10px 0;
        font-size: 14px;
        font-weight: 600;
      }
      .bridge-demo-main button {
        background: white;
        color: #667eea;
        border: none;
        padding: 8px 16px;
        border-radius: 5px;
        cursor: pointer;
        font-weight: 600;
        margin-right: 5px;
        margin-bottom: 5px;
        transition: all 0.2s;
      }
      .bridge-demo-main button:hover {
        transform: translateY(-1px);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
      }
      .bridge-demo-main .stats {
        margin-top: 10px;
        padding: 10px;
        background: rgba(255, 255, 255, 0.2);
        border-radius: 5px;
        font-size: 12px;
      }
    `;
    document.head.appendChild(style);

    const panel = document.createElement("div");
    panel.className = "bridge-demo-main";
    panel.innerHTML = `
      <h3>🌉 Bridge Demo (Main)</h3>
      <button id="bridge-send-hello">👋 Send Hello</button>
      <button id="bridge-request-stats">📊 Request Stats</button>
      <button id="bridge-broadcast">📢 Broadcast</button>
      <div class="stats" id="bridge-stats">
        오버레이에서 응답을 기다리는 중...
      </div>
    `;
    document.body.appendChild(panel);

    const statsEl = panel.querySelector("#bridge-stats");

    // === 버튼 이벤트 ===
    panel.querySelector("#bridge-send-hello").addEventListener("click", () => {
      window.api.bridge.sendTo("overlay", "HELLO_FROM_MAIN", {
        message: "안녕하세요, 오버레이!",
        timestamp: Date.now(),
      });
      statsEl.textContent = "✅ 오버레이로 Hello 메시지 전송됨";
    });

    panel
      .querySelector("#bridge-request-stats")
      .addEventListener("click", () => {
        window.api.bridge.send("REQUEST_OVERLAY_STATS", {});
        statsEl.textContent = "⏳ 오버레이에 통계 요청 중...";
      });

    panel.querySelector("#bridge-broadcast").addEventListener("click", () => {
      window.api.bridge.send("BROADCAST_MESSAGE", {
        from: "main",
        text: "모든 윈도우에 브로드캐스트!",
      });
      statsEl.textContent = "📢 모든 윈도우에 브로드캐스트됨";
    });

    // === 오버레이로부터 응답 수신 ===
    unsubs.push(
      window.api.bridge.on("OVERLAY_STATS_RESPONSE", (data) => {
        statsEl.innerHTML = `
          <strong>📊 오버레이 통계:</strong><br>
          KPS: ${data.kps || 0}<br>
          총 키 입력: ${data.totalKeys || 0}<br>
          업타임: ${data.uptime || 0}ms<br>
          <small>수신 시각: ${new Date().toLocaleTimeString()}</small>
        `;
      })
    );

    // === 브로드캐스트 메시지 수신 ===
    unsubs.push(
      window.api.bridge.on("BROADCAST_MESSAGE", ({ from, text }) => {
        if (from !== "main") {
          console.log(`[Main] 브로드캐스트 수신 from ${from}:`, text);
        }
      })
    );

    // 클린업
    window.__dmn_custom_js_cleanup = function () {
      unsubs.forEach((fn) => fn && fn());
      panel.remove();
      style.remove();
      delete window.__dmn_custom_js_cleanup;
    };
  }

  // === 오버레이 윈도우 전용 코드 ===
  else if (windowType === "overlay") {
    // 상태 추적
    let keyPressCount = 0;
    let startTime = Date.now();

    // UI 생성
    const style = document.createElement("style");
    style.textContent = `
      .bridge-demo-overlay {
        position: fixed;
        bottom: 10px;
        left: 10px;
        background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
        color: white;
        padding: 15px;
        border-radius: 10px;
        font-family: 'Segoe UI', Arial, sans-serif;
        z-index: 999999;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
        min-width: 250px;
      }
      .bridge-demo-overlay h3 {
        margin: 0 0 10px 0;
        font-size: 14px;
        font-weight: 600;
      }
      .bridge-demo-overlay .message-box {
        background: rgba(255, 255, 255, 0.2);
        padding: 10px;
        border-radius: 5px;
        margin-top: 10px;
        font-size: 12px;
        min-height: 40px;
      }
      .bridge-demo-overlay .stats {
        margin-top: 10px;
        padding: 8px;
        background: rgba(255, 255, 255, 0.15);
        border-radius: 5px;
        font-size: 11px;
      }
    `;
    document.head.appendChild(style);

    const panel = document.createElement("div");
    panel.className = "bridge-demo-overlay";
    panel.innerHTML = `
      <h3>🌉 Bridge Demo (Overlay)</h3>
      <div class="message-box" id="bridge-message">
        메인에서 메시지를 기다리는 중...
      </div>
      <div class="stats" id="bridge-overlay-stats">
        키 입력: 0 | 업타임: 0s
      </div>
    `;
    document.body.appendChild(panel);

    const messageEl = panel.querySelector("#bridge-message");
    const statsEl = panel.querySelector("#bridge-overlay-stats");

    // 통계 업데이트 타이머
    const statsTimer = setInterval(() => {
      const uptime = Math.floor((Date.now() - startTime) / 1000);
      statsEl.textContent = `키 입력: ${keyPressCount} | 업타임: ${uptime}s`;
    }, 1000);

    // === 메인으로부터 메시지 수신 ===
    unsubs.push(
      window.api.bridge.on("HELLO_FROM_MAIN", ({ message, timestamp }) => {
        messageEl.innerHTML = `
          <strong>💌 메인으로부터:</strong><br>
          "${message}"<br>
          <small>${new Date(timestamp).toLocaleTimeString()}</small>
        `;
      })
    );

    // === 통계 요청 처리 ===
    unsubs.push(
      window.api.bridge.on("REQUEST_OVERLAY_STATS", () => {
        // 메인 윈도우로 통계 전송
        window.api.bridge.sendTo("main", "OVERLAY_STATS_RESPONSE", {
          kps: Math.floor(keyPressCount / ((Date.now() - startTime) / 1000)),
          totalKeys: keyPressCount,
          uptime: Date.now() - startTime,
        });

        messageEl.textContent = "📊 메인에 통계를 전송했습니다.";
      })
    );

    // === 브로드캐스트 메시지 수신 ===
    unsubs.push(
      window.api.bridge.on("BROADCAST_MESSAGE", ({ from, text }) => {
        console.log(`[Overlay] 브로드캐스트 수신 from ${from}:`, text);
        messageEl.innerHTML = `
          <strong>📢 브로드캐스트:</strong><br>
          "${text}" (from ${from})
        `;
      })
    );

    // === 키 입력 카운트 ===
    unsubs.push(
      window.api.keys.onKeyState(({ state }) => {
        if (state === "DOWN") {
          keyPressCount++;
        }
      })
    );

    // 클린업
    window.__dmn_custom_js_cleanup = function () {
      clearInterval(statsTimer);
      unsubs.forEach((fn) => fn && fn());
      panel.remove();
      style.remove();
      delete window.__dmn_custom_js_cleanup;
    };
  }

  // 윈도우 타입이 확인되지 않은 경우
  else {
    console.warn("[Bridge Demo] Unknown window type:", windowType);
  }
})();
