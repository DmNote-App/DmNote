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

브릿지 API는 **윈도우 간 통신**을 위한 플러그인 전용 API입니다. 메인 윈도우와 오버레이 윈도우 간에 메시지를 주고받을 수 있습니다.

### `window.api.bridge.send(type, data)`

모든 윈도우에 메시지를 브로드캐스트합니다.

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

#### 패턴 3: 양방향 통신

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

#### 패턴 4: 타입 안전성 (TypeScript)

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

**Display Element**는 플러그인이 그리드와 오버레이에 커스텀 DOM 요소를 동적으로 추가할 수 있게 하는 API입니다.

#### Display Element의 역할과 특성

- **그리드-오버레이 통합**: 그리드(메인 윈도우)에서 추가한 요소가 자동으로 오버레이 윈도우에도 동기화됩니다
- **Key 컴포넌트 유사**: Key 컴포넌트와 동일한 방식으로 두 윈도우에서 렌더링되며, 위치 정보가 공유됩니다
- **위치 지정 방식**:
  - **절대 위치**: `{ x: number, y: number }` 좌표로 직접 배치
  - **앵커 기반**: 특정 키에 상대적으로 배치 (예: 키 옆에 통계 표시)
- **드래그 지원**: 그리드에서 마우스로 드래그하여 위치 변경 가능
- **HTML 기반**: HTML 문자열로 콘텐츠를 정의하며, React 컴포넌트가 아닌 순수 DOM 요소
- **스타일 격리 옵션**: Shadow DOM을 활용한 CSS 스코핑 지원

#### `window.api.ui.displayElement.add(element)`

그리드와 오버레이에 표시될 DOM 요소를 추가합니다.

**매개변수**:

- `element: Omit<PluginDisplayElement, "id">`

```typescript
interface PluginDisplayElement {
  html: string; // HTML 콘텐츠 (문자열)
  position: { x: number; y: number }; // 절대 위치 (픽셀)
  anchor?: {
    // 선택적 앵커 기반 위치
    keyCode: string; // 기준 키 코드 (예: "KeyD")
    offset?: { x: number; y: number }; // 키로부터의 오프셋
  };
  draggable?: boolean; // 그리드에서 드래그 가능 여부 (기본: false)
  zIndex?: number; // 레이어링 (기본: 50, 키 위/컨텍스트 메뉴 아래)
  scoped?: boolean; // Shadow DOM 사용 여부 (기본: false)
  className?: string; // CSS 클래스
  style?: Record<string, string>; // 인라인 스타일
  estimatedSize?: { width: number; height: number }; // 예상 크기 (오버레이 bounds 계산용, 선택적)
  contextMenu?: {
    // 우클릭 컨텍스트 메뉴 (선택적)
    enableDelete?: boolean; // 삭제 메뉴 활성화 (기본: true)
    deleteLabel?: string; // 삭제 메뉴 텍스트 (기본: "삭제")
    customItems?: Array<{
      id: string;
      label: string;
      onClick: (context: { element: PluginDisplayElement }) => void;
    }>;
  };
}
```

**반환형**: `string` - 요소의 전역 고유 ID (`pluginId::elementId`)

**참고**:

- 요소의 실제 크기는 렌더링 후 자동으로 측정되어 오버레이 윈도우 크기에 반영됩니다
- `estimatedSize`를 제공하면 초기 렌더링 전에도 더 정확한 크기 계산이 가능합니다

**사용 예**:

```javascript
// 기본 사용 - 절대 위치 + 내장 컨텍스트 메뉴
const elementId = window.api.ui.displayElement.add({
  html: '<div style="padding: 10px; background: #333; color: white;">통계: 0</div>',
  position: { x: 100, y: 100 },
  draggable: true,
  zIndex: 10,
  estimatedSize: { width: 150, height: 50 },
  contextMenu: {
    enableDelete: true, // 우클릭 시 삭제 메뉴
    enableDuplicate: true, // 우클릭 시 복제 메뉴
  },
});

// 앵커 기반 - 키에 상대적 배치
window.api.ui.displayElement.add({
  html: '<div class="counter-badge">999+</div>',
  position: { x: 0, y: 0 }, // 폴백 위치
  anchor: {
    keyCode: "KeyD", // D키에 앵커
    offset: { x: 50, y: -20 }, // 키의 오른쪽 위
  },
  className: "plugin-badge",
});

// Shadow DOM 사용 - 스타일 격리
window.api.ui.displayElement.add({
  html: `
    <style>
      .widget { background: red; padding: 20px; }
    </style>
    <div class="widget">격리된 위젯</div>
  `,
  position: { x: 200, y: 200 },
  scoped: true, // Shadow DOM 활성화
});

// 커스텀 컨텍스트 메뉴 아이템
window.api.ui.displayElement.add({
  html: "<div>설정 가능한 위젯</div>",
  position: { x: 300, y: 300 },
  contextMenu: {
    enableDelete: true,
    enableDuplicate: true,
    customItems: [
      {
        id: "configure",
        label: "⚙️ 설정",
        onClick: ({ element }) => {
          console.log("설정 열기", element);
        },
      },
    ],
  },
});
```

---

#### `window.api.ui.displayElement.update(fullId, updates)`

기존 요소를 업데이트합니다.

**매개변수**:

- `fullId: string` - 요소 ID
- `updates: Partial<PluginDisplayElement>` - 업데이트할 필드

**반환형**: `void`

**사용 예**:

```javascript
// HTML 콘텐츠 업데이트
window.api.ui.displayElement.update(elementId, {
  html: '<div style="padding: 10px; background: #333; color: white;">통계: 123</div>',
});

// 위치 변경
window.api.ui.displayElement.update(elementId, {
  position: { x: 150, y: 150 },
  anchor: undefined, // 앵커 제거
});

// 앵커 변경
window.api.ui.displayElement.update(elementId, {
  anchor: { keyCode: "KeyF", offset: { x: 0, y: 60 } },
});
```

---

#### `window.api.ui.displayElement.remove(fullId)`

특정 요소를 제거합니다.

**매개변수**:

- `fullId: string` - 요소 ID

**반환형**: `void`

**사용 예**:

```javascript
window.api.ui.displayElement.remove(elementId);
```

---

#### `window.api.ui.displayElement.clearMyElements()`

현재 플러그인이 추가한 모든 요소를 제거합니다.

**반환형**: `void`

**사용 예**:

```javascript
// 클린업 시 호출
window.__dmn_custom_js_cleanup = function () {
  window.api.ui.displayElement.clearMyElements();
  delete window.__dmn_custom_js_cleanup;
};
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

#### 패턴 4: 동적 앵커 변경

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

#### 패턴 5: 여러 요소 관리

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

---

## 추가 리소스

- **IPC 채널 레퍼런스**: [`docs/ipc-channels.md`](./ipc-channels.md) - 백엔드 구현 상세
- **커스텀 JS 가이드**: [`docs/plugin/custom-js-guide.md`](./plugin/custom-js-guide.md) - 커스텀 스크립트 작성 방법
- **Tauri 공식 문서**: https://tauri.app/
