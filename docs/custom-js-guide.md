# 커스텀 JS 스크립트 가이드

DM Note는 사용자가 작성한 JavaScript를 런타임에 주입할 수 있는 **커스텀 JS(Custom JS)** 기능을 제공합니다. 이를 통해 앱 동작을 확장하고, 실시간 통계 패널이나 키 입력 시각화 같은 고급 기능을 구현할 수 있습니다.

> ⚠️ **보안 경고**  
> 커스텀 JS는 앱 내부 API와 DOM에 완전한 접근 권한을 가집니다. 신뢰할 수 없는 스크립트는 실행하지 마세요.

---

## 기본 사용법

### 1. 설정에서 활성화

1. 메인 창에서 **설정(Settings)** 탭을 엽니다.
2. **Custom JS** 섹션에서 토글을 활성화합니다.
3. **Load Custom JS File** 버튼을 클릭해 `.js` 파일을 선택합니다.
4. 스크립트가 즉시 주입되고 실행됩니다.

### 2. 비활성화 및 재주입

- 토글을 비활성화하면 스크립트가 제거되고 클린업 함수가 자동 호출됩니다.
- 다른 파일을 로드하면 이전 스크립트를 정리한 후 새 스크립트가 주입됩니다.

---

## 제공되는 전역 API

DM Note는 커스텀 JS 스크립트에서 사용할 수 있는 전역 API와 컨벤션을 제공합니다.

### `window.__dmn_custom_js_cleanup`

**역할**: 스크립트가 생성한 리소스(타이머, 이벤트 리스너, DOM 요소 등)를 정리하는 함수를 등록합니다.

**사용 시점**:

- 커스텀 JS를 비활성화할 때
- 새 스크립트를 주입할 때(재주입)
- 윈도우가 언마운트될 때

**사용법**:

```javascript
(function () {
  // 리소스 생성 예시
  const panel = document.createElement("div");
  document.body.appendChild(panel);

  const timer = setInterval(() => {
    console.log("Running...");
  }, 1000);

  const unsubscribe = window.api.keys.onKeyState((data) => {
    console.log("Key event:", data);
  });

  // 정리 함수 등록 (필수!)
  window.__dmn_custom_js_cleanup = function () {
    clearInterval(timer);
    unsubscribe();
    panel.remove();
    delete window.__dmn_custom_js_cleanup;
  };
})();
```

**권장사항**:

- 모든 커스텀 JS는 클린업 함수를 반드시 제공해야 합니다.
- 클린업에서 `delete window.__dmn_custom_js_cleanup`으로 자기 자신을 제거하세요.
- 재주입 시 이전 클린업을 먼저 호출: `if (window.__dmn_custom_js_cleanup) window.__dmn_custom_js_cleanup();`

---

### `window.__dmn_window_type`

**역할**: 현재 렌더러의 윈도우 타입을 문자열로 식별하는 전역 변수입니다.

**값**:

- `'main'`: 메인 윈도우 (설정/키 맵핑 UI)
- `'overlay'`: 오버레이 윈도우 (키 시각화/노트 이펙트)
- `undefined`: 윈도우가 언마운트된 경우

**사용법**:

```javascript
(function () {
  // 오버레이 전용 스크립트
  if (window.__dmn_window_type !== "overlay") {
    return; // 오버레이가 아니면 실행 안 함
  }

  // 오버레이에서만 동작하는 코드
  const stats = document.createElement("div");
  stats.textContent = "Overlay Active";
  document.body.appendChild(stats);

  window.__dmn_custom_js_cleanup = function () {
    stats.remove();
    delete window.__dmn_custom_js_cleanup;
  };
})();
```

```javascript
(function () {
  // 메인 전용 스크립트
  if (window.__dmn_window_type !== "main") {
    return; // 메인 윈도우가 아니면 실행 안 함
  }

  console.log("Main window script initialized");

  window.__dmn_custom_js_cleanup = function () {
    console.log("Main window script cleanup");
    delete window.__dmn_custom_js_cleanup;
  };
})();
```

