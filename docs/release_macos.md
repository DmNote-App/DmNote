# macOS 릴리즈 절차

`.github/workflows/release-macos.yml`이 유니버설 DMG 빌드 → Developer ID 서명 → 공증 → draft 릴리즈 첨부까지 수행한다. 같은 태그로 Windows workflow도 실행되어 Windows 자산을 동일 draft 릴리즈에 첨부한다.

## 1. 시크릿 (최초 1회)

| 시크릿 | 값 | 발급 |
|---|---|---|
| `MACOS_CERT_P12_BASE64` | Developer ID Application 인증서 `.p12`의 base64 | 키체인 접근 → 내 인증서 → 우클릭 → 내보내기 (**개인 키 포함**, 암호 설정) |
| `MACOS_CERT_PASSWORD` | `.p12` 내보내기 암호 | — |
| `MACOS_SIGNING_IDENTITY` | `Developer ID Application: 이름 (TEAMID)` | 선택 — 설정 시 키체인의 identity와 일치하는지 검사 |
| `APPLE_API_KEY_ID` | App Store Connect API Key ID (10자) | App Store Connect → 사용자 및 액세스 → 통합 → **팀 키** (Developer 이상). 개인 키는 `--issuer`가 없어 사용 불가 |
| `APPLE_API_ISSUER_ID` | Issuer ID (UUID) | 위 페이지 상단 |
| `APPLE_API_KEY_P8_BASE64` | `AuthKey_XXXXXXXXXX.p8`의 base64 | 팀 키 생성 시 1회만 다운로드 가능 |

```bash
base64 -i DeveloperID.p12 | gh secret set MACOS_CERT_P12_BASE64
gh secret set MACOS_CERT_PASSWORD
gh secret set MACOS_SIGNING_IDENTITY --body "Developer ID Application: 이름 (TEAMID)"
gh secret set APPLE_API_KEY_ID
gh secret set APPLE_API_ISSUER_ID
base64 -i AuthKey_XXXXXXXXXX.p8 | gh secret set APPLE_API_KEY_P8_BASE64
```

`APPLE_CERTIFICATE` / `APPLE_CERTIFICATE_PASSWORD`(Tauri 내장 흐름)는 **사용하지 않는다** — Tauri의 임시 키체인은 번들 단계에서 생성되어, 그 전에 헬퍼를 서명하는 `scripts/sign-macos-helper.sh` 훅이 identity를 찾지 못한다.

공증도 Tauri에 맡기지 않는다. Tauri 번들러는 `stapler staple` 실패를 종료 코드째 무시하고, staple 직후 같은 빌드 호출에서 그 앱으로 DMG를 만든다. 그래서 빌드 스텝에는 공증 자격 증명을 넘기지 않고(Tauri는 서명과 DMG 생성만 함) 이후를 워크플로가 순서대로 처리한다.

1. 앱 공증 + staple (`scripts/notarize-macos.sh`, staple은 최대 6회 재시도)
2. Tauri DMG 안의 앱을 staple된 앱으로 교체하고 재서명 (`scripts/repack-macos-dmg.sh`)
3. DMG 공증 + staple
4. 업로드할 DMG와 그 안쪽 앱을 최종 검증 (`scripts/verify-macos-dmg.sh`)

안쪽 앱 staple까지 확인하는 이유는 앱 내 자동 업데이트가 DMG를 `hdiutil`로 마운트해 앱을 꺼내 설치하기 때문이다. 이 경로에서는 DMG 티켓이 앱으로 이어지지 않는다.

위 세 스크립트는 앱 소스(`release_sha`)가 아니라 워크플로와 같은 커밋에서 따로 체크아웃한다. 수동 재빌드는 이전 버전 커밋을 빌드하는데, 그 커밋에는 스크립트가 없을 수 있기 때문이다.

## 2. 드라이런 (워크플로 변경 후 권장)

Actions → **Release macOS** → Run workflow → ref: `main`, `dry_run: true`
빌드·서명·공증·검증만 수행하고 DMG를 workflow artifact로 올린다. 릴리즈는 만들지 않는다.

## 3. 릴리즈

```bash
npm version patch        # package.json 버전 올리고 tauri.conf.json / Cargo.toml / Cargo.lock / README 동기화 후
                         # "X.Y.Z" 커밋 + 로컬 X.Y.Z 태그 생성 (.npmrc의 tag-version-prefix= 로 v 접두사 없음)
git push origin main     # 태그는 push하지 않음
```

