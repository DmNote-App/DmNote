# IPC 채널 요약 (도메인별)

아래 표기는 메인 프로세스에서 노출하는 IPC 채널과 페이로드 개요입니다. `window.api`는 `src/main/preload.ts`에서 래핑된 형태로 제공됩니다.

> **Tauri 2 보안 메모**
>
> - 메인 창(`capabilities/main.json`)은 `dmnote-allow-all` 권한을 통해 아래 커맨드에 접근합니다.
> - 각 Rust 커맨드는 `#[tauri::command(permission = "dmnote-allow-all")]` 로 선언되어 있어, 다른 윈도우/플러그인에 권한을 부여하지 않으면 호출할 수 없습니다.

## 데이터 흐름 개요

- 초기화(앱 시작)

  1. 메인 `Application`이 `electron-store` 스냅샷을 로드하고, 도메인/윈도우/서비스를 초기화합니다.
  2. 렌더러는 `window.api.app.bootstrap()`을 호출해 초기 스냅샷(Settings/Keys/Positions/CustomTabs/SelectedKeyType/Overlay)을 받습니다.
  3. `useAppBootstrap` 훅이 스냅샷을 Zustand 스토어에 반영하고, 아래 브로드캐스트 이벤트를 구독합니다.

- 변경(런타임)

  1. 렌더러가 `settings:update`, `keys:update` 등 invoke 채널을 호출합니다.
  2. 도메인이 입력을 `zod`로 정규화 후 `electron-store`에 저장, 필요한 부수효과(예: 오버레이 잠금/항상 위)를 적용합니다.
  3. 변경 결과를 각 브로드캐스트 채널(`settings:changed`, `keys:changed` 등)로 전파 → 렌더러 스토어가 구독해 동기화합니다.

- 입력 이벤트(키보드)
  - `KeyboardService`가 전역 키 이벤트를 수집하여 현재 모드에 한해 `keys:state` 이벤트로 오버레이 렌더러에 전달합니다.

## app

- `app_bootstrap` (invoke)
  - 요청: `void`
  - 응답: `BootstrapPayload` (설정/키/포지션/커스텀탭/선택 탭/오버레이 상태)

## system

- `window:minimize` (invoke)
- `window:close` (invoke)
- `app:open-external` (invoke)
  - 요청: `{ url: string }`
- `app:restart` (invoke)

## settings

- `settings:get` (invoke)
  - 응답: `SettingsState`
- `settings:update` (invoke)
  - 요청: `Partial<SettingsState>` (중첩 필드는 필요한 부분만)
  - 응답: `SettingsState` (정규화된 전체 상태)
- `settings:changed` (broadcast)
  - 페이로드: `SettingsState`

## keys / positions / customTabs

- `keys:get` (invoke) → `KeyMappings`
- `keys:update` (invoke) → 요청: `KeyMappings`, 응답: `KeyMappings`
- `positions:get` (invoke) → `KeyPositions`
- `positions:update` (invoke) → 요청: `KeyPositions`, 응답: `KeyPositions`
- `keys:set-mode` (invoke) → 요청: `{ mode: string }`, 응답: `{ success: boolean; mode: string }`
- `keys:reset-all` (invoke) → `{ keys: KeyMappings; positions: KeyPositions }`
- `keys:reset-mode` (invoke) → 요청: `{ mode: string }`, 응답: `{ success: boolean; mode: string }`
- `custom-tabs:list` (invoke) → `CustomTab[]`
- `custom-tabs:create` (invoke) → 요청: `{ name: string }`, 응답: `{ result?: CustomTab; error?: string }`
- `custom-tabs:delete` (invoke) → 요청: `{ id: string }`, 응답: `{ success: boolean; selected: string; error?: string }`
- `custom-tabs:select` (invoke) → 요청: `{ id: string }`, 응답: `{ success: boolean; selected: string; error?: string }`

브로드캐스트

- `keys:changed` → `KeyMappings`
- `positions:changed` → `KeyPositions`
- `keys:mode-changed` → `{ mode: string }`
- `customTabs:changed` → `{ customTabs: CustomTab[]; selectedKeyType: string }`
- `keys:state` → `{ key: string; state: string; mode: string }` (키보드 이벤트)

## overlay

- `overlay:get` (invoke) → `{ visible: boolean; locked: boolean; anchor: string }`
- `overlay:set-visible` (invoke) → 요청: `{ visible: boolean }`, 응답: `{ visible: boolean }`
- `overlay:set-lock` (invoke) → 요청: `{ locked: boolean }`, 응답: `{ locked: boolean }`
- `overlay:set-anchor` (invoke) → 요청: `{ anchor: string }`, 응답: `{ anchor: string }`
- `overlay:resize` (invoke)
  - 요청: `{ width: number; height: number; anchor?: string; contentTopOffset?: number }`
  - 응답: `{ bounds?: { x: number; y: number; width: number; height: number }; error?: string }`

브로드캐스트

- `overlay:visibility` → `{ visible: boolean }`
- `overlay:lock` → `{ locked: boolean }`
- `overlay:anchor` → `{ anchor: string }`
- `overlay:resized` → `{ x: number; y: number; width: number; height: number }`

## css

- `css:get` (invoke) → `CustomCss`
- `css:get-use` (invoke) → `boolean`
- `css:toggle` (invoke) → 요청: `{ enabled: boolean }`, 응답: `{ enabled: boolean }`
- `css:load` (invoke) → `{ success: boolean; content?: string; path?: string; error?: string }`
- `css:set-content` (invoke) → 요청: `{ content: string }`, 응답: `{ success?: true; error?: string }`
- `css:reset` (invoke)

브로드캐스트

- `css:use` → `{ enabled: boolean }`
- `css:content` → `CustomCss`

## js

- `js:get` (invoke) → `CustomJs`
- `js:get-use` (invoke) → `boolean`
- `js:toggle` (invoke) → 요청: `{ enabled: boolean }`, 응답: `{ enabled: boolean }`
- `js:load` (invoke) → `{ success: boolean; content?: string; path?: string; error?: string }`
- `js:set-content` (invoke) → 요청: `{ content: string }`, 응답: `{ success?: true; error?: string }`
- `js:reset` (invoke)

브로드캐스트

- `js:use` → `{ enabled: boolean }`
- `js:content` → `CustomJs`

## preset

- `preset:save` (invoke) → `{ success: boolean; error?: string }`
- `preset:load` (invoke) → `{ success: boolean; error?: string }`
  - 로드 성공 시 관련 상태 채널(`keys:*`, `positions:*`, `customTabs:changed`, `settings:changed`, `css:*`, `js:*`)이 일괄 브로드캐스트됩니다.