**사용 케이스**:

- 오버레이에만 표시되는 실시간 통계 패널 (`=== 'overlay'`)
- 키 입력 시각화와 노트 이펙트 연동 (`=== 'overlay'`)
- 메인 창에만 적용되는 설정 UI 확장 (`=== 'main'`)
- 향후 추가될 수 있는 다른 윈도우 타입 대응 (예: 팝업, 서브윈도우)

---

## 앱 API 접근 (`window.api`)

커스텀 JS는 `window.api`를 통해 앱의 모든 기능에 접근할 수 있습니다.

### 빠른 시작

```javascript
// 앱 초기 데이터 조회
const bootstrap = await window.api.app.bootstrap();
console.log("Keys:", bootstrap.keys);
console.log("Settings:", bootstrap.settings);

// 현재 키 맵핑 조회
const keyMappings = await window.api.keys.get();
console.log("4key:", keyMappings["4key"]);

// 키 입력 이벤트 구독 (오버레이에서만 가능)
const unsubKeyState = window.api.keys.onKeyState(({ key, state, mode }) => {
  console.log(`[${mode}] ${key} is ${state}`);
});

// 키 모드 변경 이벤트 구독
const unsubMode = window.api.keys.onModeChanged(({ mode }) => {
  console.log("Mode changed to:", mode);
});

// 설정 조회
const settings = await window.api.settings.get();
console.log("Background color:", settings.backgroundColor);

// 설정 변경 구독
const unsubSettings = window.api.settings.onChanged(({ changed, full }) => {
  console.log("Settings changed:", changed);
});

// 클린업 시 구독 해제
window.__dmn_custom_js_cleanup = function () {
  unsubKeyState();
  unsubMode();
  unsubSettings();
  delete window.__dmn_custom_js_cleanup;
};
```

### 상세 API 레퍼런스

`window.api`의 모든 메서드, 타입, 사용 패턴은 **[`docs/api-reference.md`](../api-reference.md)** 에서 확인할 수 있습니다.

주요 네임스페이스:

- **`window.api.app`** - 앱 부팅, 재시작, 외부 URL 열기
- **`window.api.keys`** - 키 매핑, 모드 변경, 카운터, 커스텀 탭
- **`window.api.settings`** - 설정 조회 및 업데이트
- **`window.api.overlay`** - 오버레이 제어 (표시/숨김, 잠금, 리사이즈)
- **`window.api.css`** / **`window.api.js`** - CSS/JS 커스텀 코드 관리
- **`window.api.presets`** - 프리셋 저장/로드

또한 IPC 채널 저수준 구현에 대해서는 [`docs/ipc-channels.md`](../ipc-channels.md)를 참조하세요.

---

## 예제 1: CPS(Characters Per Second) 패널

오버레이에 초당 키 입력 횟수를 표시하는 패널을 추가합니다.

