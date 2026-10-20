# AGENTS.md — DmNote 프로젝트 규칙

## 프로젝트 개요

- **Tauri 기반** 데스크톱 앱: Rust 백엔드 + React 프론트엔드. 메인 윈도우(설정 UI)와 오버레이 윈도우(키 시각화)의 듀얼 윈도우 구조
- 상태 관리는 메인 윈도우가 Zustand, 오버레이가 Preact Signals(실시간 업데이트). OBS 모드는 같은 프론트를 WebSocket 브릿지로 띄운다. 빌드는 Vite + React Compiler, 스타일은 Tailwind CSS

## 개발 환경

```bash
# 개발 서버 실행
npm run tauri:dev

# 프로덕션 빌드
npm run tauri:build
```

## 기존 코드의 의도 존중

- **코드를 수정할 때는 항상 기존 작성자의 의도가 무엇인지 먼저 생각하고, 그 의도를 무시하거나 훼손하지 않도록 한다.**

## 새 파일의 배치와 모듈 경계

- 폴더당 파일 수의 강제 상한은 두지 않는다. 기능·변경 이유·실제 사용처를 기준으로 기존 폴더를 먼저 활용한다.
- 같은 기능의 구현·전용 타입·단위 테스트를 함께 둔다. 여러 기능을 가로지르는 계약 테스트는 `src/renderer/__tests__/`에 둔다.
- 기능 폴더의 `index.ts`는 외부 진입점이다. 내부 모듈끼리는 index를 거치지 않고 실제 정의 파일을 참조하며, 자기 구현을 상위 `index.ts` 경유로 다시 참조하지 않는다.
- 공통 집계·commit 같은 공유 소유자는 하위 기능 폴더가 아니라 상위에 유지한다 (batch 패널의 commit, popup layer·chrome·exit의 `Modal` 소유 등).
- API 구현은 `dmnoteApi.ts`, `internalApi.ts`, `hostGlobalApi.ts`의 기존 진입점과 IPC shim 계약을 유지한다.
- 유틸리티는 실제 역할에 배치한다. `utils/core`에 기능별 코드를 다시 쌓지 않고, 공용 유틸리티가 상위 UI에 새로 의존하지 않도록 한다.
- 플러그인 runtime의 권한·상태 소유권은 `plugins/runtime`에 유지한다.
- 벤치마크 파일을 옮길 때는 `package.json` 실행 경로, mock·lazy import, 소스 파일을 읽는 계약 테스트, WebView 진입점과 strict include를 함께 확인한다.
- 모든 폴더에 `index.ts`나 한 파일만 감싸는 하위 폴더를 추가하지 않는다. Rust 파일 이동을 위해 가시성을 넓히거나 저장·복구 트랜잭션의 소유 경계를 바꾸지 않는다.
- 폴더별 판단과 이동 전후 통계는 [소스 분류 결과](docs/source-organization-report.md), 실행 기준은 [후속 계획](docs/source-organization-plan.md)을 참고한다.

## 네이밍 컨벤션

### TypeScript / React

| 대상            | 규칙                         | 예시                                      |
| --------------- | ---------------------------- | ----------------------------------------- |
| 컴포넌트 파일   | PascalCase                   | `GridBackground.tsx`, `StatItem.tsx`      |
| 훅 파일         | camelCase + `use` 접두사     | `useKeyManager.ts`, `useLenis.ts`         |
| 스토어 파일     | camelCase + `use` 접두사     | `useFontStore.ts`, `useKeyStore.ts`       |
| 유틸리티 파일   | camelCase                    | `cubicBezier.ts`, `keyStatsService.ts`    |
| 컴포넌트명      | PascalCase                   | `const GridBackground = () => {}`         |
| Props 타입      | PascalCase + `Props` 접미사  | `interface GridBackgroundProps`           |
| 타입/인터페이스 | PascalCase                   | `type SelectedKey`, `interface FontState` |
| 변수/함수       | camelCase                    | `isChecked`, `handleClick()`              |
| Zustand 스토어  | `use` + PascalCase + `Store` | `useFontStore`, `useUIStore`              |

### Rust

| 대상          | 규칙             | 예시                                      |
| ------------- | ---------------- | ----------------------------------------- |
| 파일명        | snake_case       | `app_state.rs`, `key_sound.rs`            |
| 구조체/열거형 | PascalCase       | `struct AppState`, `enum FontType`        |
| 함수/메서드   | snake_case       | `sync_counters()`, `initialize_runtime()` |
| 상수          | UPPER_SNAKE_CASE | `OVERLAY_LABEL`, `DEFAULT_OVERLAY_WIDTH`  |

## 코딩 컨벤션

### 언어 및 파일

- 새로 추가하는 파일은 반드시 **TypeScript** (`.ts` / `.tsx`)
- Rust 코드는 `src-tauri/` 하위에 위치

### React 컴포넌트

- **화살표 함수** + **Props 인라인 구조분해** 패턴 사용:

  ```tsx
  const UserProfile = ({ name, age }: UserProfileProps) => {
    return <div>{name}</div>;
  };

  export default UserProfile;
  ```

- Props 타입은 `interface`로 정의, 컴포넌트 바로 위에 선언
- 기본 export는 `export default` 사용 (컴포넌트)
- 훅/유틸리티는 named export 사용

### Tauri 커맨드

- `#[tauri::command]` 사용 (permission 속성 생략 — build.rs가 자동 생성)
- 동기 `fn` 기본, `async fn`은 실제 await가 필요한 경우만 사용
- 에러 타입: `CmdResult<T>` 사용

### OBS 모드 (WebSocket 브릿지)

