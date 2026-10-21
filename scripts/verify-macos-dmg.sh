#!/usr/bin/env bash
# 배포 DMG 최종 검증: DMG 서명·공증 + 루트 구성(Applications 링크·창 배치) + 안쪽 앱 서명·공증
#
# 앱 내 자동 업데이트는 DMG를 hdiutil로 마운트해 앱을 꺼내므로(update_macos/install.rs)
# DMG 티켓만으로는 부족하고 안쪽 앱에도 티켓이 붙어 있어야 한다
# 앱 구성(헬퍼·최소 macOS 등)은 공증 전 verify-macos-bundle.sh가 같은 서명 앱에서 확인하고
# 이후 변경 없음은 여기의 codesign --deep --strict가 보장

set -euo pipefail

DMG="${1:?usage: verify-macos-dmg.sh <dmg>}"
APP_NAME="DM NOTE.app"

fail() {
  echo "[FAIL] $*" >&2
  exit 1
}

[[ -f "$DMG" ]] || fail "DMG를 찾을 수 없음: $DMG"

hdiutil verify "$DMG" -quiet
codesign --verify --strict --verbose=2 "$DMG"
xcrun stapler validate "$DMG"
spctl -a -vvv -t open --context context:primary-signature "$DMG"

WORK_DIR="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/dmg-verify.XXXXXX")"
MOUNT_DIR="$WORK_DIR/mnt"
MOUNTED=0

cleanup() {
  local rc=$?
  if (( MOUNTED )); then
    hdiutil detach "$MOUNT_DIR" -quiet || hdiutil detach "$MOUNT_DIR" -force -quiet || true
  fi
  rm -rf "$WORK_DIR"
  exit "$rc"
}
trap cleanup EXIT

mkdir "$MOUNT_DIR"
hdiutil attach "$DMG" -readonly -nobrowse -noautoopen -mountpoint "$MOUNT_DIR" -quiet
MOUNTED=1

APP="$MOUNT_DIR/$APP_NAME"
[[ -d "$APP" ]] || fail "DMG 루트에 앱 없음: $APP_NAME"
[[ "$(readlink "$MOUNT_DIR/Applications" || true)" == "/Applications" ]] \
  || fail "DMG 루트에 Applications 링크 없음"
[[ -f "$MOUNT_DIR/.DS_Store" ]] || fail "DMG 루트에 창 배치(.DS_Store) 없음"

codesign --verify --deep --strict --verbose=2 "$APP"
xcrun stapler validate "$APP"
spctl -a -vvv -t exec "$APP"

echo "[OK] DMG 최종 검증 완료: $DMG"
