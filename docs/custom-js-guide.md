# 커스텀 JS 스크립트 가이드

DM Note는 사용자가 작성한 JavaScript를 런타임에 주입할 수 있는 **커스텀 JS(Custom JS)** 기능을 제공합니다. 이를 통해 앱 동작을 확장하고, 실시간 통계 패널이나 키 입력 시각화 같은 고급 기능을 구현할 수 있습니다.

> ⚠️ **보안 경고**  
> 커스텀 JS는 앱 내부 API와 DOM에 완전한 접근 권한을 가집니다. 신뢰할 수 없는 스크립트는 실행하지 마세요.

---

## 기본 사용법

### 1. 설정에서 활성화

- 메인 창에서 **설정(Settings)** 탭을 엽니다.
- **JS 플러그인 활성화** 토글을 켭니다.
- 같은 행에 표시되는 **플러그인 관리** 버튼을 눌러 모달을 엽니다.
- 모달 하단의 **JS 플러그인 추가** 버튼을 눌러 하나 이상의 `.js` 파일을 선택합니다. (복수 선택 가능)
- 목록에서 체크박스로 플러그인별 활성/비활성 상태를 관리하고, 휴지통 아이콘으로 불필요한 플러그인을 제거할 수 있습니다.

### 2. 비활성화 · 재주입 · 리로드

- 토글을 비활성화하면 모든 플러그인이 제거되고 각 플러그인이 등록한 클린업 함수가 순서대로 호출됩니다.
- 플러그인 목록을 수정(추가/삭제/비활성화)하면 목록 전체가 다시 주입됩니다.
- 설정 화면의 **리로드** 버튼을 누르면 저장된 경로를 기준으로 모든 플러그인을 다시 읽어 들입니다. (개발 중 파일을 수정했을 때 편리합니다)

---

## 제공되는 전역 API

DM Note는 커스텀 JS 스크립트에서 사용할 수 있는 전역 API와 컨벤션을 제공합니다.

### `window.__dmn_custom_js_cleanup`

**역할**: 스크립트가 생성한 리소스(타이머, 이벤트 리스너, DOM 요소 등)를 정리하는 함수를 등록합니다.

**사용 시점**:

- 커스텀 JS를 비활성화할 때
- 새 스크립트를 주입할 때(재주입)
- 윈도우가 언마운트될 때

> ℹ️ 여러 플러그인을 사용할 경우 DM Note는 각 플러그인을 순차적으로 주입하며, 새로 주입하기 전에 직전 플러그인의 클린업 함수를 먼저 호출합니다.

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
- **`window.api.bridge`** - 윈도우 간 통신 (플러그인 간 메시지 전송)
- **`window.api.plugin.storage`** - 플러그인 데이터 영속화 (설정 저장)

또한 IPC 채널 저수준 구현에 대해서는 [`docs/ipc-channels.md`](../ipc-channels.md)를 참조하세요.

---

## 플러그인 ID 설정

각 플러그인은 고유한 ID를 가지며, 이 ID는 스토리지 데이터를 구분하는 네임스페이스로 사용됩니다.

### `@id` 메타데이터

플러그인 파일 상단에 `@id` 주석을 추가하여 고유 ID를 지정할 수 있습니다:

```javascript
// @id: my-awesome-plugin

(function () {
  // 플러그인 코드...
})();
```

**규칙**:

- ID는 소문자, 숫자, 하이픈(`-`), 언더스코어(`_`)만 사용 가능
- kebab-case 형식 권장 (예: `kps-counter`, `settings-panel`)
- 파일 첫 20줄 이내에 위치해야 함

**동작**:

- `@id`가 있는 경우: 지정한 ID를 네임스페이스로 사용
- `@id`가 없는 경우: 파일명을 자동으로 정규화하여 사용 (예: `My Plugin.js` → `my-plugin`)

**중요**:

- 같은 `@id`를 가진 플러그인은 스토리지 데이터를 공유합니다
- 플러그인을 삭제 후 재설치해도 `@id`가 같으면 기존 데이터를 계속 사용합니다
- ID를 변경하면 기존 데이터에 접근할 수 없게 되므로 신중하게 선택하세요

**예시**:

```javascript
// @id: kps-counter

(function () {
  // 이 플러그인의 모든 스토리지는 'kps-counter' 네임스페이스를 사용
  await window.api.plugin.storage.set("maxKps", 150);
})();
```

---

## 플러그인 스토리지 (`window.api.plugin.storage`)

플러그인은 **스토리지 API**를 사용하여 설정이나 데이터를 영속적으로 저장할 수 있습니다. 모든 데이터는 앱 설정 파일에 함께 저장되며, 앱을 재시작해도 유지됩니다.