```javascript
(function () {
  // 재주입 대비 기존 리소스 정리
  if (window.__dmn_custom_js_cleanup) window.__dmn_custom_js_cleanup();

  // 오버레이 전용
  if (window.__dmn_window_type !== "overlay") return;

  // 설정
  const WINDOW_MS = 1000; // 1초 윈도우
  const REFRESH_MS = 100; // 100ms마다 갱신

  // 상태
  let currentMode = null;
  let keyMap = {};
  let trackedKeys = new Set();
  const buckets = new Map(); // key => timestamp[]

  // UI 생성
  const style = document.createElement("style");
  style.textContent = `
    .cps-panel {
      position: fixed;
      top: 10px;
      right: 10px;
      background: rgba(0, 0, 0, 0.8);
      color: #fff;
      padding: 10px;
      border-radius: 8px;
      font-family: monospace;
      z-index: 999999;
    }
  `;
  document.head.appendChild(style);

  const panel = document.createElement("div");
  panel.className = "cps-panel";
  panel.innerHTML = '<div>Total CPS: <span id="cps-value">0</span></div>';
  document.body.appendChild(panel);
  const valueEl = panel.querySelector("#cps-value");

  // 로직
  function pruneOld(now) {
    const cutoff = now - WINDOW_MS;
    for (const [key, arr] of buckets.entries()) {
      buckets.set(
        key,
        arr.filter((ts) => ts >= cutoff)
      );
    }
  }

  function render() {
    const now = Date.now();
    pruneOld(now);
    let total = 0;
    for (const key of trackedKeys) {
      total += (buckets.get(key) || []).length;
    }
    valueEl.textContent = total;
  }

  const timer = setInterval(render, REFRESH_MS);

  // 이벤트 구독
  const unsubs = [];

  unsubs.push(
    window.api.keys.onKeyState(({ key, state }) => {
      if (!trackedKeys.has(key) || state !== "DOWN") return;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(Date.now());
    })
  );

  unsubs.push(
    window.api.keys.onModeChanged(({ mode }) => {
      currentMode = mode;
      trackedKeys = new Set(keyMap[mode] || []);
    })
  );

  // 초기화
  (async () => {
    const boot = await window.api.app.bootstrap();
    keyMap = boot.keys || {};
    currentMode = boot.selectedKeyType || Object.keys(keyMap)[0];
    trackedKeys = new Set(keyMap[currentMode] || []);
  })();

  // 정리
  window.__dmn_custom_js_cleanup = function () {
    clearInterval(timer);
    unsubs.forEach((fn) => fn && fn());
    panel.remove();
    style.remove();
    delete window.__dmn_custom_js_cleanup;
  };
})();
```

---

## 예제 2: 키 입력 히트맵

최근 입력된 키를 시각적으로 강조 표시합니다.

```javascript
(function () {
  if (window.__dmn_custom_js_cleanup) window.__dmn_custom_js_cleanup();
  if (window.__dmn_window_type !== "overlay") return;

  const style = document.createElement("style");
  style.textContent = `
    .key-heatmap {
      position: fixed;
      bottom: 10px;
      left: 10px;
      background: rgba(0, 0, 0, 0.7);
      color: #fff;
      padding: 8px;
      border-radius: 6px;
      font-family: monospace;
      font-size: 12px;
      z-index: 999999;
    }
    .key-heatmap .key-item {
      display: inline-block;
      margin: 2px;
      padding: 4px 8px;
      background: rgba(100, 200, 255, 0.3);
      border-radius: 4px;
      animation: fadeOut 2s forwards;
    }
    @keyframes fadeOut {
      to { opacity: 0; }
    }
  `;
  document.head.appendChild(style);

  const container = document.createElement("div");
  container.className = "key-heatmap";
  document.body.appendChild(container);

  const unsub = window.api.keys.onKeyState(({ key, state }) => {
    if (state !== "DOWN") return;

    const keyEl = document.createElement("span");
    keyEl.className = "key-item";
    keyEl.textContent = key;
    container.appendChild(keyEl);

    setTimeout(() => keyEl.remove(), 2000);
  });

  window.__dmn_custom_js_cleanup = function () {
    unsub();
    container.remove();
    style.remove();
    delete window.__dmn_custom_js_cleanup;
  };
})();
```

---

## 예제 3: 메인 전용 - 설정 변경 로그

메인 윈도우 콘솔에 설정 변경 이력을 기록합니다.

```javascript
(function () {
  if (window.__dmn_custom_js_cleanup) window.__dmn_custom_js_cleanup();

  // 메인 전용
  if (window.__dmn_window_type !== "main") return;

  console.log("[Settings Logger] Started");

  const unsub = window.api.settings.onChanged((settings) => {
    console.log("[Settings Changed]", new Date().toISOString(), settings);
  });

  window.__dmn_custom_js_cleanup = function () {
    unsub();
    console.log("[Settings Logger] Stopped");
    delete window.__dmn_custom_js_cleanup;
  };
})();
```

