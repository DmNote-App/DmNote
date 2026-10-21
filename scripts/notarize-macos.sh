#!/usr/bin/env bash
# 릴리즈 앱(.app)·DMG 공증 제출 → 결과 확인 → staple → validate
#
# Tauri 번들러는 stapler 실패를 종료 코드째 무시하므로 릴리즈 공증·staple은 여기서 소유
# 공증 직후 티켓 조회가 실패할 수 있어 staple만 제한 횟수로 재시도
#
# 인증: NOTARY_API_KEY_PATH(.p8 경로), NOTARY_API_KEY_ID, NOTARY_API_ISSUER_ID
# NOTARY_TIMEOUT: notarytool wait 상한 (기본 45m)

set -euo pipefail

TARGET="${1:?usage: notarize-macos.sh <.app 또는 .dmg 경로>}"
TIMEOUT="${NOTARY_TIMEOUT:-45m}"
# 첫 시도 포함 6회, 실패 후 대기(초)
STAPLE_DELAYS=(15 30 60 60 60)

fail() {
  echo "[FAIL] $*" >&2
  exit 1
}

[[ -n "${NOTARY_API_KEY_PATH:-}" ]] || fail "NOTARY_API_KEY_PATH 없음"
[[ -n "${NOTARY_API_KEY_ID:-}" ]] || fail "NOTARY_API_KEY_ID 없음"
[[ -n "${NOTARY_API_ISSUER_ID:-}" ]] || fail "NOTARY_API_ISSUER_ID 없음"
AUTH=(--key "$NOTARY_API_KEY_PATH" --key-id "$NOTARY_API_KEY_ID" --issuer "$NOTARY_API_ISSUER_ID")

WORK_DIR="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/notarize.XXXXXX")"
trap 'rm -rf "$WORK_DIR"' EXIT
LOG_PATH="$WORK_DIR/notary-log.json"

case "$TARGET" in
  *.app)
    [[ -d "$TARGET" ]] || fail "앱 번들을 찾을 수 없음: $TARGET"
    SUBMIT_PATH="$WORK_DIR/$(basename "$TARGET" .app).zip"
    # Finder 압축과 같은 형식 (공증 오탐 방지)
    ditto -c -k --sequesterRsrc --keepParent "$TARGET" "$SUBMIT_PATH"
    ;;
  *.dmg)
    [[ -f "$TARGET" ]] || fail "DMG를 찾을 수 없음: $TARGET"
    SUBMIT_PATH="$TARGET"
    ;;
  *)
    fail "지원하지 않는 대상: $TARGET"
    ;;
esac

SUBMIT_JSON="$(xcrun notarytool submit "$SUBMIT_PATH" "${AUTH[@]}" --output-format json)" \
  || fail "공증 제출 실패: $TARGET"
SUBMISSION_ID="$(jq -r '.id // empty' <<<"$SUBMIT_JSON")"
[[ -n "$SUBMISSION_ID" ]] || fail "submission id 없음: $SUBMIT_JSON"
echo "[notary] 제출 $(basename "$TARGET") id=$SUBMISSION_ID"

# wait가 타임아웃·연결 끊김으로 끝나도 같은 id로 최종 상태를 다시 조회
xcrun notarytool wait "$SUBMISSION_ID" "${AUTH[@]}" --timeout "$TIMEOUT" || true
INFO_JSON="$(xcrun notarytool info "$SUBMISSION_ID" "${AUTH[@]}" --output-format json)" || INFO_JSON='{}'
STATUS="$(jq -r '.status // "Unknown"' <<<"$INFO_JSON")"
echo "[notary] id=$SUBMISSION_ID status=$STATUS"

xcrun notarytool log "$SUBMISSION_ID" "$LOG_PATH" "${AUTH[@]}" >/dev/null 2>&1 || true

print_log() {
  if [[ -f "$LOG_PATH" ]]; then
    cat "$LOG_PATH"
  else
    echo "[notary] 공증 로그를 받지 못함"
  fi
}

if [[ "$STATUS" != "Accepted" ]]; then
  print_log
  fail "공증 실패: $TARGET status=$STATUS"
fi
if [[ -f "$LOG_PATH" ]]; then
  jq -c '{status, statusSummary, issues}' "$LOG_PATH"
fi

attempt=1
until xcrun stapler staple "$TARGET"; do
  if (( attempt > ${#STAPLE_DELAYS[@]} )); then
    print_log
    fail "staple 실패: $TARGET (${attempt}회 시도)"
  fi
  delay="${STAPLE_DELAYS[attempt - 1]}"
  echo "[notary] staple ${attempt}회 실패, ${delay}초 후 재시도"
  sleep "$delay"
  attempt=$((attempt + 1))
done

xcrun stapler validate "$TARGET"
echo "[OK] 공증·staple 완료: $TARGET"
