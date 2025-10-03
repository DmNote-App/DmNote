# Tauri Migration Log

## 2025-10-02 20:08 — 초기 분석
- Electron 메인 프로세스가 `electron-store` 기반 상태와 IPC 도메인을 통해 창과 키 입력을 제어함.
- `OverlayWindow` 는 항상 위, 투명, 마우스 이벤트 무시, 위치 복원을 처리하며 메인 창과 상태를 공유함.
- `node-global-key-listener-extended` 로 글로벌 키 후킹, 특정 키맵 모드 필터 후 `keys:state` 이벤트 송신.
- 렌더러는 `preload.ts` 에 노출된 `window.api` 로 모든 기능 호출 및 이벤트 구독을 수행함.
- 마이그레이션 시 Tauri 다중 창, 영구 저장소, willhook 기반 후킹, 커맨드/이벤트 설계를 통해 동일한 기능을 복원해야 함.

## 2025-10-02 20:11 — Tauri 스캐폴딩
- `src-tauri` 디렉터리와 초기 `Cargo.toml`, `build.rs`, `main.rs` 를 추가해 Rust 백엔드 골격을 마련함.
- `tauri.conf.json` 으로 Vite 출력(`dist/renderer`)과 개발 서버(`http://localhost:3000/main/index.html`)를 연결하는 기본 창 구성을 정의함.
- fern 로깅 초기화를 포함해 Tauri 엔트리포인트를 준비하여 후속 모듈이 로그를 공유할 수 있도록 함.

## 2025-10-02 21:00 — 상태/도메인 마이그레이션
- Rust `AppStore` 와 데이터 모델을 도입하고 JSON 기반 기본값/복구 로직을 이식해 영구 저장소를 대체함.
- Settings·Keys·CSS·Preset·System 커맨드를 Tauri 2 `#[command]` 구조로 변환하고 이벤트 전파를 `AppHandle::emit` 기반으로 재구성함.
- `open`, `rfd` 등을 활용한 플랫폼 기능 대체와 함께 `cargo check` 를 통과하는 Tauri 백엔드 스켈레톤을 확보함.

### 다음 단계
- willhook 기반 키보드 후킹과 오버레이(WebviewWindow) 제어 로직을 구현하고 상태 연동을 마무리.
- 프론트엔드 API 층을 Tauri invoke 기반으로 교체하고 타입/스토어 동기화를 정리.
- 빌드/실행 스크립트를 Tauri 기준으로 정리하고 남은 Electron 의존성 제거.

## 2025-10-02 21:45 – willhook 기반 글로벌 키 후킹 및 오버레이 제어
- willhook 크레이트로 글로벌 키 훅 스레드를 구성하고 `keys:state` 이벤트를 Tauri emit으로 연동.
- 오버레이 WebviewWindow 재생성·위치·잠금 제어 로직을 AppState 메서드로 정비하고 상태 질의를 위한 API 추가.
- overlay:get/set-visible/set-lock/set-anchor/resize Tauri 커맨드를 구현하고 invoke 핸들러에 등록.
- 앱 setup 단계에서 AppState 런타임 초기화를 수행하도록 조정.

## 2025-10-02 22:15 – 프런트엔드 IPC를 Tauri invoke 기반으로 전환
- `@tauri-apps/api` 기반 `tauriApi` 브리지를 작성해 기존 `window.api` 호출 레이어를 Tauri invoke/event로 대체.
- 공용 IPC 타입을 `src/types/api.ts`로 정리하고 글로벌 선언을 단순화해 타입 안정성 확보.
- 메인/오버레이 엔트리에서 브리지 초기화하도록 조정하고 npm 종속성에 Tauri API 패키지 추가 및 lockfile 갱신.

## 2025-10-03 00:05 – Electron 잔여물 정리와 Tauri 빌드 검증
- Electron 메인 프로세스/스크립트/빌드 리소스를 제거하고 npm 스크립트·의존성을 Tauri 중심으로 재구성.
- `tauri.conf.json`을 npm build 파이프라인에 맞춰 갱신하고 번들 식별자를 `com.dmnote.desktop`으로 정정.
- `npm run build` 및 `npm run tauri:build`를 실행해 프런트엔드와 Tauri 릴리스 빌드 파이프라인이 정상 동작함을 확인.

## 2025-10-03 09:16 ? 타입 에러 정리 및 빌드 검증
- Windows 파일시스템 대소문자 혼용으로 깨지던 Modal 경로 import를 모두 대문자 표기로 정리하여 `forceConsistentCasingInFileNames` 오류 해소.
- `tsconfig.json`의 `module`/`moduleResolution`을 `ESNext`/`Node`로 전환해 `@tauri-apps/api` ESM import 경고를 제거.
- `npm run type-check`, `npm run build`, `cargo check`, `npm run tauri:build` 순으로 검증 완료 (Browserslist 경고는 기존 TODO 유지).
