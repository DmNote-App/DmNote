# IPC 채널 요약 (도메인별)

아래 표기는 Tauri 메인 프로세스에서 노출하는 IPC 채널과 페이로드 개요입니다. 렌더러(Frontend)는 Tauri의 `invoke` API를 통해 Rust 커맨드를 호출하고, 이벤트 리스너를 통해 브로드캐스트 메시지를 수신합니다.

> **Tauri 2 보안 메모**
>
> - 모든 커맨드는 `src-tauri/src/capabilities/main.json`에 정의된 `dmnote-allow-all` 권한으로 보호됩니다.
> - 각 Rust 커맨드는 `#[tauri::command(permission = "dmnote-allow-all")]`로 선언되어, 이 권한을 가진 윈도우에서만 호출 가능합니다.
> - 메인 윈도우(`main`)와 오버레이 윈도우(`overlay`)는 각각의 권한 셋을 가지며, 오버레이는 제한된 권한 셋을 사용합니다.

## 데이터 흐름 개요

- 초기화(앱 시작)

  1. Tauri 메인 프로세스가 `AppState`를 초기화하고 영속성 스토어(`Store`)에서 데이터를 로드합니다.
  2. 렌더러는 `app:bootstrap` 커맨드를 호출해 초기 스냅샷(Settings/Keys/Positions/CustomTabs/SelectedKeyType/Overlay)을 받습니다.
  3. `useAppBootstrap` 훅이 스냅샷을 Zustand 스토어에 반영하고, 아래 브로드캐스트 이벤트를 구독합니다.

- 변경(런타임)

  1. 렌더러가 `settings:update`, `keys:update` 등 커맨드를 invoke로 호출합니다.
  2. 메인 프로세스의 커맨드 핸들러가 입력을 유효성 검사 후 영속성 스토어(`Store`)에 저장하고, 필요한 부수효과(예: 오버레이 잠금/항상 위)를 적용합니다.
  3. 변경 결과를 각 브로드캐스트 채널(`settings:changed`, `keys:changed` 등)로 전파 → 렌더러 스토어가 구독해 동기화합니다.

- 입력 이벤트(키보드)
  - `KeyboardService`가 전역 키 이벤트를 수집하여 `keys:state` 브로드캐스트로 오버레이 렌더러에 전달합니다.

## app

- `app_bootstrap` (invoke)
  - 요청: `void`
  - 응답: `BootstrapPayload` (설정/키/포지션/커스텀탭/선택 탭/오버레이 상태)

## system

- `window:minimize` (invoke)

  - 기능: 메인 윈도우를 최소화합니다.
  - 응답: `void`

- `window:close` (invoke)

  - 기능: 애플리케이션을 종료합니다 (메인 및 오버레이 윈도우 모두 닫음).
  - 응답: `void`

- `window_open_devtools_all` (invoke)

  - 기능: 메인 윈도우와 오버레이 윈도우의 DevTools를 엽니다.
  - 요청: `void`
  - 응답: `void`
  - 비고: 개발자 모드 활성화 시 자동으로 호출됩니다. DevTools는 항상 허용되지만 접근은 키보드 단축키(Ctrl+Shift+I, F12) 차단으로 제어됩니다.

- `app:open-external` (invoke)

  - 기능: 외부 URL을 기본 브라우저에서 엽니다.
  - 요청: `{ url: string }`
  - 응답: `void`

- `app:restart` (invoke)
  - 기능: 애플리케이션을 재시작합니다.
  - 응답: `void`

## settings

- `settings:get` (invoke)
  - 응답: `SettingsState`
- `settings:update` (invoke)
  - 요청: `Partial<SettingsState>` (중첩 필드는 필요한 부분만)
  - 응답: `SettingsState` (정규화된 전체 상태)
  - 비고: `developerModeEnabled` 필드를 통해 개발자 모드를 제어할 수 있습니다. 활성화 시 DevTools가 자동으로 열립니다.
- `settings:changed` (broadcast)
  - 페이로드: `SettingsState`

## keys / positions / customTabs

### 커맨드 (invoke)

- `keys:get` (invoke)

  - 응답: `KeyMappings` (모든 키 모드의 키 매핑)

- `keys:update` (invoke)

  - 요청: `KeyMappings`
  - 응답: `KeyMappings` (업데이트된 전체 키 매핑)
  - 부수효과: 키보드 레이아웃 재로드, 카운터 재계산

