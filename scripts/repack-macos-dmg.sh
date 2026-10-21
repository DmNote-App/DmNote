#!/usr/bin/env bash
# DMG 안의 앱을 지정한 앱으로 바꾸고 창 배치(.DS_Store)를 넣어 새 DMG 생성
#
# Tauri는 앱 번들 직후 같은 빌드 호출에서 DMG를 만들어, 그 뒤 앱에 붙인 공증 티켓이
# DMG 안 사본에는 없음. CI에서는 Finder 배치 단계도 건너뛰어 창 배치가 비어 있음
# 볼륨 아이콘·Applications 링크 등 Tauri DMG 구성은 그대로 두고 앱과 배치만 교체
# 결과 DMG는 미서명, 서명·공증은 호출 측

set -euo pipefail

USAGE="usage: repack-macos-dmg.sh <원본 dmg> <앱> <창 배치 파일> <출력 dmg>"
SOURCE_DMG="${1:?$USAGE}"
APP_BUNDLE="${2:?$USAGE}"
LAYOUT_FILE="${3:?$USAGE}"
OUTPUT_DMG="${4:?$USAGE}"
APP_NAME="$(basename "$APP_BUNDLE")"

fail() {
  echo "[FAIL] $*" >&2
  exit 1
}

[[ -f "$SOURCE_DMG" ]] || fail "원본 DMG를 찾을 수 없음: $SOURCE_DMG"
[[ -d "$APP_BUNDLE" ]] || fail "앱 번들을 찾을 수 없음: $APP_BUNDLE"
[[ -f "$LAYOUT_FILE" ]] || fail "창 배치 파일을 찾을 수 없음: $LAYOUT_FILE"
[[ ! -e "$OUTPUT_DMG" ]] || fail "출력 경로가 이미 있음: $OUTPUT_DMG"

WORK_DIR="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/dmg-repack.XXXXXX")"
RW_DMG="$WORK_DIR/rw.dmg"
MOUNT_DIR="$WORK_DIR/mnt"
MOUNTED=0

cleanup() {
  local rc=$?
  if (( MOUNTED )); then
    hdiutil detach "$MOUNT_DIR" -force -quiet || true
  fi
  rm -rf "$WORK_DIR"
  exit "$rc"
}
trap cleanup EXIT

# Finder·Spotlight가 잠깐 잡고 있으면 분리가 실패할 수 있어 재시도
detach_volume() {
  local delay
  for delay in 2 4 8 16; do
    hdiutil detach "$MOUNT_DIR" -quiet && return 0
    sleep "$delay"
  done
  hdiutil detach "$MOUNT_DIR" -quiet
}

mkdir "$MOUNT_DIR"
hdiutil convert "$SOURCE_DMG" -format UDRW -o "$RW_DMG" -quiet
hdiutil attach "$RW_DMG" -readwrite -nobrowse -noautoopen -mountpoint "$MOUNT_DIR" -quiet
MOUNTED=1

[[ -d "$MOUNT_DIR/$APP_NAME" ]] || fail "DMG 루트에 앱 없음: $APP_NAME"
rm -rf "${MOUNT_DIR:?}/$APP_NAME"
ditto "$APP_BUNDLE" "$MOUNT_DIR/$APP_NAME"
# 아이콘 위치는 파일명 기준이라 앱 이름이 바뀌면 배치 파일도 다시 생성해야 함
cp "$LAYOUT_FILE" "$MOUNT_DIR/.DS_Store"

# 강제 분리한 이미지는 배포하지 않음
detach_volume || fail "DMG 분리 실패: $MOUNT_DIR"
MOUNTED=0

# Tauri DMG(create-dmg)와 같은 형식·압축 수준
hdiutil convert "$RW_DMG" -format UDZO -imagekey zlib-level=9 -o "$OUTPUT_DMG" -quiet
echo "[OK] DMG 재조립: $OUTPUT_DMG"