`package.json` 버전 변경과 커밋 제목 `X.Y.Z`가 일치하는 main push를 감지하면 macOS와 Windows workflow가 실행된다. 원격 `X.Y.Z` 태그와 draft 릴리즈는 Actions가 자동 생성하고 각 자산을 첨부한다. 릴리즈 본문은 `scripts/build-release-notes.js`가 생성한다 (체인지로그 링크 + 자산 안내 + `CHANGELOG.md`에서 추출한 기여자 섹션). 변경 내역 자체는 `CHANGELOG.md`에 유지한다. 이후:

> 자산 이름 `DM.NOTE_<tag>_{aarch64|x64|universal}.dmg`는 **앱 내 자동 업데이트가 의존하는 계약**이다 (`src-tauri/src/commands/app/update_macos/mod.rs`의 `asset_candidates`). 아키텍처 전용 자산이 있으면 그것을 우선 받으므로, 서명·공증되지 않은 DMG를 그 이름으로 수동 업로드하지 말 것.

1. `CHANGELOG.md`와 `CHANGELOG_en.md`에 `## [X.Y.Z](...)` 섹션이 있는지 확인 (본문 링크가 `#XYZ` 앵커로 걸린다)
2. macOS DMG와 Windows 자산(`DM.NOTE.exe`, `DM.NOTE.v.X.Y.Z.zip`)이 모두 있는지 확인
3. **Publish** → `update-website.yml`이 DmSite 갱신을 트리거

`docs/releases/*.md`는 2.0.1까지의 published 릴리즈 본문이 링크하고 있으므로 **삭제하지 않는다**. 신규 버전 노트는 더 추가하지 않고 `CHANGELOG.md`에만 쓴다.

릴리즈 본문은 draft를 처음 만든 workflow가 **한 번만** 기록한다. publish 후에 기여자 크레딧이나 영문 노트를 체인지로그에 추가했다면 본문에 반영되지 않으므로 다음으로 다시 쓴다.

```bash
node scripts/refresh-release-notes.js 2.0.2          # 미리보기
node scripts/refresh-release-notes.js 2.0.2 --apply  # 반영
```

본문 문구 자체를 바꾸려면 템플릿이 있는 `scripts/lib/release-notes.js`를 수정한다 (두 진입점이 공유한다).

현재 버전을 다시 빌드하려면 Run workflow → ref: `main` + `dry_run` 해제. draft면 DMG만 덮어쓰고 노트·다른 자산은 유지되며, 이미 publish된 릴리즈는 자동 덮어쓰기를 거부한다(수동 `gh release upload --clobber`).

`npm version`이 중간에 실패하면(예: `cargo update` 오프라인) 커밋·태그 없이 버전 파일만 바뀐 상태로 남는다 — `git checkout -- . && git status`로 되돌린 뒤 재시도.

## 4. 문제 해결

| 증상 | 원인 / 조치 |
|---|---|
| preflight `버전 불일치` | `npm run sync-version` 후 커밋하고 다시 태깅 |
| `임시 키체인에 Developer ID Application identity 없음` | `.p12`를 개인 키 없이 내보냄 → 키체인 접근 "내 인증서"에서 인증서+키를 함께 선택해 다시 내보내기 |
| 헬퍼 훅 `키체인에서 identity를 찾을 수 없음` | 키체인 스텝 실패 또는 `APPLE_CERTIFICATE` 흐름을 섞어 씀 |
| 앱·DMG 공증 `Invalid`/타임아웃 | `scripts/notarize-macos.sh`가 `notarytool log`를 스텝 로그에 출력함. issues 항목 확인. 헬퍼 미서명이면 `scripts/sign-macos-helper.sh` 훅 동작 확인 |
| 공증 `In Progress`로 장시간 대기 | 대기 상한은 45분(`NOTARY_TIMEOUT`). 스텝 로그의 submission id로 `xcrun notarytool info <id>` 확인. job 재실행은 새로 제출하므로 Apple 쪽 처리가 끝난 뒤에 할 것 (신규 계정 첫 제출은 수 시간 걸릴 수 있음) |
| `staple` 6회 실패 | 스텝 로그의 stapler 오류 확인. `Record not found`면 notary log의 `ticketContents` cdhash와 `codesign -dvvv`의 앱 cdhash를 비교 |
| 최종 DMG 검증에서 안쪽 앱 `stapler validate` 실패 | DMG 재조립 스텝이 staple된 앱으로 교체했는지 확인 |