- `positions:get` (invoke)

  - 응답: `KeyPositions` (모든 키 모드의 위치 정보)

- `positions:update` (invoke)

  - 요청: `KeyPositions`
  - 응답: `KeyPositions` (업데이트된 전체 위치 정보)

- `keys:set-mode` (invoke)

  - 요청: `{ mode: string }` (키 모드 ID: "4key", "5key", "8key", "custom-\*" 등)
  - 응답: `{ success: boolean; mode: string }` (실제 설정된 모드)

- `keys:reset-all` (invoke)

  - 기능: 모든 키, 위치, 커스텀탭을 기본값으로 초기화
  - 응답: `{ keys: KeyMappings; positions: KeyPositions; custom_tabs: CustomTab[]; selected_key_type: string }`
  - 부수효과: 설정, CSS/JS, 카운터도 초기화됨

- `keys:reset-mode` (invoke)

  - 요청: `{ mode: string }`
  - 응답: `{ success: boolean; mode: string }` (초기화 성공 여부)
  - 기능: 특정 키 모드만 기본값으로 초기화

- `keys:reset-counters` (invoke)

  - 기능: 모든 키의 누적 카운트를 초기화합니다.
  - 응답: `KeyCounters`

- `keys:reset-counters-mode` (invoke)

  - 요청: `{ mode: string }`
  - 기능: 특정 키 모드의 누적 카운트만 초기화합니다.
  - 응답: `KeyCounters`

- `custom-tabs:list` (invoke)

  - 응답: `CustomTab[]` (생성된 커스텀 탭 목록)

- `custom-tabs:create` (invoke)

  - 요청: `{ name: string }`
  - 응답: `{ result?: CustomTab; error?: string }`
  - 에러 코드: `"invalid-name"` (빈 이름), `"duplicate-name"` (중복), `"max-reached"` (5개 제한)

- `custom-tabs:delete` (invoke)

  - 요청: `{ id: string }`
  - 응답: `{ success: boolean; selected: string; error?: string }`
  - 부수효과: 삭제된 탭이 선택되었으면 다른 탭으로 자동 전환

- `custom-tabs:select` (invoke)
  - 요청: `{ id: string }`
  - 응답: `{ success: boolean; selected: string; error?: string }`

### 브로드캐스트 (emit)

- `keys:changed` (emit)

  - 페이로드: `KeyMappings` (업데이트된 전체 키 매핑)

- `positions:changed` (emit)

  - 페이로드: `KeyPositions` (업데이트된 전체 위치)

- `keys:mode-changed` (emit)

  - 페이로드: `{ mode: string }` (현재 활성 키 모드)

- `customTabs:changed` (emit)

  - 페이로드: `{ custom_tabs: CustomTab[]; selected_key_type: string }`

- `keys:counters` (emit)

  - 페이로드: `KeyCounters` (각 키의 누적 카운트)
  - 발생 시점: 키 매핑 변경, 카운터 초기화, 모드 전환 시

- `keys:state` (emit)
  - 페이로드: `{ key: string; state: HookKeyState; ... }` (전역 키보드 이벤트)
  - 수신처: 오버레이 윈도우만

## overlay

### 커맨드 (invoke)

- `overlay:get` (invoke)

  - 응답: `{ visible: boolean; locked: boolean; anchor: string }`

- `overlay:set-visible` (invoke)

  - 요청: `{ visible: boolean }`
  - 응답: `void`
  - 부수효과: 오버레이 윈도우의 표시/숨김 상태 변경

- `overlay:set-lock` (invoke)

  - 요청: `{ locked: boolean }`
  - 응답: `void`
  - 부수효과: 오버레이가 잠기면 마우스 이벤트 투과 모드로 전환

- `overlay:set-anchor` (invoke)

  - 요청: `{ anchor: string }` (앵커 위치: "top-left", "top-right", "bottom-left", "bottom-right" 등)
  - 응답: `{ anchor: string }` (실제 설정된 앵커)

- `overlay:resize` (invoke)
  - 요청: `{ width: number; height: number; anchor?: string; contentTopOffset?: number }`
  - 응답: `{ bounds?: { x: number; y: number; width: number; height: number }; error?: string }`
  - 기능: 오버레이의 크기와 위치를 조정합니다.

### 브로드캐스트 (emit)

- `overlay:visibility` (emit)

  - 페이로드: `{ visible: boolean }`