- **이벤트 포워딩**: 새 Tauri 이벤트(`app.emit(...)`)를 추가할 때, OBS 오버레이에도 전달되어야 하면 `src-tauri/src/services/obs_bridge.rs`의 `register_event_forwarding()` 이벤트 목록에 등록
- **발행 경로**: `FORWARDED_EVENTS`에 있는 이벤트는 `services/event_publisher.rs`의 `publish_event`로만 발행 — 직접 `app.emit`을 쓰면 OBS 전달이 빠진다. 목록 밖 창 전용 이벤트는 직접 emit 유지
- **allowlist**: OBS 클라이언트에서 실행 가능한 커맨드만 `obs_bridge.rs`의 `ALLOWED_WS_COMMANDS`에 등록 (정확 일치, fail-closed — 목록에 없으면 차단, 백엔드가 유일한 source of truth). 신규 커맨드를 OBS에 노출하려면 검토 후 명시적으로 추가
- **IPC shim**: `src/renderer/api/ipcShim.ts`는 generic 설계 — 커맨드/이벤트별 분기 없음. 이벤트나 커맨드 추가 시 수정 불필요

### 주석

- 기술 용어(React, Tauri, KPS 등)를 제외하면 **한글**로 작성
- **키워드/명사형** 스타일 사용 (예: `// 카운터 초기화`, `// 모드 변경 시 total 재계산`)
- 불필요한 주석 지양 — 코드로 의도가 명확하면 주석 생략

### 컴포넌트 설계

- 컴포넌트 분리와 훅 모듈화를 철저히 유지
- 오버엔지니어링 지양, 장기 유지보수 가능한 단순한 코드 작성
- 한 파일이 과도하게 커지면 분리 검토

### React Compiler 주의사항

- `@preact/signals-react`의 `useSignals()` 사용 컴포넌트는 `'use no memo'` 필수
- `useSignals()` 컴포넌트에 effect로 setState하는 훅을 넣으면 시그널 리렌더 추적이 끊긴다 — 렌더 중 파생으로 설계
- `'use no memo'` 파일에서 성능이 필요하면 수동 `React.memo` 사용 가능
- `useMemo` / `useCallback` 의존성 배열에서 배열/객체는 개별 요소 비교 고려
- 린트 자동 수정이 의도적 패턴을 덮어쓸 수 있으므로 필요시 `eslint-disable` 주석 사용

## store 자산·복구 안전 규칙

- **파일 자산 종류를 새로 추가할 때** (appData에 파일을 두고 store가 경로를 참조): `state/store/asset_references.rs`의 orphan sweep 보호 집합(`collect_local_*_path_keys`)에 참조 수집을 추가하고, 크래시 직후·손상 복구 직후 시나리오와의 교차 테스트 필수
- **sweep 불변식**: 자산 정리는 즉시 삭제가 아니라 `trash/<세션>/` 30일 격리 — 이를 우회하는 직접 `remove_file` 정리 경로 추가 금지. store 복구가 발생한 세션은 sweep이 자동 스킵됨(`state/store.rs`의 `skip_asset_sweep`)
- **store에 사용자 생성 컬렉션 필드를 추가할 때**: `state/migration/recovery.rs`의 `recover_collection_field`에 항목 단위 복구 등록 검토 (범용 헬퍼 재사용, 한 줄). 미등록 시 그 필드만 "손상 시 통째 초기화"로 폴백
- **`keys[mode][i]` ↔ `keyPositions[mode][i]`는 인덱스 결합** — 복구·마이그레이션에서 배열 요소 제거 금지, 제자리 대체(`""` / default)만 허용
- **편집 결합 컬렉션을 추가할 때**: 전용 세분 저장 커맨드를 새로 만들지 말고 `EditorDocumentV1`(`models/editor.rs`) 필드와 `editor_commit` patch·검증·이벤트에 함께 추가
- **editor_commit 오류 코드를 추가할 때**: 백엔드 오류 정의와 프론트 `EDITOR_ERROR_CODES`(`src/types/editor.ts`)에 반드시 함께 추가 — 프론트 목록에 없는 코드는 `retryable` 값과 무관하게 "이름표 없는 오류"로 취급되어 미저장 편집이 즉시 폐기됨

## API 문서 동기화

- 프론트엔드 플러그인 API(`dmn.*`) 또는 Tauri 커맨드에 변경이 있으면 `docs/content/` 하위 관련 MDX 문서를 업데이트
- 문서는 `en/`, `ko/` 두 언어로 관리되므로 양쪽 모두 반영

## 작업 마무리 체크리스트

CI(`.github/actions/quality`, `validate-*`)와 같은 검사를 로컬에서 먼저 통과시킨다.

### 프론트엔드 (TypeScript/React) 변경 시

1. **타입 체크**: `npm run type-check` (strict tsconfig와 `scripts/ci` 포함)
2. **린트**: `npm run lint`
3. **포맷팅**: `npm run format` 후 `npm run format:check`
4. **테스트**: `npm test` (변경 범위가 좁으면 해당 파일만)
5. 린트/포맷팅 자동 수정이 기존 의도적 코드(`eslint-disable` 등)를 변경하지 않았는지 확인

### 백엔드 (Rust) 변경 시

1. **린트**: `cd src-tauri && cargo clippy --all-targets -- -D warnings`
2. **테스트**: `cd src-tauri && cargo test`
3. **포맷팅**: `cd src-tauri && cargo fmt`
4. **permissions 확인**: 커맨드 추가/삭제 시 빌드 후 `permissions/dmnote-allow-all.json` 변경분을 함께 커밋 (CI가 diff를 검사)