### ✨ 자동 네임스페이스

플러그인별로 **자동으로 격리된 스토리지 공간**이 제공됩니다. prefix를 수동으로 관리할 필요가 없으며, 다른 플러그인과의 충돌 걱정도 없습니다.

각 플러그인이 실행될 때 `window.api.plugin.storage`는 자동으로 해당 플러그인의 네임스페이스로 래핑되어, 다른 API들과 일관된 방식으로 사용할 수 있습니다.

```javascript
// ✅ 간단하게 키만 사용 (자동으로 플러그인 ID가 prefix로 추가됨)
await window.api.plugin.storage.set("settings", { theme: "dark" });
await window.api.plugin.storage.set("position", { x: 100, y: 50 });

// 데이터 조회
const settings = await window.api.plugin.storage.get("settings");
const position = await window.api.plugin.storage.get("position");

// 데이터 삭제
await window.api.plugin.storage.remove("settings");

// 이 플러그인의 모든 데이터 삭제
await window.api.plugin.storage.clear();

// 이 플러그인이 저장한 키 목록
const keys = await window.api.plugin.storage.keys();
console.log("저장된 키:", keys); // ['settings', 'position']
```

**플러그인 삭제 시 자동 정리:** 플러그인을 삭제할 때 스토리지 데이터 삭제 여부를 선택할 수 있으며, "데이터와 함께 삭제"를 선택하면 해당 플러그인의 모든 데이터가 자동으로 제거됩니다.

### 기본 사용법

```javascript
(function () {
  if (window.__dmn_custom_js_cleanup) window.__dmn_custom_js_cleanup();
  if (window.__dmn_window_type !== "overlay") return;

  // 데이터 저장 및 조회
  await window.api.plugin.storage.set("theme", "dark");
  const theme = await window.api.plugin.storage.get("theme");

  // 객체 저장
  await window.api.plugin.storage.set("userPreferences", {
    fontSize: 14,
    showNotifications: true,
  });

  // 저장된 모든 키 조회
  const allKeys = await window.api.plugin.storage.keys();
  console.log(allKeys); // ['theme', 'userPreferences']
})();
```

### 실전 예제: 설정 저장 플러그인

```javascript
(function () {
  if (window.__dmn_custom_js_cleanup) window.__dmn_custom_js_cleanup();
  if (window.__dmn_window_type !== "overlay") return;

  // 기본 설정
  const defaultSettings = {
    panelVisible: true,
    position: { x: 10, y: 10 },
    fontSize: 14,
  };

  // 저장된 설정 불러오기
  let settings = null;

  async function loadSettings() {
    settings = await window.api.plugin.storage.get("settings");
    if (!settings) {
      settings = defaultSettings;
      await saveSettings();
    }
    return settings;
  }

  async function saveSettings() {
    await window.api.plugin.storage.set("settings", settings);
  }

  // 패널 생성
  const panel = document.createElement("div");
  panel.style.cssText = `
    position: fixed;
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 10px;
    border-radius: 5px;
  `;
  document.body.appendChild(panel);

  // 초기화
  loadSettings().then((loaded) => {
    panel.style.left = loaded.position.x + "px";
    panel.style.top = loaded.position.y + "px";
    panel.style.fontSize = loaded.fontSize + "px";
    panel.style.display = loaded.panelVisible ? "block" : "none";
    panel.textContent = "설정이 복원되었습니다!";
  });

  // 드래그로 위치 변경 시 자동 저장
  let isDragging = false;
  panel.addEventListener("mousedown", () => {
    isDragging = true;
  });
  document.addEventListener("mousemove", async (e) => {
    if (!isDragging) return;
    settings.position = { x: e.clientX, y: e.clientY };
    panel.style.left = e.clientX + "px";
    panel.style.top = e.clientY + "px";
  });
  document.addEventListener("mouseup", async () => {
    if (isDragging) {
      isDragging = false;
      await saveSettings(); // 위치 자동 저장
      console.log("위치 저장됨:", settings.position);
    }
  });

  window.__dmn_custom_js_cleanup = function () {
    panel.remove();
    delete window.__dmn_custom_js_cleanup;
  };
})();
```

### ⚠️ 빈값 저장 주의사항

스토리지에 저장할 때 **비어있거나 의미 없는 값은 저장하지 않도록 권장**합니다. 불필요한 데이터 저장은 설정 파일을 오염시키고 플러그인 삭제 시 완전한 정리를 방해할 수 있습니다.

**피해야 할 패턴**:

```javascript
// ❌ 나쁜 예: 항상 저장 (초기 로드 시에도)
async function saveHistory(data) {
  await window.api.plugin.storage.set("history", data); // data가 빈 배열이어도 저장됨
}

// ❌ 나쁜 예: 기본값도 저장
await window.api.plugin.storage.set("count", 0); // 0이어도 저장됨
await window.api.plugin.storage.set("items", []); // 빈 배열도 저장됨
```

**권장 패턴**:

```javascript
// ✅ 좋은 예: 의미 있는 값만 저장
async function saveHistory(data) {
  if (data && data.length > 0) {
    await window.api.plugin.storage.set("history", data);
  }
}

// ✅ 좋은 예: 기본값이 아닐 때만 저장
if (count > 0) {
  await window.api.plugin.storage.set("count", count);
}

if (items.length > 0) {
  await window.api.plugin.storage.set("items", items);
}

// ✅ 좋은 예: 초기 로드 시에는 저장하지 않기
async function initializeSettings() {
  const saved = await window.api.plugin.storage.get("settings");
  if (saved) {
    // 저장된 데이터 사용
    return saved;
  }
  // 저장되지 않은 기본값만 반환 (저장하지 않음)
  return getDefaultSettings();
}
```

**이점**:

- 설정 파일 크기 감소
- 플러그인 삭제 후 완전히 깔끔한 정리
- 스토리지 동작의 명확성 증가

더 자세한 내용은 **[`docs/api-reference.md#플러그인-plugin`](./api-reference.md#플러그인-plugin)** 를 참조하세요.

---

## 윈도우 간 통신 (`window.api.bridge`)

플러그인은 **브릿지 API**를 사용하여 메인 윈도우와 오버레이 윈도우 간에 메시지를 주고받을 수 있습니다.

### 기본 사용법

```javascript
// 메시지 전송 (모든 윈도우에 브로드캐스트)
await window.api.bridge.send("MY_EVENT", { data: "hello" });

// 특정 윈도우에만 전송
await window.api.bridge.sendTo("overlay", "OVERLAY_EVENT", { value: 123 });

// 메시지 수신
const unsub = window.api.bridge.on("MY_EVENT", (data) => {
  console.log("받은 데이터:", data);
});

// 1회만 수신
window.api.bridge.once("INIT_COMPLETE", (data) => {
  console.log("초기화 완료");
});

// 모든 메시지 수신 (디버깅용)
window.api.bridge.onAny((type, data) => {
  console.log(`[Bridge] ${type}:`, data);
});
```

### 실전 예제: 윈도우 간 KPS 공유

```javascript
// === 오버레이 플러그인 (kps-sender.js) ===
(function () {
  if (window.__dmn_custom_js_cleanup) window.__dmn_custom_js_cleanup();
  if (window.__dmn_window_type !== "overlay") return;

  let currentKPS = 0;

  // KPS 계산 로직
  setInterval(() => {
    currentKPS = calculateKPS(); // 실제 계산 함수

    // 메인 윈도우로 전송
    window.api.bridge.sendTo("main", "KPS_UPDATE", {
      kps: currentKPS,
      timestamp: Date.now(),
    });
  }, 100);

  window.__dmn_custom_js_cleanup = function () {
    delete window.__dmn_custom_js_cleanup;
  };
})();

// === 메인 플러그인 (kps-display.js) ===
(function () {
  if (window.__dmn_custom_js_cleanup) window.__dmn_custom_js_cleanup();
  if (window.__dmn_window_type !== "main") return;

  const display = document.createElement("div");
  display.style.cssText =
    "position: fixed; top: 10px; right: 10px; padding: 10px; background: black; color: white;";
  display.textContent = "KPS: 0";
  document.body.appendChild(display);

  // 오버레이로부터 KPS 업데이트 수신
  const unsub = window.api.bridge.on("KPS_UPDATE", ({ kps, timestamp }) => {
    display.textContent = `KPS: ${kps}`;
  });

  window.__dmn_custom_js_cleanup = function () {
    unsub();
    display.remove();
    delete window.__dmn_custom_js_cleanup;
  };
})();
```

### 양방향 통신 패턴

```javascript
// === 메인 윈도우: 데이터 요청 ===
window.api.bridge.send("REQUEST_STATS", {});

// === 오버레이: 요청 처리 및 응답 ===
window.api.bridge.on("REQUEST_STATS", () => {
  window.api.bridge.sendTo("main", "RESPONSE_STATS", {
    kps: currentKPS,
    totalKeys: totalKeyCount,
    uptime: Date.now() - startTime,
  });
});

// === 메인: 응답 수신 ===
window.api.bridge.once("RESPONSE_STATS", (stats) => {
  console.log("통계:", stats);
});
```

더 자세한 내용은 **[`docs/api-reference.md#브릿지-bridge`](./api-reference.md#브릿지-bridge)** 를 참조하세요.

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