- `overlay:lock` (emit)

  - 페이로드: `{ locked: boolean }`

- `overlay:anchor` (emit)

  - 페이로드: `{ anchor: string }`

- `overlay:resized` (emit)
  - 페이로드: `{ x: number; y: number; width: number; height: number }`

## css

### 커맨드 (invoke)

- `css:get` (invoke)

  - 응답: `{ path?: string; content: string }` (현재 커스텀 CSS 정보)
  - 비고: `path`/`content`는 첫 번째 플러그인 정보를 위한 하위 호환 필드입니다.

- `css:get-use` (invoke)

  - 응답: `boolean` (CSS 활성화 여부)
  - 비고: 브로드캐스트 역시 하위 호환을 위해 첫 번째 플러그인의 `path`/`content`가 유지됩니다.

- `css:toggle` (invoke)

  - 요청: `{ enabled: boolean }`
  - 응답: `{ enabled: boolean }`

- `css:load` (invoke)

  - 기능: 파일 대화상자에서 CSS 파일을 선택하여 로드
  - 응답: `{ success: boolean; error?: string; content?: string; path?: string }`

- `css:set-content` (invoke)

  - 요청: `{ content: string }` (CSS 코드)
  - 응답: `{ success: boolean; error?: string }`

- `css:reset` (invoke)
  - 기능: 커스텀 CSS를 비우고 비활성화
  - 응답: `void`

### 브로드캐스트 (emit)

- `css:use` (emit)

  - 페이로드: `{ enabled: boolean }`

- `css:content` (emit)
  - 페이로드: `{ path?: string; content: string }`

## js

> JsPlugin 구조: `{ id: string; name: string; path: string | null; content: string; enabled: boolean }`

### 커맨드 (invoke)

- `js:get` (invoke)

  - 응답: `{ path?: string; content?: string; plugins: JsPlugin[] }`

- `js:get-use` (invoke)

  - 응답: `boolean` (JavaScript 활성화 여부)

- `js:toggle` (invoke)

  - 요청: `{ enabled: boolean }`
  - 응답: `{ enabled: boolean }`

- `js:load` (invoke)

  - 기능: 파일 대화상자에서 하나 이상의 JavaScript 파일(.js, .mjs)을 선택하여 플러그인으로 추가
  - 응답: `{ success: boolean; added: JsPlugin[]; errors: { path: string; error: string }[] }`

- `js:reload` (invoke)

  - 기능: 저장된 경로를 기준으로 모든 플러그인을 다시 읽어 들임
  - 응답: `{ updated: JsPlugin[]; errors: { path: string; error: string }[] }`

- `js:remove-plugin` (invoke)

  - 요청: `{ id: string }`
  - 응답: `{ success: boolean; removedId?: string; error?: string }`

- `js:set-plugin-enabled` (invoke)

  - 요청: `{ id: string; enabled: boolean }`
  - 응답: `{ success: boolean; plugin?: JsPlugin; error?: string }`

- `js:set-content` (invoke)

  - 요청: `{ content: string }` (JavaScript 코드)
  - 응답: `{ success: boolean; error?: string }` (첫 활성 플러그인의 내용을 갱신)

- `js:reset` (invoke)
  - 기능: 커스텀 JavaScript를 비우고 비활성화
  - 응답: `void`

### 브로드캐스트 (emit)

- `js:use` (emit)

  - 페이로드: `{ enabled: boolean }`

- `js:content` (emit)
  - 페이로드: `{ path?: string; content?: string; plugins: JsPlugin[] }`

## preset

### 커맨드 (invoke)

- `preset:save` (invoke)

  - 기능: 현재 모든 설정(키, 위치, 커스텀탭, CSS, JS 등)을 JSON 파일로 저장
  - 응답: `{ success: boolean; error?: string }`

- `preset:load` (invoke)
  - 기능: 파일 대화상자에서 프리셋 JSON 파일을 선택하여 로드
  - 응답: `{ success: boolean; error?: string }`
  - 에러: `"invalid-preset"` (잘못된 파일 형식)
  - 부수효과: 로드 성공 시 아래의 모든 브로드캐스트 채널이 일괄 발생
    - `keys:changed`, `positions:changed`, `customTabs:changed`, `keys:mode-changed`
    - `settings:changed`, `css:use`, `css:content`, `js:use`, `js:content`
    - `keys:counters`
