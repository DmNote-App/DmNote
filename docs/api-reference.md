# window.api 레퍼런스 (Frontend API)

프론트엔드에서 사용 가능한 `window.api` 객체의 완전한 레퍼런스입니다. Tauri의 `invoke` API를 통해 백엔드 커맨드를 호출하고, 이벤트를 구독할 수 있습니다.

---

## 목차

- [앱 (app)](#앱-app)
- [윈도우 (window)](#윈도우-window)
- [설정 (settings)](#설정-settings)
- [키 (keys)](#키-keys)
- [오버레이 (overlay)](#오버레이-overlay)
- [CSS (css)](#css-css)
- [JavaScript (js)](#javascript-js)
- [프리셋 (presets)](#프리셋-presets)
- [브릿지 (bridge)](#브릿지-bridge)
- [플러그인 (plugin)](#플러그인-plugin)
- [UI (ui)](#ui-ui)
- [공통 타입](#공통-타입)

---

## 앱 (app)

### `window.api.app.bootstrap()`

앱 초기화 시 필요한 모든 데이터를 한 번에 가져옵니다.

**반환형**: `Promise<BootstrapPayload>`

```typescript
interface BootstrapPayload {
  settings: SettingsState; // 현재 설정
  keys: KeyMappings; // 모든 키 모드의 키 매핑
  positions: KeyPositions; // 모든 키 모드의 위치
  customTabs: CustomTab[]; // 커스텀 탭 목록
  selectedKeyType: string; // 현재 선택된 키 모드
  currentMode: string; // 현재 활성 모드
  overlay: {
    visible: boolean;
    locked: boolean;
    anchor: string;
  };
  keyCounters: KeyCounters; // 키별 누적 카운트
}
```

**사용 예**:

```javascript
const bootstrap = await window.api.app.bootstrap();
console.log("Current mode:", bootstrap.selectedKeyType);
console.log("4key mapping:", bootstrap.keys["4key"]);
```

---

### `window.api.app.openExternal(url: string)`

외부 URL을 기본 브라우저에서 엽니다.

**매개변수**:

- `url: string` - 열어질 URL (예: `https://example.com`)

**반환형**: `Promise<void>`

**사용 예**:

```javascript
await window.api.app.openExternal("https://github.com");
```

---

### `window.api.app.restart()`

애플리케이션을 재시작합니다.

**반환형**: `Promise<void>`

**사용 예**:

```javascript
await window.api.app.restart();
```

---

## 윈도우 (window)

### `window.api.window.type`

현재 윈도우의 타입을 반환합니다.

**타입**: `"main" | "overlay"`

**반환값**:

- `"main"`: 메인 윈도우 (설정/키 맵핑 UI)
- `"overlay"`: 오버레이 윈도우 (키 시각화/노트 이펙트)

**사용 예**:

```javascript
// 윈도우 타입에 따라 다른 로직 실행
if (window.api.window.type === "overlay") {
  // 오버레이 전용 코드
  console.log("This is overlay window");
} else if (window.api.window.type === "main") {
  // 메인 윈도우 전용 코드
  console.log("This is main window");
}

// 플러그인에서 활용
(function () {
  if (window.api.window.type !== "overlay") return;

  // 오버레이에서만 실행되는 코드
})();
```

---

### `window.api.window.minimize()`

메인 윈도우를 최소화합니다.

**반환형**: `Promise<void>`

```javascript
await window.api.window.minimize();
```

---

### `window.api.window.close()`

애플리케이션을 종료합니다 (모든 윈도우 닫음).

**반환형**: `Promise<void>`

```javascript
await window.api.window.close();
```

---

### `window.api.window.openDevtoolsAll()`

개발자 모드가 활성화된 경우 메인 창과 오버레이 창의 DevTools를 엽니다.

**반환형**: `Promise<void>`

**사용 예**:

```javascript
// 개발자 모드 토글 시 자동으로 호출됨
await window.api.window.openDevtoolsAll();
```

**참고**: 이 API는 개발자 모드가 비활성화된 경우에도 호출은 가능하지만, 실제 DevTools 접근은 키보드 단축키(Ctrl+Shift+I, F12)가 차단되어 있습니다.

---

## 설정 (settings)

### `window.api.settings.get()`

현재 설정 상태를 조회합니다.

**반환형**: `Promise<SettingsState>`

```typescript
interface SettingsState {
  hardwareAcceleration: boolean; // GPU 가속 사용 여부
  alwaysOnTop: boolean; // 항상 위 모드
  overlayLocked: boolean; // 오버레이 잠금 여부
  noteEffect: boolean; // 노트 이펙트 활성화
  noteSettings: NoteSettings; // 노트 설정
  angleMode: string; // 렌더링 모드 (예: "d3d11")
  language: string; // 언어 코드 (예: "ko", "en")
  laboratoryEnabled: boolean; // 실험실 기능 활성화
  developerModeEnabled: boolean; // 개발자 모드 활성화 (DevTools 접근 허용)
  backgroundColor: string; // 배경 색상 (CSS 색상값)
  useCustomCSS: boolean; // 커스텀 CSS 활성화
  customCSS: { path: string | null; content: string };
  useCustomJS: boolean; // 커스텀 JS 활성화
  customJS: { path: string | null; content: string };
  overlayResizeAnchor: OverlayResizeAnchor; // 오버레이 리사이징 앵커
  keyCounterEnabled: boolean; // 키 카운터 표시 여부
}

type OverlayResizeAnchor =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "center";

interface NoteSettings {
  borderRadius: number; // 노트 모서리 반경 (px)
  speed: number; // 노트 하강 속도 (배수)
  trackHeight: number; // 트랙 높이 (px)
  reverse: boolean; // 역방향 모드
  fadePosition: string; // 페이드 위치
  delayedNoteEnabled: boolean; // 지연 노트 활성화
  shortNoteThresholdMs: number; // 짧은 노트 판정 시간 (ms)
  shortNoteMinLengthPx: number; // 짧은 노트 최소 길이 (px)
}
```

**사용 예**:

```javascript
const settings = await window.api.settings.get();
console.log("언어:", settings.language);
console.log("항상 위:", settings.alwaysOnTop);
```

---

### `window.api.settings.update(patch: SettingsPatchInput)`

설정을 부분 업데이트합니다.

**매개변수**:

- `patch: Partial<SettingsState>` - 업데이트할 필드들

**반환형**: `Promise<SettingsState>` - 정규화된 전체 설정

**사용 예**:

```javascript
// 단일 필드 업데이트
const updated = await window.api.settings.update({
  language: "en",
  alwaysOnTop: false,
});

// 중첩 객체 부분 업데이트
await window.api.settings.update({
  noteSettings: {
    speed: 1.5,
    trackHeight: 50,
  },
});

// CSS 업데이트
await window.api.settings.update({
  customCSS: {
    content: "body { background: red; }",
  },
});
```

---

### `window.api.settings.onChanged(listener)`

설정 변경 이벤트를 구독합니다.

**매개변수**:

- `listener: (diff: SettingsDiff) => void`

```typescript
interface SettingsDiff {
  changed: Partial<SettingsState>; // 변경된 필드만
  full: SettingsState; // 전체 설정 스냅샷
}
```

**반환형**: `Unsubscribe` - 구독 해제 함수

**사용 예**:

```javascript
const unsubscribe = window.api.settings.onChanged(({ changed, full }) => {
  console.log("변경된 항목:", changed);
  console.log("전체 설정:", full);
});

// 구독 해제
unsubscribe();
```

---

## 키 (keys)

### `window.api.keys.get()`

모든 키 모드의 키 매핑을 조회합니다.

**반환형**: `Promise<KeyMappings>`

```typescript
type KeyMappings = Record<string, string[]>;
// 예: { "4key": ["KeyD", "KeyF", "KeyJ", "KeyK"], "5key": [...], ... }
```

**사용 예**:

```javascript
const mappings = await window.api.keys.get();
console.log("4key 매핑:", mappings["4key"]);
```

---

### `window.api.keys.update(mappings: KeyMappings)`

키 매핑을 업데이트합니다.

**매개변수**:

- `mappings: KeyMappings` - 전체 키 매핑

**반환형**: `Promise<KeyMappings>` - 업데이트된 매핑

**사용 예**:

```javascript
const current = await window.api.keys.get();
current["4key"] = ["KeyS", "KeyD", "KeyJ", "KeyK"];
const updated = await window.api.keys.update(current);
```

---

### `window.api.keys.getPositions()`

모든 키 모드의 위치 정보를 조회합니다.

**반환형**: `Promise<KeyPositions>`

```typescript
type KeyPositions = Record<string, KeyPosition[]>;

interface KeyPosition {
  dx: number; // X 오프셋 (px)
  dy: number; // Y 오프셋 (px)
  width: number; // 너비 (px)
  height: number; // 높이 (px)
  activeImage?: string; // 활성 상태 이미지 URL
  inactiveImage?: string; // 비활성 상태 이미지 URL
  activeTransparent?: boolean; // 활성 투명 모드
  idleTransparent?: boolean; // 비활성 투명 모드
  count: number; // 누적 카운트
  noteColor: string | { type: "gradient"; top: string; bottom: string };
  noteOpacity: number; // 노트 불투명도 (0-100)
  className?: string; // 커스텀 CSS 클래스
  counter: KeyCounterSettings; // 키 카운터 설정
}

interface KeyCounterSettings {
  placement: "inside" | "outside";
  align: "top" | "bottom" | "left" | "right";
  fill: { idle: string; active: string }; // CSS 색상값
  stroke: { idle: string; active: string };
  gap: number; // 간격 (px)
}
```

**사용 예**:

```javascript
const positions = await window.api.keys.getPositions();
console.log("4key 위치:", positions["4key"]);
```

---

### `window.api.keys.updatePositions(positions: KeyPositions)`

키 위치 정보를 업데이트합니다.

**매개변수**:

- `positions: KeyPositions`

**반환형**: `Promise<KeyPositions>`

```javascript
const current = await window.api.keys.getPositions();
current["4key"][0].dx = 100; // 첫 번째 키 X 좌표 변경
await window.api.keys.updatePositions(current);
```

---

### `window.api.keys.setMode(mode: string)`

현재 활성 키 모드를 변경합니다.

**매개변수**:

- `mode: string` - 모드 ID (예: "4key", "5key", "8key", "custom-\*")

**반환형**: `Promise<{ success: boolean; mode: string }>`

**사용 예**:

```javascript
const result = await window.api.keys.setMode("8key");
console.log("모드 변경 성공:", result.success);
console.log("현재 모드:", result.mode);
```

---

### `window.api.keys.resetAll()`

모든 키, 위치, 커스텀탭을 기본값으로 초기화합니다.

**반환형**: `Promise<{ keys: KeyMappings; positions: KeyPositions; customTabs: CustomTab[]; selectedKeyType: string }>`

**사용 예**:

```javascript
const reset = await window.api.keys.resetAll();
console.log("초기화된 키:", reset.keys);
```

---

### `window.api.keys.resetMode(mode: string)`

특정 키 모드를 기본값으로 초기화합니다.

**매개변수**:

- `mode: string` - 초기화할 모드 ID

**반환형**: `Promise<{ success: boolean; mode: string }>`

```javascript
await window.api.keys.resetMode("4key");
```

---

### `window.api.keys.resetCounters()`

모든 키의 누적 카운트를 초기화합니다.

**반환형**: `Promise<KeyCounters>`

```typescript
type KeyCounters = Record<string, Record<string, number>>;
// 예: { "4key": { "KeyD": 1234, "KeyF": 5678, ... }, ... }
```

```javascript
const counters = await window.api.keys.resetCounters();
console.log("초기화된 카운터:", counters);
```

---

### `window.api.keys.resetCountersMode(mode: string)`

특정 모드의 키 카운트만 초기화합니다.

**매개변수**:

- `mode: string` - 초기화할 모드 ID

**반환형**: `Promise<KeyCounters>`

```javascript
await window.api.keys.resetCountersMode("4key");
```

---

### 키 이벤트 구독

#### `window.api.keys.onChanged(listener)`

키 매핑 변경 이벤트를 구독합니다.

**매개변수**:

- `listener: (keys: KeyMappings) => void`

**반환형**: `Unsubscribe`

```javascript
const unsub = window.api.keys.onChanged((mappings) => {
  console.log("키 매핑 변경:", mappings);
});
```

---

#### `window.api.keys.onPositionsChanged(listener)`

키 위치 변경 이벤트를 구독합니다.

**매개변수**:

- `listener: (positions: KeyPositions) => void`

**반환형**: `Unsubscribe`

```javascript
const unsub = window.api.keys.onPositionsChanged((positions) => {
  console.log("키 위치 변경:", positions);
});
```

---

#### `window.api.keys.onModeChanged(listener)`

키 모드 변경 이벤트를 구독합니다.

**매개변수**:

- `listener: (payload: { mode: string }) => void`

**반환형**: `Unsubscribe`

```javascript
const unsub = window.api.keys.onModeChanged(({ mode }) => {
  console.log("모드 변경됨:", mode);
});
```

---

#### `window.api.keys.onKeyState(listener)`

실시간 키 입력 이벤트를 구독합니다. **오버레이 윈도우에서만 수신 가능합니다.**

**매개변수**:

- `listener: (payload: KeyStatePayload) => void`

```typescript
interface KeyStatePayload {
  key: string; // 키 코드 (예: "KeyD", "KeyF")
  state: string; // "DOWN" | "UP"
  mode: string; // 현재 모드 (예: "4key")
}
```

**반환형**: `Unsubscribe`

**사용 예**:

```javascript
const unsub = window.api.keys.onKeyState(({ key, state, mode }) => {
  console.log(`[${mode}] ${key} is ${state}`);
});
```

---

#### `window.api.keys.onCounterChanged(listener)`

개별 키 카운트 변경 이벤트를 구독합니다.

**매개변수**:

- `listener: (payload: { mode: string; key: string; count: number }) => void`

**반환형**: `Unsubscribe`

```javascript
const unsub = window.api.keys.onCounterChanged(({ mode, key, count }) => {
  console.log(`[${mode}] ${key}: ${count}`);
});
```

---

#### `window.api.keys.onCountersChanged(listener)`

전체 키 카운터 변경 이벤트를 구독합니다.

**매개변수**:

- `listener: (payload: KeyCounters) => void`

**반환형**: `Unsubscribe`

```javascript
const unsub = window.api.keys.onCountersChanged((counters) => {
  console.log("카운터 업데이트:", counters);
});
```

---

### 커스텀 탭 (keys.customTabs)

#### `window.api.keys.customTabs.list()`

커스텀 탭 목록을 조회합니다.

**반환형**: `Promise<CustomTab[]>`

```typescript
interface CustomTab {
  id: string; // 고유 ID (timestamp 기반)
  name: string; // 탭 이름
}
```

```javascript
const tabs = await window.api.keys.customTabs.list();
console.log("커스텀 탭:", tabs);
```

---

#### `window.api.keys.customTabs.create(name: string)`

새 커스텀 탭을 생성합니다.

**매개변수**:

- `name: string` - 탭 이름

**반환형**: `Promise<{ result?: CustomTab; error?: string }>`

**사용 예**:

```javascript
const result = await window.api.keys.customTabs.create("My Keys");
if (result.error) {
  console.error("생성 실패:", result.error);
  // "invalid-name", "duplicate-name", "max-reached" 등
} else {
  console.log("탭 생성됨:", result.result);
}
```

---

#### `window.api.keys.customTabs.delete(id: string)`

커스텀 탭을 삭제합니다.

**매개변수**:

- `id: string` - 탭 ID

**반환형**: `Promise<{ success: boolean; selected: string; error?: string }>`

```javascript
const result = await window.api.keys.customTabs.delete("custom-123");
console.log("삭제 성공:", result.success);
console.log("현재 선택된 탭:", result.selected);
```

---

#### `window.api.keys.customTabs.select(id: string)`

커스텀 탭을 선택합니다.

**매개변수**:

- `id: string` - 탭 ID

**반환형**: `Promise<{ success: boolean; selected: string; error?: string }>`

```javascript
await window.api.keys.customTabs.select("custom-123");
```

---

#### `window.api.keys.customTabs.onChanged(listener)`

커스텀 탭 변경 이벤트를 구독합니다.

**매개변수**:

- `listener: (payload: { customTabs: CustomTab[]; selectedKeyType: string }) => void`

**반환형**: `Unsubscribe`

```javascript
const unsub = window.api.keys.customTabs.onChanged(
  ({ customTabs, selectedKeyType }) => {
    console.log("탭 목록:", customTabs);
    console.log("선택된 탭:", selectedKeyType);
  }
);
```

---

## 오버레이 (overlay)

### `window.api.overlay.get()`

오버레이 상태를 조회합니다.

**반환형**: `Promise<OverlayState>`

```typescript
interface OverlayState {
  visible: boolean; // 표시 여부
  locked: boolean; // 잠금 여부
  anchor: string; // 앵커 위치 (예: "top-left")
}
```

```javascript
const state = await window.api.overlay.get();
console.log("오버레이 상태:", state);
```

---

### `window.api.overlay.setVisible(visible: boolean)`

오버레이 표시/숨김을 설정합니다.

**매개변수**:

- `visible: boolean`

**반환형**: `Promise<void>`

```javascript
await window.api.overlay.setVisible(true);
await window.api.overlay.setVisible(false);
```

---

### `window.api.overlay.setLock(locked: boolean)`

오버레이 잠금 상태를 설정합니다. 잠금 시 마우스 이벤트가 투과됩니다.

**매개변수**:

- `locked: boolean`

**반환형**: `Promise<void>`

```javascript
await window.api.overlay.setLock(true); // 잠금
await window.api.overlay.setLock(false); // 해제
```

---

### `window.api.overlay.setAnchor(anchor: string)`

오버레이 리사이징 앵커를 설정합니다.

**매개변수**:

- `anchor: string` - "top-left", "top-right", "bottom-left", "bottom-right", "center" 중 하나

**반환형**: `Promise<string>` - 실제 설정된 앵커

```javascript
const anchor = await window.api.overlay.setAnchor("top-left");
```

---

### `window.api.overlay.resize(payload)`

오버레이의 크기와 위치를 조정합니다.

**매개변수**:

```typescript
interface ResizePayload {
  width: number; // 너비 (px)
  height: number; // 높이 (px)
  anchor?: string; // 앵커 (선택사항)
  contentTopOffset?: number; // 컨텐츠 상단 오프셋 (선택사항)
}
```

**반환형**: `Promise<OverlayBounds>`

```typescript
interface OverlayBounds {
  x: number; // 좌측 좌표
  y: number; // 상단 좌표
  width: number; // 너비
  height: number; // 높이
}
```

**사용 예**:

```javascript
const bounds = await window.api.overlay.resize({
  width: 400,
  height: 300,
  anchor: "top-left",
});
console.log("오버레이 위치:", bounds);
```

---

### 오버레이 이벤트 구독

#### `window.api.overlay.onVisibility(listener)`

오버레이 표시/숨김 이벤트를 구독합니다.

**매개변수**:

- `listener: (payload: { visible: boolean }) => void`

**반환형**: `Unsubscribe`

```javascript
const unsub = window.api.overlay.onVisibility(({ visible }) => {
  console.log("오버레이", visible ? "표시됨" : "숨겨짐");
});
```

---

#### `window.api.overlay.onLock(listener)`

오버레이 잠금 이벤트를 구독합니다.

**매개변수**:

- `listener: (payload: { locked: boolean }) => void`

**반환형**: `Unsubscribe`

```javascript
const unsub = window.api.overlay.onLock(({ locked }) => {
  console.log("오버레이", locked ? "잠김" : "해제됨");
});
```

---

#### `window.api.overlay.onAnchor(listener)`

오버레이 앵커 변경 이벤트를 구독합니다.

**매개변수**:

- `listener: (payload: { anchor: string }) => void`

**반환형**: `Unsubscribe`

```javascript
const unsub = window.api.overlay.onAnchor(({ anchor }) => {
  console.log("앵커 변경:", anchor);
});
```

---

#### `window.api.overlay.onResized(listener)`

오버레이 리사이징 이벤트를 구독합니다.

**매개변수**:

- `listener: (payload: OverlayBounds) => void`

**반환형**: `Unsubscribe`

```javascript
const unsub = window.api.overlay.onResized(({ x, y, width, height }) => {
  console.log(`오버레이: ${x}, ${y}, ${width}x${height}`);
});
```

---

## CSS (css)

### `window.api.css.get()`

현재 커스텀 CSS를 조회합니다.

**반환형**: `Promise<{ path: string | null; content: string }>`

```javascript
const css = await window.api.css.get();
console.log("CSS 경로:", css.path);
console.log("CSS 내용:", css.content);
```

---

### `window.api.css.getUse()`

커스텀 CSS 활성화 여부를 조회합니다.

**반환형**: `Promise<boolean>`

```javascript
const enabled = await window.api.css.getUse();
console.log("CSS 활성화:", enabled);
```

---

### `window.api.css.toggle(enabled: boolean)`

커스텀 CSS 활성화 상태를 토글합니다.

**매개변수**:

- `enabled: boolean`

**반환형**: `Promise<{ enabled: boolean }>`

```javascript
const result = await window.api.css.toggle(true);
```

---

### `window.api.css.load()`

파일 대화상자에서 CSS 파일을 선택하여 로드합니다.

**반환형**: `Promise<{ success: boolean; error?: string; content?: string; path?: string }>`

```javascript
const result = await window.api.css.load();
if (result.success) {
  console.log("파일 경로:", result.path);
  console.log("내용:", result.content);
} else {
  console.log("오류:", result.error);
}
```

---

### `window.api.css.setContent(content: string)`

CSS 내용을 직접 설정합니다.

**매개변수**:

- `content: string` - CSS 코드

**반환형**: `Promise<{ success: boolean; error?: string }>`

```javascript
const result = await window.api.css.setContent("body { background: red; }");
```

---

### `window.api.css.reset()`

커스텀 CSS를 비우고 비활성화합니다.

**반환형**: `Promise<void>`

```javascript
await window.api.css.reset();
```

---

### CSS 이벤트 구독

#### `window.api.css.onUse(listener)`

CSS 활성화 상태 변경 이벤트를 구독합니다.

**매개변수**:

- `listener: (payload: { enabled: boolean }) => void`

**반환형**: `Unsubscribe`

```javascript
const unsub = window.api.css.onUse(({ enabled }) => {
  console.log("CSS", enabled ? "활성화됨" : "비활성화됨");
});
```

---

#### `window.api.css.onContent(listener)`

CSS 내용 변경 이벤트를 구독합니다.

**매개변수**:

- `listener: (payload: { path: string | null; content: string }) => void`

**반환형**: `Unsubscribe`

```javascript
const unsub = window.api.css.onContent(({ path, content }) => {
  console.log("CSS 변경됨:", path);
});
```

---

## JavaScript (js)

### `window.api.js.get()`

현재 등록된 JS 플러그인 목록(및 레거시 필드)을 조회합니다.

**반환형**: `Promise<{ path?: string | null; content?: string; plugins: JsPlugin[] }>`

```typescript
type JsPlugin = {
  id: string;
  name: string;
  path: string | null;
  content: string;
  enabled: boolean;
};
```

```javascript
const js = await window.api.js.get();
js.plugins.forEach((plugin) => {
  console.log(plugin.name, plugin.enabled);
});
```

---

### `window.api.js.getUse()`

커스텀 JavaScript 활성화 여부를 조회합니다.

**반환형**: `Promise<boolean>`

```javascript
const enabled = await window.api.js.getUse();
console.log("JS 활성화:", enabled);
```

---

### `window.api.js.toggle(enabled: boolean)`

커스텀 JavaScript 활성화 상태를 토글합니다.

**매개변수**:

- `enabled: boolean`

**반환형**: `Promise<{ enabled: boolean }>`

```javascript
const result = await window.api.js.toggle(true);
```

---

### `window.api.js.load()`

파일 대화상자에서 하나 이상의 JavaScript 파일(.js, .mjs)을 선택하여 플러그인으로 추가합니다.

**반환형**: `Promise<{ success: boolean; added: JsPlugin[]; errors: { path: string; error: string }[] }>`

```javascript
const result = await window.api.js.load();
if (result.success) {
  console.log(`${result.added.length}개의 플러그인을 추가했습니다.`);
}
if (result.errors.length) {
  console.warn("불러오지 못한 플러그인", result.errors);
}
```

---

### `window.api.js.reload()`

저장된 경로를 기준으로 모든 플러그인 파일을 다시 읽어 들입니다.

**반환형**: `Promise<{ updated: JsPlugin[]; errors: { path: string; error: string }[] }>`

```javascript
const result = await window.api.js.reload();
console.log("다시 읽은 플러그인 수:", result.updated.length);
```

---

### `window.api.js.remove(id: string)`

플러그인 목록에서 지정한 `id`의 플러그인을 제거합니다.

**반환형**: `Promise<{ success: boolean; removedId?: string; error?: string }>`

```javascript
await window.api.js.remove(plugin.id);
```

---

### `window.api.js.setPluginEnabled(id: string, enabled: boolean)`

플러그인 별 활성/비활성 상태를 토글합니다.

**반환형**: `Promise<{ success: boolean; plugin?: JsPlugin; error?: string }>`

```javascript
await window.api.js.setPluginEnabled(plugin.id, !plugin.enabled);
```

---

### `window.api.js.setContent(content: string)`

첫 번째 활성화된 플러그인의 내용을 직접 설정합니다. (활성 플러그인이 없다면 첫 번째 플러그인이 갱신됩니다.)

**매개변수**:

- `content: string` - JavaScript 코드

**반환형**: `Promise<{ success: boolean; error?: string }>`

```javascript
const result = await window.api.js.setContent("console.log('Hello');");
```

---

### `window.api.js.reset()`

커스텀 JavaScript를 비우고 비활성화합니다.

**반환형**: `Promise<void>`

```javascript
await window.api.js.reset();
```

---

### JavaScript 이벤트 구독

#### `window.api.js.onUse(listener)`

JavaScript 활성화 상태 변경 이벤트를 구독합니다.

**매개변수**:

- `listener: (payload: { enabled: boolean }) => void`

**반환형**: `Unsubscribe`

```javascript
const unsub = window.api.js.onUse(({ enabled }) => {
  console.log("JS", enabled ? "활성화됨" : "비활성화됨");
});
```

---

#### `window.api.js.onState(listener)`

플러그인 목록 또는 콘텐츠가 변경될 때마다 호출됩니다.

**매개변수**:

- `listener: (payload: { plugins: JsPlugin[]; path?: string | null; content?: string }) => void`

**반환형**: `Unsubscribe`

```javascript
const unsub = window.api.js.onState(({ plugins }) => {
  console.log("현재 플러그인 수:", plugins.length);
});
```

---

## 프리셋 (presets)

### `window.api.presets.save()`

현재 모든 설정을 JSON 프리셋 파일로 저장합니다.

파일 대화상자가 열리고 사용자가 저장 위치를 선택합니다.

**반환형**: `Promise<{ success: boolean; error?: string }>`

```javascript
const result = await window.api.presets.save();
if (result.success) {
  console.log("프리셋 저장 완료");
} else {
  console.log("오류:", result.error);
}
```

---

### `window.api.presets.load()`

JSON 프리셋 파일을 선택하여 로드합니다.

파일 대화상자가 열리고 사용자가 프리셋 파일을 선택하면 모든 설정이 적용됩니다.

**반환형**: `Promise<{ success: boolean; error?: string }>`

```javascript
const result = await window.api.presets.load();
if (result.success) {
  console.log("프리셋 로드 완료");
} else {
  console.log("오류:", result.error);
  // "invalid-preset" 등
}
```

---

## 공통 타입

### Unsubscribe

이벤트 구독 해제 함수입니다.

```typescript
type Unsubscribe = () => void;

// 사용 예
const unsub = window.api.keys.onModeChanged(({ mode }) => {
  console.log(mode);
});

// 나중에 구독 해제
unsub();
```

---

## 사용 패턴

### 초기화 및 구독

```javascript
// 1. 초기 데이터 로드
const bootstrap = await window.api.app.bootstrap();
const keys = bootstrap.keys;
const settings = bootstrap.settings;

// 2. 이벤트 구독
const unsubKeys = window.api.keys.onChanged((newKeys) => {
  console.log("키 변경:", newKeys);
});

const unsubSettings = window.api.settings.onChanged(({ full }) => {
  console.log("설정 변경:", full);
});

// 3. 정리 (컴포넌트 언마운트 시)
unsubKeys();
unsubSettings();
```

### 설정 업데이트

```javascript
// 부분 업데이트
await window.api.settings.update({
  language: "en",
});

// 중첩 객체 업데이트
await window.api.settings.update({
  noteSettings: {
    speed: 1.5,
  },
});
```

### 키 모드 관리

```javascript
// 모드 변경
await window.api.keys.setMode("8key");

// 모드 변경 감시
window.api.keys.onModeChanged(({ mode }) => {
  console.log("현재 모드:", mode);
});

// 모드 초기화
await window.api.keys.resetMode("4key");
```

### 커스텀 탭 관리

```javascript
// 탭 목록 조회
const tabs = await window.api.keys.customTabs.list();

// 새 탭 생성
const result = await window.api.keys.customTabs.create("내 키");
if (!result.error) {
  console.log("탭 생성됨:", result.result.id);
}

// 탭 선택
await window.api.keys.customTabs.select(tabId);

// 탭 삭제
await window.api.keys.customTabs.delete(tabId);

// 탭 변경 감시
window.api.keys.customTabs.onChanged(({ customTabs, selectedKeyType }) => {
  console.log("선택된 탭:", selectedKeyType);
});
```

### 오버레이 제어

```javascript
// 오버레이 상태 조회
const overlay = await window.api.overlay.get();

// 오버레이 표시/숨김
await window.api.overlay.setVisible(true);

// 오버레이 잠금 (마우스 투과)
await window.api.overlay.setLock(true);

// 오버레이 리사이징
await window.api.overlay.resize({
  width: 500,
  height: 400,
  anchor: "top-left",
});

// 오버레이 상태 변경 감시
window.api.overlay.onVisibility(({ visible }) => {
  console.log("오버레이 표시:", visible);
});
```

---

## 브릿지 (bridge)

브릿지 API는 **윈도우 간 통신 및 플러그인 간 통신**을 위한 API입니다.

**주요 기능**:

- 🪟 **윈도우 간 통신**: 메인 윈도우와 오버레이 윈도우 간에 메시지 전송
- 🔌 **플러그인 간 통신**: 같은 윈도우 또는 다른 윈도우의 플러그인들끼리 데이터 공유
- 📡 **브로드캐스트**: 모든 윈도우의 모든 플러그인에게 메시지 전송

**사용 사례**:

- KPS 계산 플러그인 → 통계 표시 플러그인으로 데이터 전달
- 녹화 플러그인 → 다른 플러그인들에게 녹화 상태 알림
- 설정 변경 → 모든 플러그인에게 테마/설정 변경 브로드캐스트

### `window.api.bridge.send(type, data)`

모든 윈도우의 모든 플러그인에게 메시지를 브로드캐스트합니다.

**매개변수**:

- `type: string` - 메시지 타입 (예: `'WPM_UPDATE'`, `'RECORDING_STATE'`)
- `data?: any` - 전송할 데이터 (선택사항)

**반환형**: `Promise<void>`

**사용 예**:

```javascript
// 오버레이 윈도우에서
await window.api.bridge.send("WPM_UPDATE", { value: 80, max: 200 });

// 메인 윈도우에서
await window.api.bridge.send("RECORDING_START", { timestamp: Date.now() });
```

---

### `window.api.bridge.sendTo(target, type, data)`

특정 윈도우에만 메시지를 전송합니다.

**매개변수**:

- `target: 'main' | 'overlay'` - 대상 윈도우
- `type: string` - 메시지 타입
- `data?: any` - 전송할 데이터 (선택사항)

**반환형**: `Promise<void>`

**사용 예**:

```javascript
// 오버레이 윈도우만 대상으로 전송
await window.api.bridge.sendTo("overlay", "THEME_CHANGED", { theme: "dark" });

// 메인 윈도우만 대상으로 전송
await window.api.bridge.sendTo("main", "KEY_PRESSED", { key: "KeyD" });
```

---

### `window.api.bridge.on(type, listener)`

특정 타입의 메시지를 구독합니다.

**매개변수**:

- `type: string` - 구독할 메시지 타입
- `listener: (data: any) => void` - 메시지 수신 시 호출될 콜백

**반환형**: `Unsubscribe` - 구독 해제 함수

**사용 예**:

```javascript
// 메인 윈도우에서 WPM 업데이트 수신
const unsub = window.api.bridge.on("WPM_UPDATE", (data) => {
  console.log("현재 WPM:", data.value);
  console.log("최대 WPM:", data.max);
  // UI 업데이트 로직
});

// 나중에 구독 해제
unsub();
```

---

### `window.api.bridge.once(type, listener)`

특정 타입의 메시지를 **1회만** 수신합니다.

**매개변수**:

- `type: string` - 구독할 메시지 타입
- `listener: (data: any) => void` - 메시지 수신 시 호출될 콜백 (1회 후 자동 해제)

**반환형**: `Unsubscribe` - 구독 해제 함수

**사용 예**:

```javascript
// 초기화 완료 메시지를 1회만 수신
window.api.bridge.once("INIT_COMPLETE", (data) => {
  console.log("플러그인 초기화 완료:", data);
});
```

---

### `window.api.bridge.onAny(listener)`

모든 타입의 메시지를 수신합니다. 디버깅이나 로깅에 유용합니다.

**매개변수**:

- `listener: (type: string, data: any) => void` - 메시지 수신 시 호출될 콜백

**반환형**: `Unsubscribe` - 구독 해제 함수

**사용 예**:

```javascript
// 모든 브릿지 메시지 로깅
const unsub = window.api.bridge.onAny((type, data) => {
  console.log(`[Bridge Message] ${type}:`, data);
});

// 정리
unsub();
```

---

### `window.api.bridge.off(type, listener?)`

메시지 구독을 해제합니다.

**매개변수**:

- `type: string` - 구독 해제할 메시지 타입
- `listener?: (data: any) => void` - 특정 리스너만 해제 (선택사항, 생략 시 해당 타입의 모든 리스너 해제)

**반환형**: `void`

**사용 예**:

```javascript
const myListener = (data) => console.log(data);

// 구독
window.api.bridge.on("WPM_UPDATE", myListener);

// 특정 리스너 해제
window.api.bridge.off("WPM_UPDATE", myListener);

// 또는 해당 타입의 모든 리스너 해제
window.api.bridge.off("WPM_UPDATE");
```

---

### 브릿지 사용 패턴

#### 패턴 1: 단순 이벤트 알림

```javascript
// 오버레이에서 전송
window.api.bridge.send("KEY_PRESSED", { key: "KeyD", timestamp: Date.now() });

// 메인에서 수신
window.api.bridge.on("KEY_PRESSED", ({ key, timestamp }) => {
  console.log(`${key} pressed at ${timestamp}`);
});
```

#### 패턴 2: 상태 동기화

```javascript
// 오버레이 플러그인 (KPS 계산)
let currentKPS = 0;
setInterval(() => {
  currentKPS = calculateKPS();
  window.api.bridge.send("KPS_UPDATE", { kps: currentKPS });
}, 100);

// 메인 플러그인 (KPS 표시)
window.api.bridge.on("KPS_UPDATE", ({ kps }) => {
  document.getElementById("kps-display").textContent = kps;
});
```

#### 패턴 3: 플러그인 간 데이터 공유

```javascript
// 플러그인 A (data-provider.js) - 데이터 제공자
// @id: data-provider
(function () {
  const sharedData = { score: 0, level: 1 };

  // 데이터 변경 시 다른 플러그인들에게 알림
  function updateData(newScore, newLevel) {
    sharedData.score = newScore;
    sharedData.level = newLevel;
    window.api.bridge.send("SHARED_DATA_UPDATE", sharedData);
  }

  // 예시: 1초마다 점수 증가
  setInterval(() => updateData(sharedData.score + 10, sharedData.level), 1000);
})();

// 플러그인 B (data-consumer.js) - 데이터 소비자
// @id: data-consumer
(function () {
  window.api.bridge.on("SHARED_DATA_UPDATE", (data) => {
    console.log("플러그인 A로부터 데이터 수신:", data);
    // 받은 데이터로 UI 업데이트
    updateUI(data.score, data.level);
  });
})();

// 플러그인 C (another-consumer.js) - 또 다른 소비자
// @id: another-consumer
(function () {
  // 같은 메시지를 여러 플러그인이 동시에 받을 수 있음!
  window.api.bridge.on("SHARED_DATA_UPDATE", (data) => {
    console.log("플러그인 C도 같은 데이터 수신:", data);
  });
})();
```

#### 패턴 4: 양방향 통신

```javascript
// 메인 윈도우: 데이터 요청
window.api.bridge.send("REQUEST_CURRENT_KPS", {});

// 오버레이 윈도우: 요청 처리 및 응답
window.api.bridge.on("REQUEST_CURRENT_KPS", () => {
  window.api.bridge.sendTo("main", "RESPONSE_CURRENT_KPS", {
    kps: currentKPS,
    max: maxKPS,
  });
});

// 메인 윈도우: 응답 수신
window.api.bridge.once("RESPONSE_CURRENT_KPS", ({ kps, max }) => {
  console.log("현재 KPS:", kps, "최대:", max);
});
```

#### 패턴 5: 플러그인 간 이벤트 시스템

```javascript
// 플러그인 A (event-emitter.js) - 이벤트 발생자
// @id: event-emitter
(function () {
  const button = document.createElement("button");
  button.textContent = "이벤트 발생";
  button.onclick = () => {
    // 모든 플러그인에게 이벤트 브로드캐스트
    window.api.bridge.send("CUSTOM_EVENT", {
      eventName: "buttonClicked",
      timestamp: Date.now(),
      data: { clickCount: 1 },
    });
  };
  document.body.appendChild(button);
})();

// 플러그인 B (event-listener-1.js) - 이벤트 리스너 1
// @id: event-listener-1
(function () {
  window.api.bridge.on("CUSTOM_EVENT", ({ eventName, timestamp, data }) => {
    console.log(`[리스너 1] ${eventName} 이벤트 수신:`, data);
  });
})();

// 플러그인 C (event-listener-2.js) - 이벤트 리스너 2
// @id: event-listener-2
(function () {
  window.api.bridge.on("CUSTOM_EVENT", ({ eventName, timestamp, data }) => {
    console.log(`[리스너 2] ${eventName} 이벤트 수신:`, data);
    // 다른 방식으로 처리 가능
  });
})();
```

#### 패턴 6: 타입 안전성 (TypeScript)

```typescript
// 메시지 타입 정의
type BridgeMessages = {
  WPM_UPDATE: { value: number; max: number };
  RECORDING_STATE: { isRecording: boolean };
  KEY_PRESSED: { key: string; timestamp: number };
};

// 타입 안전한 헬퍼 함수
function sendBridgeMessage<K extends keyof BridgeMessages>(
  type: K,
  data: BridgeMessages[K]
) {
  return window.api.bridge.send(type, data);
}

function onBridgeMessage<K extends keyof BridgeMessages>(
  type: K,
  listener: (data: BridgeMessages[K]) => void
) {
  return window.api.bridge.on(type, listener);
}

// 사용
sendBridgeMessage("WPM_UPDATE", { value: 80, max: 200 }); // 타입 체크됨
onBridgeMessage("WPM_UPDATE", (data) => {
  console.log(data.value); // 자동완성 지원
});
```

---

## 플러그인 (plugin)

플러그인 API는 커스텀 JS 플러그인에서 사용할 수 있는 추가 기능을 제공합니다.

### 플러그인 ID (`@id`)

각 플러그인은 고유한 ID를 가져야 데이터를 안정적으로 관리할 수 있습니다. 플러그인 파일의 상단에 `@id` 메타데이터를 추가하여 고유 ID를 지정할 수 있습니다.

**형식**:

```javascript
// @id: your-plugin-id
```

**규칙**:

- ID는 소문자, 숫자, 하이픈(`-`), 언더스코어(`_`)만 사용 가능
- kebab-case 형식 권장 (예: `kps-counter`, `settings-panel`)
- 파일 첫 20줄 이내에 위치해야 함

**예시**:

```javascript
// @id: kps-counter

(function () {
  // 플러그인 코드...
})();
```

**동작**:

- `@id`가 있는 경우: 지정한 ID를 플러그인 네임스페이스로 사용
- `@id`가 없는 경우: 파일명을 자동으로 정규화하여 사용 (예: `my-plugin.js` → `my-plugin`)

**중요**:

- 같은 `@id`를 가진 플러그인은 데이터를 공유합니다
- 플러그인을 삭제 후 재설치해도 `@id`가 같으면 기존 데이터를 재사용합니다
- ID를 변경하면 기존 데이터에 접근할 수 없게 되므로 신중하게 선택하세요

---

### 스토리지 (`window.api.plugin.storage`)

플러그인별로 데이터를 영속적으로 저장할 수 있는 스토리지 API입니다. 모든 데이터는 앱의 설정 파일에 함께 저장됩니다.

**✨ 자동 네임스페이스:** 각 플러그인이 실행될 때 `window.api.plugin.storage`는 자동으로 해당 플러그인의 네임스페이스로 래핑됩니다. prefix를 수동으로 관리할 필요가 없으며, 다른 플러그인과의 충돌 걱정도 없습니다.

#### `window.api.plugin.storage.get(key)`

스토리지에서 데이터를 조회합니다. 키는 자동으로 플러그인 ID가 prefix로 추가됩니다.

**매개변수**:

- `key: string` - 조회할 데이터의 키

**반환형**: `Promise<T | null>` - 저장된 데이터 (없으면 `null`)

**사용 예**:

```javascript
// 간단하게 키만 사용 (자동으로 네임스페이스 적용)
const position = await window.api.plugin.storage.get("panel-position");
if (position) {
  panel.style.left = position.x + "px";
  panel.style.top = position.y + "px";
}

// 타입 지정 (TypeScript)
interface PanelPosition {
  x: number;
  y: number;
}
const position =
  (await window.api.plugin.storage.get) < PanelPosition > "panel-position";
```

---

#### `window.api.plugin.storage.set(key, value)`

스토리지에 데이터를 저장합니다. 키는 자동으로 플러그인 ID가 prefix로 추가됩니다. 객체, 배열, 문자열, 숫자 등 JSON 직렬화 가능한 모든 값을 저장할 수 있습니다.

**매개변수**:

- `key: string` - 저장할 데이터의 키
- `value: any` - 저장할 데이터 (JSON 직렬화 가능해야 함)

**반환형**: `Promise<void>`

**사용 예**:

```javascript
// 간단한 값 저장
await window.api.plugin.storage.set("theme", "dark");

// 객체 저장
await window.api.plugin.storage.set("settings", {
  enabled: true,
  fontSize: 14,
  position: { x: 100, y: 200 },
});

// 배열 저장
await window.api.plugin.storage.set("history", [
  { timestamp: Date.now(), action: "start" },
  { timestamp: Date.now() + 1000, action: "stop" },
]);
```

---

#### `window.api.plugin.storage.remove(key)`

특정 키의 데이터를 삭제합니다.

**매개변수**:

- `key: string` - 삭제할 데이터의 키

**반환형**: `Promise<void>`

**사용 예**:

```javascript
await window.api.plugin.storage.remove("panel-position");
```

---

#### `window.api.plugin.storage.clear()`

이 플러그인이 저장한 모든 데이터를 삭제합니다.

**반환형**: `Promise<void>`

**사용 예**:

```javascript
// 초기화 버튼 클릭 시
resetButton.addEventListener("click", async () => {
  const confirmed = confirm("모든 플러그인 데이터를 삭제하시겠습니까?");
  if (confirmed) {
    await window.api.plugin.storage.clear();
    console.log("플러그인 데이터가 초기화되었습니다.");
  }
});
```

---

#### `window.api.plugin.storage.keys()`

이 플러그인이 저장한 모든 키의 목록을 조회합니다.

**반환형**: `Promise<string[]>` - 키 목록 (자동으로 prefix가 제거된 순수 키만 반환)

**사용 예**:

```javascript
const allKeys = await window.api.plugin.storage.keys();
console.log("저장된 키:", allKeys); // ['settings', 'position', 'theme']

// 모든 데이터 순회
for (const key of allKeys) {
  const value = await window.api.plugin.storage.get(key);
  console.log(`${key}:`, value);
}
```

---

### 스토리지 사용 패턴

#### 패턴 1: 설정 저장 및 복원

```javascript
// 플러그인 초기화 시 설정 복원
const defaultSettings = {
  panelVisible: true,
  position: { x: 10, y: 10 },
  fontSize: 12,
};

const settings =
  (await window.api.plugin.storage.get("settings")) || defaultSettings;

// 설정 변경 시 자동 저장
function updateSetting(key, value) {
  settings[key] = value;
  window.api.plugin.storage.set("settings", settings);
}

// 사용
updateSetting("fontSize", 14);
```

#### 패턴 2: 히스토리 관리

```javascript
// 키 입력 히스토리 저장
const MAX_HISTORY = 100;

async function addToHistory(key) {
  const history = (await window.api.plugin.storage.get("key-history")) || [];

  history.push({
    key,
    timestamp: Date.now(),
  });

  // 최대 개수 제한
  if (history.length > MAX_HISTORY) {
    history.shift();
  }

  await window.api.plugin.storage.set("key-history", history);
}

// 히스토리 조회
const history = (await window.api.plugin.storage.get("key-history")) || [];
console.log("최근 키 입력:", history.slice(-10));
```

#### 패턴 3: 캐싱

```javascript
// 비용이 큰 계산 결과 캐싱
async function getExpensiveData(mode) {
  const cacheKey = `stats-cache-${mode}`;
  const cached = await window.api.plugin.storage.get(cacheKey);

  // 캐시가 있고 1시간 이내면 사용
  if (cached && Date.now() - cached.timestamp < 3600000) {
    return cached.data;
  }

  // 새로 계산
  const data = await calculateExpensiveStats(mode);

  // 캐시 저장
  await window.api.plugin.storage.set(cacheKey, {
    data,
    timestamp: Date.now(),
  });

  return data;
}
```

#### 패턴 4: 마이그레이션

```javascript
// 버전 관리 및 데이터 마이그레이션
const CURRENT_VERSION = 2;

async function initializeStorage() {
  const version = (await window.api.plugin.storage.get("version")) || 1;

  if (version < CURRENT_VERSION) {
    // 마이그레이션 수행
    if (version === 1) {
      const oldSettings = await window.api.plugin.storage.get("settings");
      // v1 → v2 변환
      const newSettings = {
        ...oldSettings,
        newFeature: true,
      };
      await window.api.plugin.storage.set("settings", newSettings);
    }

    await window.api.plugin.storage.set("version", CURRENT_VERSION);
    console.log(
      `스토리지 마이그레이션 완료: v${version} → v${CURRENT_VERSION}`
    );
  }
}
```

---

### 클린업 (`window.api.plugin.registerCleanup`)

플러그인이 재로드될 때 자동으로 실행할 정리 작업을 등록합니다. 이벤트 리스너 제거, 타이머 정리, DOM 요소 제거 등 메모리 누수 방지를 위한 정리 작업을 안전하게 처리할 수 있습니다.

#### `window.api.plugin.registerCleanup(cleanup)`

플러그인 재로드 시 실행될 클린업 함수를 등록합니다.

**매개변수**:

- `cleanup: () => void` - 플러그인 재로드 시 실행할 함수

**반환형**: `void`

**사용 예 (권장)** - 단일 등록:

```javascript
// @id: my-plugin

(function () {
  // UI 요소 생성
  const panel = document.createElement("div");
  panel.id = "my-plugin-panel";
  document.body.appendChild(panel);

  // 이벤트 리스너 추가
  const handleKeyPress = (e) => console.log("Key:", e.key);
  window.addEventListener("keydown", handleKeyPress);

  // 타이머 설정
  const intervalId = setInterval(() => {
    console.log("Update");
  }, 1000);

  // 모든 정리 작업을 한 번에 등록 (권장)
  window.api.plugin.registerCleanup(() => {
    // DOM 정리
    const existingPanel = document.getElementById("my-plugin-panel");
    if (existingPanel) {
      existingPanel.remove();
    }

    // 이벤트 리스너 정리
    window.removeEventListener("keydown", handleKeyPress);

    // 타이머 정리
    clearInterval(intervalId);

    console.log("Plugin cleanup completed");
  });
})();
```

**사용 예 (고급)** - 여러 번 등록:

```javascript
// @id: advanced-plugin

(function () {
  // DOM 요소 생성
  const panel = document.createElement("div");
  document.body.appendChild(panel);
  window.api.plugin.registerCleanup(() => panel.remove());

  // 이벤트 리스너 추가
  const handler = () => console.log("Click");
  panel.addEventListener("click", handler);
  window.api.plugin.registerCleanup(() =>
    panel.removeEventListener("click", handler)
  );

  // 타이머 설정
  const timerId = setInterval(() => console.log("Tick"), 1000);
  window.api.plugin.registerCleanup(() => clearInterval(timerId));

  // 각 리소스마다 개별 등록 가능
  // 플러그인 재로드 시 모두 자동 실행됨
})();
```

**동작**:

- 플러그인이 재로드될 때 등록된 모든 클린업 함수가 자동으로 실행됩니다
- 여러 번 호출하여 여러 클린업 함수를 등록할 수 있습니다
- 등록된 순서와 상관없이 모두 안전하게 실행됩니다
- 각 플러그인의 클린업은 독립적으로 관리됩니다

**중요**:

- 클린업 함수는 플러그인 코드가 다시 로드되기 전에 실행됩니다
- 메모리 누수 방지를 위해 모든 이벤트 리스너, 타이머, DOM 요소를 정리해야 합니다
- 비동기 작업(Promise, setTimeout 등)도 적절히 정리해야 합니다

**언제 클린업이 실행되나요?**

- 플러그인 파일을 저장하여 재로드할 때
- 앱 설정에서 플러그인을 비활성화할 때
- 앱을 종료할 때

**클린업이 필요한 경우**:

- ✅ `addEventListener`로 이벤트 리스너를 추가했을 때 → `removeEventListener`
- ✅ `setInterval` / `setTimeout`을 사용했을 때 → `clearInterval` / `clearTimeout`
- ✅ DOM 요소를 생성했을 때 → `element.remove()`
- ✅ 전역 변수를 설정했을 때 → `delete window.variableName`
- ✅ 외부 리소스(WebSocket, API 연결 등)를 생성했을 때 → 연결 종료

---

## UI (ui)

UI API는 플러그인이 앱의 사용자 인터페이스를 확장할 수 있도록 하는 API입니다. **메인 윈도우에서만 사용 가능합니다.**

### 컨텍스트 메뉴 (`window.api.ui.contextMenu`)

플러그인이 그리드의 키/빈 공간 우클릭 메뉴에 커스텀 메뉴 아이템을 추가할 수 있습니다.

#### `window.api.ui.contextMenu.addKeyMenuItem(item)`

키 컨텍스트 메뉴에 아이템을 추가합니다.

**매개변수**:

- `item: PluginMenuItem<KeyMenuContext>`

```typescript
interface PluginMenuItem<TContext> {
  id: string; // 플러그인 내 고유 ID
  label: string; // 표시 텍스트
  disabled?: boolean | ((context: TContext) => boolean); // 비활성화 조건
  visible?: boolean | ((context: TContext) => boolean); // 표시 조건
  position?: "top" | "bottom"; // 기본 메뉴 기준 위치 (기본: bottom)
  onClick: (context: TContext) => void | Promise<void>; // 클릭 핸들러
}

interface KeyMenuContext {
  keyCode: string; // 키 코드 (예: "KeyD")
  index: number; // 키 인덱스
  position: KeyPosition; // 키 위치 정보
  mode: string; // 현재 키 모드 (예: "4key")
}
```

**반환형**: `string` - 메뉴 아이템의 전역 고유 ID (`pluginId:itemId`)

**사용 예**:

```javascript
const menuId = window.api.ui.contextMenu.addKeyMenuItem({
  id: "export-stats",
  label: "통계 내보내기",
  position: "bottom",
  // 조건부 표시: 4key 모드에서만
  visible: (context) => context.mode === "4key",
  // 조건부 비활성화: 카운트가 0이면
  disabled: (context) => context.position.count === 0,
  onClick: async (context) => {
    console.log("키 코드:", context.keyCode);
    console.log("카운트:", context.position.count);
    // 통계 내보내기 로직
  },
});
```

---

#### `window.api.ui.contextMenu.addGridMenuItem(item)`

그리드 빈 공간 컨텍스트 메뉴에 아이템을 추가합니다.

**매개변수**:

- `item: PluginMenuItem<GridMenuContext>`

```typescript
interface GridMenuContext {
  position: { dx: number; dy: number }; // 클릭 위치 (그리드 좌표)
  mode: string; // 현재 키 모드
}
```

**반환형**: `string` - 메뉴 아이템의 전역 고유 ID

**사용 예**:

```javascript
window.api.ui.contextMenu.addGridMenuItem({
  id: "add-timer",
  label: "타이머 추가",
  onClick: async (context) => {
    console.log("클릭 위치:", context.position);
    // 타이머 위젯 추가 로직
  },
});
```

---

#### `window.api.ui.contextMenu.removeMenuItem(fullId)`

특정 메뉴 아이템을 제거합니다.

**매개변수**:

- `fullId: string` - `addKeyMenuItem` 또는 `addGridMenuItem`에서 반환된 전역 ID

**반환형**: `void`

**사용 예**:

```javascript
const id = window.api.ui.contextMenu.addKeyMenuItem({...});

// 나중에 제거
window.api.ui.contextMenu.removeMenuItem(id);
```

---

#### `window.api.ui.contextMenu.updateMenuItem(fullId, updates)`

메뉴 아이템을 업데이트합니다.

**매개변수**:

- `fullId: string` - 메뉴 아이템 ID
- `updates: Partial<PluginMenuItem>` - 업데이트할 필드

**반환형**: `void`

**사용 예**:

```javascript
const id = window.api.ui.contextMenu.addKeyMenuItem({
  id: "toggle-feature",
  label: "기능 활성화",
  onClick: () => {},
});

// 라벨 변경
window.api.ui.contextMenu.updateMenuItem(id, {
  label: "기능 비활성화",
  disabled: true,
});
```

---

#### `window.api.ui.contextMenu.clearMyMenuItems()`

현재 플러그인이 추가한 모든 메뉴 아이템을 제거합니다.

**반환형**: `void`

**사용 예**:

```javascript
// 클린업 시 호출
window.__dmn_custom_js_cleanup = function () {
  window.api.ui.contextMenu.clearMyMenuItems();
  delete window.__dmn_custom_js_cleanup;
};
```

---

### 컨텍스트 메뉴 사용 패턴

#### 패턴 1: 기본 메뉴 아이템

```javascript
(function () {
  if (window.__dmn_custom_js_cleanup) window.__dmn_custom_js_cleanup();
  if (window.__dmn_window_type !== "main") return;

  window.api.ui.contextMenu.addKeyMenuItem({
    id: "copy-keycode",
    label: "키 코드 복사",
    onClick: (context) => {
      navigator.clipboard.writeText(context.keyCode);
      console.log("복사됨:", context.keyCode);
    },
  });

  window.__dmn_custom_js_cleanup = function () {
    window.api.ui.contextMenu.clearMyMenuItems();
    delete window.__dmn_custom_js_cleanup;
  };
})();
```

#### 패턴 2: 조건부 표시/비활성화

```javascript
window.api.ui.contextMenu.addKeyMenuItem({
  id: "export-if-has-data",
  label: "데이터 내보내기",
  // 카운트가 100 이상일 때만 표시
  visible: (context) => context.position.count >= 100,
  // 짝수 인덱스만 활성화
  disabled: (context) => context.index % 2 !== 0,
  onClick: async (context) => {
    const data = await collectData(context.keyCode);
    exportData(data);
  },
});
```

#### 패턴 3: 동적 업데이트

```javascript
let isRecording = false;

const menuId = window.api.ui.contextMenu.addKeyMenuItem({
  id: "toggle-recording",
  label: "녹화 시작",
  onClick: () => {
    isRecording = !isRecording;

    // 메뉴 라벨 업데이트
    window.api.ui.contextMenu.updateMenuItem(menuId, {
      label: isRecording ? "녹화 중지" : "녹화 시작",
    });
  },
});
```

#### 패턴 4: 그리드 메뉴 활용

```javascript
window.api.ui.contextMenu.addGridMenuItem({
  id: "add-custom-widget",
  label: "커스텀 위젯 추가",
  // 현재 모드가 4key일 때만 표시
  visible: (context) => context.mode === "4key",
  onClick: async (context) => {
    // 클릭한 위치에 위젯 추가
    const { dx, dy } = context.position;
    await createWidget(dx, dy);
  },
});
```

#### 패턴 5: 여러 메뉴 관리

```javascript
(function () {
  if (window.__dmn_custom_js_cleanup) window.__dmn_custom_js_cleanup();
  if (window.__dmn_window_type !== "main") return;

  const menuIds = [];

  // 여러 메뉴 추가
  menuIds.push(
    window.api.ui.contextMenu.addKeyMenuItem({
      id: "action1",
      label: "액션 1",
      onClick: () => console.log("액션 1"),
    })
  );

  menuIds.push(
    window.api.ui.contextMenu.addKeyMenuItem({
      id: "action2",
      label: "액션 2",
      onClick: () => console.log("액션 2"),
    })
  );

  menuIds.push(
    window.api.ui.contextMenu.addGridMenuItem({
      id: "grid-action",
      label: "그리드 액션",
      onClick: () => console.log("그리드 액션"),
    })
  );

  window.__dmn_custom_js_cleanup = function () {
    // 방법 1: 개별 제거
    menuIds.forEach((id) => window.api.ui.contextMenu.removeMenuItem(id));

    // 방법 2: 일괄 제거 (더 간단)
    // window.api.ui.contextMenu.clearMyMenuItems();

    delete window.__dmn_custom_js_cleanup;
  };
})();
```

---

### Display Element (`window.api.ui.displayElement`)

Display Element는 메인 그리드에서 만든 패널을 오버레이와 동기화하고, 플러그인별로 상태를 갖는 미니 UI를 렌더링할 때 사용하는 저수준 DOM API입니다.

#### 핵심 특징

- **인스턴스 기반**: `displayElement.add()`는 이제 `DisplayElementInstance`를 반환하며, 이 인스턴스를 통해 상태/DOM 조작을 수행합니다.
- **템플릿 + 상태**: `state`와 `template` 옵션을 전달하면 React 없이도 간단한 상태 기반 렌더링을 구현할 수 있습니다.
- **양방향 조작**: 인스턴스 메서드 외에도 `window.api.ui.displayElement.setState(instance, updates)`처럼 전역 헬퍼도 계속 사용할 수 있습니다.
- **양 창 동기화**: 메인에서 작성한 HTML은 자동으로 오버레이로 복제되며, 위치 변경도 실시간 반영됩니다.
- **드래그 & 컨텍스트 메뉴**: 기존과 동일하게 드래그, 앵커, 우클릭 메뉴, Shadow DOM 스코핑을 지원합니다.

#### 인스턴스 & 템플릿 빠른 예제

```javascript
const panel = window.api.ui.displayElement.add({
  position: { x: 140, y: 90 },
  draggable: true,
  state: { kps: 0, history: [] },
  template: (state) => `
    <style>
      .card { padding: 16px; border-radius: 12px; background: #111827; color: white; }
      .bars { display: flex; gap: 4px; align-items: flex-end; height: 40px; }
      .bars span { flex: 1; background: #6366f1; border-radius: 4px 4px 0 0; }
    </style>
    <div class="card">
      <strong>${state.kps.toFixed(1)} KPS</strong>
      <div class="bars">
        ${state.history
          .map(
            (value) =>
              `<span style="height:${
                state.max ? Math.round((value / state.max) * 100) : 0
              }%"></span>`
          )
          .join("")}
      </div>
    </div>
  `,
});

window.api.bridge.on("KPS_UPDATE", ({ kps, max }) => {
  const history = [...panel.getState().history, kps].slice(-24);
  panel.setState({ kps, max, history });
});

window.api.plugin.registerCleanup(() => panel.remove());
```

#### `window.api.ui.displayElement.add(config)`

그리드/오버레이 모두에 표시될 요소를 생성하고 `DisplayElementInstance`를 반환합니다.

```typescript
type PluginDisplayElementConfig = {
  html: string; // 기본 HTML (template이 있다면 초기 렌더링 후 template 출력으로 대체)
  position: { x: number; y: number };
  anchor?: { keyCode: string; offset?: { x: number; y: number } };
  draggable?: boolean;
  zIndex?: number;
  scoped?: boolean;
  className?: string;
  style?: Record<string, string>;
  estimatedSize?: { width: number; height: number };
  onClick?: string | (() => void | Promise<void>);
  onPositionChange?:
    | string
    | ((pos: { x: number; y: number }) => void | Promise<void>);
  onDelete?: string | (() => void | Promise<void>);
  contextMenu?: PluginDisplayElementContextMenu;
  state?: Record<string, any>;
  template?: (
    state: Record<string, any>,
    helpers?: {
      html(
        strings: TemplateStringsArray,
        ...values: unknown[]
      ): DisplayElementTemplateResult;
    }
  ) => string | DisplayElementTemplateResult;
};
```

- `state`가 있으면 내부적으로 얕은 복사본을 유지하며, `template`은 `setState()` 호출 시마다 다시 실행됩니다.
- `window.api.ui.displayElement.template` 태그를 사용하면 `const { html } = window.api.ui.displayElement` 없이도 템플릿을 작성할 수 있습니다.
- 템플릿 리터럴 내부에서는 `${(state) => state.value}` 혹은 `${(state, helpers) => helpers.html`...`}`과 같이 상태/헬퍼를 직접 활용할 수 있습니다.
- 기존처럼 `(state) => html\`...\``함수를 수동 정의해도 되며, 이때 두 번째 인자로 제공되는`helpers`객체에서`html` helper를 사용할 수 있습니다.
- 반환된 인스턴스는 문자열처럼 사용할 수 있으며(`String` 상속), 다른 API에 그대로 전달 가능합니다.

#### `window.api.ui.displayElement.template\`...\``

템플릿을 보다 선언적으로 작성할 수 있는 **태그드 템플릿 헬퍼**입니다. 내부적으로 `html` helper를 자동 주입하므로 별도 임포트가 필요 없습니다.

```javascript
const panelTemplate = window.api.ui.displayElement.template`
  <div class="panel">
    <strong>${(state) => state.value}</strong>
    <div class="history">${(state) =>
      state.history.map((v) => `<span style="height:${v}%"></span>`).join("")}
    </div>
  </div>
`;

window.api.ui.displayElement.add({
  position: { x: 80, y: 60 },
  state: { value: 0, history: [] },
  template: panelTemplate,
});
```

- `${(state) => state.value}`처럼 **상태 기반 값**을 직접 기입할 수 있으며, 함수 리턴값은 자동으로 문자열화됩니다.
- `${(state, helpers) => helpers.html`<span>HTML</span>`}`처럼 **일부 구간만 `html` helper**로 감쌀 수도 있습니다.
- 함수 대신 문자열/숫자 literal을 그대로 넣을 수도 있고, 필요한 경우 일반 템플릿 함수(`(state) => html\`...\``)도 계속 지원됩니다.

#### DisplayElementInstance 메서드

`add()`의 반환값은 아래 메서드를 제공합니다.

- `setState(updates)` / `setData(updates)` : 상태 병합 후 템플릿 재렌더
- `getState()` : 현재 상태 스냅샷을 반환
- `setText(selector, text)` / `setHTML(selector, html)`
- `setStyle(selector, styles)`
- `addClass` / `removeClass` / `toggleClass`
- `query(selector)` : Shadow DOM 안쪽까지 탐색
- `update(partialConfig)` : 저수준 `displayElement.update`에 위임
- `remove()` : 요소 제거 및 인스턴스 폐기

> `selector`에 `":root"`를 넘기면 루트 컨테이너를 대상으로 하며, Shadow DOM을 켰을 때도 스코프 안쪽 DOM만 변형됩니다.

#### `window.api.ui.displayElement.get(fullId)`

문자열 ID로 인스턴스를 다시 가져옵니다. 이미 받은 인스턴스를 캐시하고 싶지 않은 경우에 유용합니다.

```javascript
const savedId = await window.api.plugin.storage.get("panelId");
const panel = savedId && window.api.ui.displayElement.get(savedId);
panel?.setText(":root", "Hello");
```

#### 전역 헬퍼 함수

모든 DOM 조작 헬퍼는 `string` ID 또는 `DisplayElementInstance` 어느 쪽이든 받습니다.

##### `window.api.ui.displayElement.setState(target, updates)`

상태를 병합하고 템플릿을 다시 렌더링합니다.

```javascript
window.api.ui.displayElement.setState(panel, { count: 5 });
// panel.setState({ count: 5 })와 동일
```

##### `window.api.ui.displayElement.setData(target, updates)`

`setState`의 별칭입니다.

```javascript
window.api.ui.displayElement.setData(panel, { value: 10 });
```

##### `window.api.ui.displayElement.setText(target, selector, text)`

선택자로 지정한 요소의 텍스트를 설정합니다.

```javascript
// 루트 요소의 텍스트 변경
window.api.ui.displayElement.setText(panel, ":root", "Hello World");

// 특정 클래스의 텍스트 변경
window.api.ui.displayElement.setText(panel, ".counter", "42");
```

##### `window.api.ui.displayElement.setHTML(target, selector, html)`

선택자로 지정한 요소의 innerHTML을 설정합니다.

```javascript
window.api.ui.displayElement.setHTML(
  panel,
  ".content",
  "<strong>Bold</strong> text"
);
```

##### `window.api.ui.displayElement.setStyle(target, selector, styles)`

선택자로 지정한 요소에 스타일을 적용합니다.

```javascript
window.api.ui.displayElement.setStyle(panel, ":root", {
  background: "#1a1a1a",
  color: "#fff",
  padding: "20px",
});

// 특정 요소 스타일링
window.api.ui.displayElement.setStyle(panel, ".graph", {
  height: "60px",
  opacity: "0.8",
});
```

##### `window.api.ui.displayElement.addClass(target, selector, ...classNames)`

선택자로 지정한 요소에 CSS 클래스를 추가합니다.

```javascript
window.api.ui.displayElement.addClass(panel, ":root", "active", "highlighted");

// 인스턴스 메서드도 동일
panel.addClass(".status", "online");
```

##### `window.api.ui.displayElement.removeClass(target, selector, ...classNames)`

선택자로 지정한 요소에서 CSS 클래스를 제거합니다.

```javascript
window.api.ui.displayElement.removeClass(panel, ":root", "loading");
```

##### `window.api.ui.displayElement.toggleClass(target, selector, className)`

선택자로 지정한 요소의 CSS 클래스를 토글합니다.

```javascript
window.api.ui.displayElement.toggleClass(panel, ".icon", "spinning");
```

##### `window.api.ui.displayElement.query(target, selector)`

선택자로 요소를 검색합니다. Shadow DOM을 사용해도 안전하게 탐색합니다.

```javascript
const element = window.api.ui.displayElement.query(panel, ".graph");
if (element) {
  console.log("Found element:", element);
}

// 루트 요소 가져오기
const root = window.api.ui.displayElement.query(panel, ":root");
```

**참고**: 인스턴스 메서드를 바로 호출하는 편이 간결하지만, 저장된 문자열 ID만 있는 기존 플러그인을 위해 전역 헬퍼 역시 유지됩니다.

#### `window.api.ui.displayElement.update(target, updates)`

드래그 가능 여부, 앵커, 위치, 컨텍스트 메뉴 등의 메타데이터를 수정합니다.

```javascript
panel.update({ draggable: false });

// 또는 전역 헬퍼
window.api.ui.displayElement.update(panel, {
  anchor: { keyCode: "KeyF", offset: { x: 0, y: 32 } },
});
```

#### `window.api.ui.displayElement.remove(target)`

문자열 ID나 인스턴스를 넘겨 요소를 제거합니다.

```javascript
window.api.ui.displayElement.remove(panel);
// panel.remove()와 동일
```

#### `window.api.ui.displayElement.clearMyElements()`

현재 플러그인이 추가한 모든 Display Element를 제거합니다. 클린업 시 가장 간단한 정리 방법입니다.

```javascript
window.api.plugin.registerCleanup(() => {
  window.api.ui.displayElement.clearMyElements();
});
```

---

### Display Element 사용 패턴

#### 패턴 1: 키 통계 표시

```javascript
(function () {
  if (window.__dmn_custom_js_cleanup) window.__dmn_custom_js_cleanup();
  if (window.__dmn_window_type !== "main") return;

  let statElement = null;

  // 키 카운터 구독
  const unsubscribe = window.api.keys.onCounterChanged((update) => {
    if (update.key === "KeyD") {
      if (!statElement) {
        // 첫 업데이트 시 요소 생성
        statElement = window.api.ui.displayElement.add({
          html: `<div style="background: rgba(0,0,0,0.8); color: white; padding: 5px 10px; border-radius: 5px;">D: ${update.count}</div>`,
          position: { x: 0, y: 0 },
          anchor: { keyCode: "KeyD", offset: { x: 70, y: 0 } },
          zIndex: 100,
        });
      } else {
        // 기존 요소 업데이트
        window.api.ui.displayElement.update(statElement, {
          html: `<div style="background: rgba(0,0,0,0.8); color: white; padding: 5px 10px; border-radius: 5px;">D: ${update.count}</div>`,
        });
      }
    }
  });

  window.__dmn_custom_js_cleanup = function () {
    unsubscribe();
    window.api.ui.displayElement.clearMyElements();
    delete window.__dmn_custom_js_cleanup;
  };
})();
```

#### 패턴 2: 드래그 가능한 타이머

```javascript
(function () {
  if (window.__dmn_custom_js_cleanup) window.__dmn_custom_js_cleanup();
  if (window.__dmn_window_type !== "main") return;

  let seconds = 0;
  let timerId = null;

  const elementId = window.api.ui.displayElement.add({
    html: `
      <div id="timer-widget" style="
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 20px;
        border-radius: 10px;
        font-size: 24px;
        font-weight: bold;
        text-align: center;
        cursor: move;
        user-select: none;
      ">
        00:00
      </div>
    `,
    position: { x: 200, y: 100 },
    draggable: true,
    zIndex: 50,
  });

  // 타이머 시작
  timerId = setInterval(() => {
    seconds++;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const timeStr = `${String(mins).padStart(2, "0")}:${String(secs).padStart(
      2,
      "0"
    )}`;

    window.api.ui.displayElement.update(elementId, {
      html: `
        <div id="timer-widget" style="
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 20px;
          border-radius: 10px;
          font-size: 24px;
          font-weight: bold;
          text-align: center;
          cursor: move;
          user-select: none;
        ">
          ${timeStr}
        </div>
      `,
    });
  }, 1000);

  window.__dmn_custom_js_cleanup = function () {
    if (timerId) clearInterval(timerId);
    window.api.ui.displayElement.clearMyElements();
    delete window.__dmn_custom_js_cleanup;
  };
})();
```

#### 패턴 3: Shadow DOM으로 스타일 격리

```javascript
window.api.ui.displayElement.add({
  html: `
    <style>
      :host {
        display: block;
      }
      .widget {
        background: #ff6b6b;
        padding: 15px;
        border-radius: 8px;
        color: white;
        font-family: monospace;
      }
      .widget:hover {
        background: #ee5a52;
      }
    </style>
    <div class="widget">
      <h3>격리된 위젯</h3>
      <p>외부 CSS의 영향을 받지 않습니다</p>
    </div>
  `,
  position: { x: 300, y: 200 },
  scoped: true, // Shadow DOM 활성화
  draggable: true,
});
```

#### 패턴 4: onClick으로 상호작용 추가

```javascript
(function () {
  if (window.__dmn_custom_js_cleanup) window.__dmn_custom_js_cleanup();
  if (window.__dmn_window_type !== "main") return;

  let count = 0;
  let elementId = null;

  // 클릭 핸들러 정의
  window.handleCounterClick = () => {
    count++;
    window.api.ui.displayElement.update(elementId, {
      html: `<div style="background: #333; color: white; padding: 15px; border-radius: 8px; cursor: pointer; user-select: none;">
        클릭 횟수: ${count}
      </div>`,
    });
  };

  // Display Element 생성
  elementId = window.api.ui.displayElement.add({
    html: `<div style="background: #333; color: white; padding: 15px; border-radius: 8px; cursor: pointer; user-select: none;">
      클릭 횟수: 0
    </div>`,
    position: { x: 100, y: 100 },
    onClick: "handleCounterClick", // 핸들러 ID
    draggable: true,
  });

  window.__dmn_custom_js_cleanup = function () {
    delete window.handleCounterClick;
    window.api.ui.displayElement.clearMyElements();
    delete window.__dmn_custom_js_cleanup;
  };
})();
```

#### 패턴 5: 동적 앵커 변경

```javascript
let currentKeyCode = "KeyD";
let elementId = null;

// 초기 요소 생성
elementId = window.api.ui.displayElement.add({
  html: '<div style="background: yellow; padding: 10px;">→</div>',
  position: { x: 0, y: 0 },
  anchor: { keyCode: currentKeyCode, offset: { x: 70, y: 20 } },
});

// 키 이벤트 구독 - 활성 키에 따라 앵커 변경
window.api.keys.onKeyState((event) => {
  if (event.state === "DOWN") {
    currentKeyCode = event.key;
    window.api.ui.displayElement.update(elementId, {
      anchor: { keyCode: currentKeyCode, offset: { x: 70, y: 20 } },
    });
  }
});
```

#### 패턴 6: 여러 요소 관리

```javascript
(function () {
  if (window.__dmn_custom_js_cleanup) window.__dmn_custom_js_cleanup();
  if (window.__dmn_window_type !== "main") return;

  const elements = [];

  // 여러 요소 추가
  elements.push(
    window.api.ui.displayElement.add({
      html: '<div style="background: red; padding: 10px;">Element 1</div>',
      position: { x: 50, y: 50 },
    })
  );

  elements.push(
    window.api.ui.displayElement.add({
      html: '<div style="background: blue; padding: 10px;">Element 2</div>',
      position: { x: 150, y: 50 },
    })
  );

  elements.push(
    window.api.ui.displayElement.add({
      html: '<div style="background: green; padding: 10px;">Element 3</div>',
      position: { x: 250, y: 50 },
    })
  );

  window.__dmn_custom_js_cleanup = function () {
    // 방법 1: 개별 제거
    elements.forEach((id) => window.api.ui.displayElement.remove(id));

    // 방법 2: 일괄 제거 (더 간단)
    // window.api.ui.displayElement.clearMyElements();

    delete window.__dmn_custom_js_cleanup;
  };
})();
```

---

## 주의사항

1. **비동기 작업**: 모든 API 메서드는 `async` 작업입니다. `await` 또는 `.then()`을 사용하세요.

2. **구독 해제**: 이벤트 리스너는 컴포넌트 언마운트 시 반드시 구독을 해제하세요 (메모리 누수 방지).

3. **윈도우 타입**: `keys:state` 이벤트는 **오버레이 윈도우에서만** 수신 가능합니다.

4. **브릿지 메시지**: `window.api.bridge`는 윈도우 간 통신을 위한 것이며, 같은 윈도우 내에서도 동작하지만 주로 다른 윈도우와 통신할 때 사용합니다.

5. **스토리지 자동 네임스페이스**: `window.api.plugin.storage`는 각 플러그인이 실행될 때 자동으로 해당 플러그인의 네임스페이스로 래핑되어 데이터 충돌을 방지합니다. prefix를 수동으로 관리할 필요가 없습니다.

6. **스토리지 용량**: 플러그인 스토리지는 앱 설정 파일에 저장되므로 과도하게 큰 데이터는 저장하지 마세요. 권장 최대 크기: 각 키당 1MB 이하.

7. **오류 처리**: 파일 로드 등의 작업은 오류가 발생할 수 있으므로 반드시 처리하세요.

8. **타입 안전성**: TypeScript 프로젝트에서는 타입 정의를 활용하세요.

9. **개발자 모드**: 개발자 모드가 비활성화된 상태에서는 DevTools 접근이 키보드 단축키(Ctrl+Shift+I, F12) 차단으로 제한됩니다. 프로덕션 빌드에서 디버깅이 필요한 경우 설정 패널에서 개발자 모드를 활성화하세요.

10. **UI API**: `window.api.ui` API는 **메인 윈도우에서만** 사용 가능합니다. 오버레이 윈도우에서 호출 시 경고만 표시되고 동작하지 않습니다.

11. **컨텍스트 메뉴 자동 클린업**: 플러그인이 재주입되거나 비활성화될 때 해당 플러그인의 메뉴 아이템이 자동으로 제거됩니다. 하지만 명시적으로 `clearMyMenuItems()`를 호출하는 것을 권장합니다.

12. **Dialog API**: `window.api.ui.dialog`는 **메인 윈도우에서만** 사용 가능합니다. Promise 기반으로 동작하므로 `await`로 사용자 응답을 기다릴 수 있습니다.

13. **Components API**: `window.api.ui.components`는 HTML 문자열을 반환합니다. Display Element나 Custom Dialog 내부에서 사용하세요.

---

## Dialog API (`window.api.ui.dialog`)

플러그인이 사용자와 상호작용할 수 있도록 앱의 모달 시스템을 제공합니다. **메인 윈도우에서만** 사용 가능합니다.

**Components API와의 관계**: `dialog.custom()`을 사용하여 HTML 기반 커스텀 모달을 만들 때, `window.api.ui.components`의 컴포넌트 함수들을 활용하면 프로젝트 디자인 시스템과 일관된 UI를 구성할 수 있습니다.

### `window.api.ui.dialog.alert(message, options?)`

간단한 알림 대화상자를 표시합니다.

**매개변수**:

- `message: string` - 표시할 메시지
- `options?: { confirmText?: string }` - 선택적 설정
  - `confirmText`: 확인 버튼 텍스트 (기본값: "확인")

**반환형**: `Promise<void>`

**사용 예**:

```javascript
// 기본 알림
await window.api.ui.dialog.alert("저장되었습니다!");

// 커스텀 버튼 텍스트
await window.api.ui.dialog.alert("작업 완료", { confirmText: "OK" });
```

---

### `window.api.ui.dialog.confirm(message, options?)`

확인/취소 대화상자를 표시합니다.

**매개변수**:

- `message: string` - 표시할 메시지
- `options?: { confirmText?: string; cancelText?: string; danger?: boolean }` - 선택적 설정
  - `confirmText`: 확인 버튼 텍스트 (기본값: "확인")
  - `cancelText`: 취소 버튼 텍스트 (기본값: "취소")
  - `danger`: true면 확인 버튼이 빨간색 (삭제 등 위험한 작업)

**반환형**: `Promise<boolean>` - 확인 클릭 시 `true`, 취소 클릭 시 `false`

**사용 예**:

```javascript
// 기본 확인
const ok = await window.api.ui.dialog.confirm("정말 진행하시겠습니까?");
if (ok) {
  console.log("사용자가 확인을 눌렀습니다");
}

// 삭제 확인 (위험한 작업)
const confirmed = await window.api.ui.dialog.confirm(
  "모든 데이터가 삭제됩니다. 정말 삭제하시겠습니까?",
  {
    confirmText: "삭제",
    cancelText: "취소",
    danger: true,
  }
);

if (confirmed) {
  await window.api.plugin.storage.clear();
  await window.api.ui.dialog.alert("삭제되었습니다");
}
```

---

### Dialog 사용 패턴

#### 패턴 1: 저장 확인

```javascript
async function saveSettings(settings) {
  const confirmed = await window.api.ui.dialog.confirm(
    "설정을 저장하시겠습니까?"
  );

  if (confirmed) {
    await window.api.plugin.storage.set("settings", settings);
    await window.api.ui.dialog.alert("저장되었습니다!");
  }
}
```

#### 패턴 2: 데이터 삭제 확인

```javascript
async function deleteAllData() {
  const confirmed = await window.api.ui.dialog.confirm(
    "모든 플러그인 데이터가 삭제됩니다.\n이 작업은 취소할 수 없습니다.",
    { danger: true, confirmText: "삭제", cancelText: "취소" }
  );

  if (confirmed) {
    await window.api.plugin.storage.clear();
    await window.api.ui.dialog.alert("데이터가 삭제되었습니다");
  }
}
```

#### 패턴 3: 조건부 확인

```javascript
async function exportData() {
  const data = await window.api.plugin.storage.get("myData");

  if (!data || data.length === 0) {
    await window.api.ui.dialog.alert("내보낼 데이터가 없습니다");
    return;
  }

  const confirmed = await window.api.ui.dialog.confirm(
    `${data.length}개의 항목을 내보내시겠습니까?`
  );

  if (confirmed) {
    // 내보내기 로직
    console.log("Exporting...", data);
    await window.api.ui.dialog.alert("내보내기 완료!");
  }
}
```

---

## Components API (`window.api.ui.components`)

**Components API**는 앱의 디자인 시스템과 일치하는 UI 컴포넌트 HTML을 생성합니다.

#### Components API의 역할과 특성

- **모달 내부 구성 요소**: 주로 Custom Dialog(`dialog.custom()`) 내부에서 사용하여 일관된 UI를 구성합니다
- **HTML 문자열 반환**: 모든 컴포넌트 함수는 스타일이 적용된 HTML 문자열을 반환합니다
- **프로젝트 디자인 시스템**: Tailwind CSS 기반의 프로젝트 표준 스타일이 자동 적용됩니다
- **이벤트 핸들러 바인딩**: `onClick`, `onChange` 등의 핸들러를 문자열 ID로 등록하면 자동으로 플러그인 컨텍스트에서 실행됩니다
- **Display Element 사용 비권장**: Display Element는 오버레이 위에 표시되는 독립적인 UI 패널용이므로, 이 컴포넌트들을 Display Element에 직접 사용하는 것은 적절하지 않습니다

#### 권장 사용 패턴

```javascript
// ✅ 올바른 사용: Custom Dialog 내부에서 사용
async function showSettings() {
  const volumeInput = window.api.ui.components.input({
    type: "number",
    value: 50,
    width: 47,
    id: "volume",
  });

  const formHtml = `
    <div class="flex flex-col gap-[12px]">
      ${window.api.ui.components.formRow("볼륨", volumeInput)}
    </div>
  `;

  const confirmed = await window.api.ui.dialog.custom(formHtml, {
    confirmText: "저장",
    showCancel: true,
  });

  if (confirmed) {
    const value = document.getElementById("volume").value;
    // 저장 로직
  }
}

// ❌ 잘못된 사용: Display Element로 직접 추가 (권장하지 않음)
window.api.ui.displayElement.add({
  html: window.api.ui.components.button("클릭"), // 이렇게 사용하지 마세요
  position: { x: 10, y: 10 },
});

// ✅ Display Element 올바른 사용: 직접 HTML/CSS로 독립적인 패널 구성
const style = document.createElement("style");
style.textContent = `
  .my-panel { background: #1A191E; padding: 20px; border-radius: 13px; }
`;
document.head.appendChild(style);

const panel = document.createElement("div");
panel.className = "my-panel";
panel.innerHTML = "<div>커스텀 패널</div>";
document.body.appendChild(panel);
```

### `window.api.ui.components.button(text, options?)`

버튼 HTML을 생성합니다.

**매개변수**:

- `text: string` - 버튼 텍스트
- `options?: ButtonOptions` - 선택적 설정
  - `variant?: 'primary' | 'danger' | 'secondary'` - 버튼 스타일 (기본값: 'primary')
  - `size?: 'small' | 'medium' | 'large'` - 버튼 크기 (기본값: 'medium')
  - `disabled?: boolean` - 비활성화 여부 (기본값: false)
  - `fullWidth?: boolean` - 전체 너비 사용 (기본값: false)
  - `onClick?: string | function` - 이벤트 핸들러 (ID 또는 함수)
  - `id?: string` - DOM ID

**반환형**: `string` - HTML 문자열

**사용 예**:

```javascript
// 기본 버튼
const saveBtn = window.api.ui.components.button("저장");

// 위험한 작업 버튼
const deleteBtn = window.api.ui.components.button("삭제", {
  variant: "danger",
  onClick: "handleDelete",
});

// 비활성화된 버튼
const disabledBtn = window.api.ui.components.button("처리 중...", {
  disabled: true,
});
```

---

### `window.api.ui.components.checkbox(options?)`

체크박스(토글) HTML을 생성합니다.

**매개변수**:

- `options?: CheckboxOptions` - 선택적 설정
  - `checked?: boolean` - 체크 상태 (기본값: false)
  - `onChange?: string | function` - 이벤트 핸들러 (ID 또는 함수)
  - `id?: string` - DOM ID (label과 input 모두에 설정됨)

**반환형**: `string` - HTML 문자열

**참고**:

- `id`를 지정하면 label에는 `id`, 내부 input에는 `id-input` 형식으로 설정됩니다
- change 이벤트는 input에서 발생하므로, 핸들러에서 `e.target.id`는 `{id}-input` 형식입니다

**사용 예**:

```javascript
const enabledCheckbox = window.api.ui.components.checkbox({
  checked: true,
  id: "settings-enabled",
});

// 핸들러 예시
window.handleCheckboxChange = function (e) {
  // e.target.id는 "settings-enabled-input"
  const checked = e.target.checked;
  console.log("체크박스 상태:", checked);
};
```

---

### `window.api.ui.components.input(options?)`

인풋 필드 HTML을 생성합니다.

**매개변수**:

- `options?: InputOptions` - 선택적 설정
  - `type?: 'text' | 'number'` - 인풋 타입 (기본값: 'text')
  - `placeholder?: string` - 플레이스홀더 텍스트
  - `value?: string | number` - 초기값
  - `disabled?: boolean` - 비활성화 여부
  - `onInput?: string | function` - input 이벤트 핸들러 (ID 또는 함수)
  - `onChange?: string | function` - change 이벤트 핸들러 (ID 또는 함수)
  - `id?: string` - DOM ID
  - `width?: number` - 너비 (픽셀, 기본값: 200)
  - `min?: number` - 최소값 (type='number'일 때)
  - `max?: number` - 최대값 (type='number'일 때)
  - `step?: number` - 증감 단위 (type='number'일 때)

**반환형**: `string` - HTML 문자열

**자동 값 정규화**:

- `type="number"`이고 `min` 또는 `max`가 설정된 경우, 포커스를 잃을 때(`onBlur`) 자동으로 값을 검증합니다
- 빈 값이거나 유효하지 않은 값: `min` 값으로 설정 (min이 없으면 0)
- `min`보다 작은 값: `min`으로 제한
- `max`보다 큰 값: `max`로 제한
- 값이 변경되면 자동으로 `change` 이벤트가 발생합니다

**사용 예**:

```javascript
const nameInput = window.api.ui.components.input({
  placeholder: "이름 입력",
  value: "User",
  width: 150,
  id: "name-input",
});

const numberInput = window.api.ui.components.input({
  type: "number",
  value: 10,
  min: 0,
  max: 100,
  step: 5,
  width: 100,
  // 사용자가 150을 입력하고 포커스를 잃으면 자동으로 100으로 조정됨
  // 사용자가 -10을 입력하고 포커스를 잃으면 자동으로 0으로 조정됨
});
```

---

### `window.api.ui.components.dropdown(options)`

드롭다운 HTML을 생성합니다.

**매개변수**:

- `options: DropdownOptions` - 필수 설정
  - `options: Array<{ label: string; value: string }>` - 옵션 목록
  - `selected?: string` - 선택된 값
  - `placeholder?: string` - 플레이스홀더 (기본가: "선택")
  - `disabled?: boolean` - 비활성화 여부
  - `onChange?: string | function` - 이벤트 핸들러 (ID 또는 함수)
  - `id?: string` - DOM ID

**반환형**: `string` - HTML 문자열

**사용 예**:

```javascript
const themeDropdown = window.api.ui.components.dropdown({
  options: [
    { label: "다크", value: "dark" },
    { label: "라이트", value: "light" },
    { label: "자동", value: "auto" },
  ],
  selected: "dark",
  id: "theme-select",
});
```

---

### `window.api.ui.components.panel(content, options?)`

패널 컨테이너 HTML을 생성합니다.

**주의**: `panel` 컴포넌트는 **Display Element 전용**입니다. Custom Dialog 내부에서는 이미 모달 스타일이 적용되므로 `panel`을 사용하지 마세요.

**매개변수**:

- `content: string` - 패널 내부 HTML
- `options?: PanelOptions` - 선택적 설정
  - `title?: string` - 패널 제목
  - `width?: number` - 너비 (픽셀)

**반환형**: `string` - HTML 문자열

**사용 예**:

```javascript
// ✅ 올바른 사용: Display Element에 추가
const formHtml = `
  ${window.api.ui.components.formRow("이름", nameInput)}
  ${window.api.ui.components.formRow("테마", themeDropdown)}
`;

const panel = window.api.ui.components.panel(formHtml, {
  title: "설정",
  width: 400,
});

window.api.ui.displayElement.add({
  html: panel,
  position: { x: 10, y: 10 },
});

// ❌ 잘못된 사용: Custom Dialog 내부 (모달 중복)
// Custom Dialog는 이미 모달이므로 panel을 사용하지 마세요
const formHtml = `
  <div class="flex flex-col gap-[12px]">
    ${window.api.ui.components.formRow("이름", nameInput)}
  </div>
`;
await window.api.ui.dialog.custom(formHtml); // panel 없이 직접 사용
```

---

### `window.api.ui.components.formRow(label, component)`

폼 행 (라벨 + 컴포넌트) HTML을 생성합니다.

**매개변수**:

- `label: string` - 라벨 텍스트
- `component: string` - 컴포넌트 HTML

**반환형**: `string` - HTML 문자열

**사용 예**:

```javascript
const enabledRow = window.api.ui.components.formRow(
  "활성화",
  window.api.ui.components.checkbox({ checked: true })
);

const nameRow = window.api.ui.components.formRow(
  "사용자 이름",
  window.api.ui.components.input({ placeholder: "이름" })
);
```

---

### Components 사용 패턴

#### 패턴 1: 설정 패널

```javascript
function createSettingsPanel() {
  const enabledCheckbox = window.api.ui.components.checkbox({
    checked: true,
    id: "settings-enabled",
  });

  const themeDropdown = window.api.ui.components.dropdown({
    options: [
      { label: "다크", value: "dark" },
      { label: "라이트", value: "light" },
    ],
    selected: "dark",
    id: "theme-select",
  });

  const saveButton = window.api.ui.components.button("저장", {
    variant: "primary",
  });

  const cancelButton = window.api.ui.components.button("취소", {
    variant: "danger",
  });

  const form = `
    ${window.api.ui.components.formRow("활성화", enabledCheckbox)}
    ${window.api.ui.components.formRow("테마", themeDropdown)}
    <div class="flex gap-[10.5px] justify-end">
      ${saveButton}
      ${cancelButton}
    </div>
  `;

  return window.api.ui.components.panel(form, {
    title: "설정",
    width: 400,
  });
}

// Display Element로 표시
const panelHtml = createSettingsPanel();
window.api.ui.displayElement.add({
  html: panelHtml,
  position: { x: 100, y: 100 },
  draggable: true,
});
```

#### 패턴 2: 입력 폼

```javascript
const nameInput = window.api.ui.components.input({
  placeholder: "이름을 입력하세요",
  id: "name-input",
});

const ageInput = window.api.ui.components.input({
  type: "number",
  value: 20,
  width: 100,
  id: "age-input",
});

const submitBtn = window.api.ui.components.button("제출", {
  variant: "primary",
});

const formHtml = `
  ${window.api.ui.components.formRow("이름", nameInput)}
  ${window.api.ui.components.formRow("나이", ageInput)}
  <div class="flex justify-end mt-4">${submitBtn}</div>
`;

window.api.ui.displayElement.add({
  html: window.api.ui.components.panel(formHtml, { title: "사용자 정보" }),
  position: { x: 200, y: 150 },
  draggable: true,
});
```

#### 패턴 3: Dialog와 Components 조합

```javascript
async function showCustomSettings() {
  // Components로 폼 생성
  const enableNotifications = window.api.ui.components.checkbox({
    checked: true,
    id: "notifications",
  });

  const volumeInput = window.api.ui.components.input({
    type: "number",
    value: 50,
    width: 100,
    id: "volume",
  });

  const formHtml = `
    <div class="flex flex-col gap-[12px]">
      ${window.api.ui.components.formRow("알림 활성화", enableNotifications)}
      ${window.api.ui.components.formRow("볼륨", volumeInput)}
    </div>
  `;

  // Display Element로 표시
  window.api.ui.displayElement.add({
    html: window.api.ui.components.panel(formHtml, { title: "알림 설정" }),
    position: { x: 300, y: 200 },
    draggable: true,
  });
}
```

---

## 추가 리소스

- **IPC 채널 레퍼런스**: [`docs/ipc-channels.md`](./ipc-channels.md) - 백엔드 구현 상세
- **커스텀 JS 가이드**: [`docs/plugin/custom-js-guide.md`](./plugin/custom-js-guide.md) - 커스텀 스크립트 작성 방법
- **Tauri 공식 문서**: https://tauri.app/