---

## 베스트 프랙티스

### 1. 즉시 실행 함수로 감싸기

스코프 오염을 방지하고 재주입 시 충돌을 막습니다.

```javascript
(function () {
  // 스크립트 코드
})();
```

### 2. 재주입 대비 클린업 먼저 호출

```javascript
if (window.__dmn_custom_js_cleanup) window.__dmn_custom_js_cleanup();
```

### 3. 윈도우 타입 체크

```javascript
// 오버레이 전용
if (window.__dmn_window_type !== "overlay") return;

// 메인 전용
if (window.__dmn_window_type !== "main") return;

// 특정 윈도우 타입에서만 실행
const allowedTypes = ["overlay", "main"];
if (!allowedTypes.includes(window.__dmn_window_type)) return;
```

### 4. 클린업 함수 필수 구현

```javascript
window.__dmn_custom_js_cleanup = function () {
  // 타이머 정리
  clearInterval(timerId);
  clearTimeout(timeoutId);

  // 이벤트 구독 해제
  unsubscribers.forEach((fn) => fn && fn());

  // DOM 정리
  elements.forEach((el) => el.remove());

  // 자기 자신 제거
  delete window.__dmn_custom_js_cleanup;
};
```

### 5. 에러 핸들링

```javascript
try {
  const data = await window.api.app.bootstrap();
  // ...
} catch (error) {
  console.error("[Custom JS] Error:", error);
}
```

### 6. 성능 고려

- `requestAnimationFrame`으로 렌더링 최적화
- 과도한 DOM 조작 지양
- 이벤트 쓰로틀링/디바운싱 적용

---

## 디버깅 팁

### 1. 콘솔 확인

- **메인 윈도우**: `Ctrl+Shift+I` (개발자 도구)
- **오버레이 윈도우**: 백엔드 로그 또는 별도 디버깅 설정 필요

### 2. 클린업 확인

```javascript
window.__dmn_custom_js_cleanup = function () {
  console.log("[Cleanup] Running cleanup...");
  // 실제 정리 코드
  console.log("[Cleanup] Done");
  delete window.__dmn_custom_js_cleanup;
};
```

### 3. 재주입 테스트

토글을 여러 번 껐다 켜면서 메모리 누수나 중복 실행이 없는지 확인하세요.

---

## 주의사항

### 보안

- **절대 신뢰할 수 없는 스크립트를 실행하지 마세요.**
- 스크립트는 앱 내부 API, 파일 시스템, 네트워크에 접근할 수 있습니다.
- 프리셋 공유 시 커스텀 JS는 별도로 검토 후 사용하세요.

### 호환성

- Tauri 2 WebView 기반으로 실행됩니다(Chromium 엔진).
- ES6+ 문법 사용 가능합니다.
- Node.js API는 사용할 수 없습니다(`window.api`만 사용).

### 유지보수

- DM Note 업데이트 시 `window.api` 시그니처가 변경될 수 있습니다.
- 주요 변경사항은 릴리스 노트와 [`docs/ipc-channels.md`](./ipc-channels.md)를 확인하세요.

---

## 추가 리소스

- **Frontend API 레퍼런스**: [`docs/api-reference.md`](../api-reference.md) - `window.api` 완전 레퍼런스
- **IPC 채널 레퍼런스**: [`docs/ipc-channels.md`](../ipc-channels.md) - 백엔드 구현 상세
- **키 맵핑 구조**: `src/types/keys.ts`
- **설정 스키마**: `src/types/settings.ts`
- **프리셋 가이드**: `docs/readme_en.md` (Preset 섹션)

---

커스텀 JS로 DM Note를 자유롭게 확장하세요! 🎹✨
