---
name: agent-review
description: "독립 서브에이전트의 적대적 코드 리뷰. 저장·복구, 동시성, IPC 계약처럼 실패 비용이 큰 변경에 사용자가 직접 호출."
disable-model-invocation: true
argument-hint: "[리뷰 초점 (선택)]"
---

# 적대적 코드 리뷰

1. 리뷰 전에 자동 검증(type-check·lint·test, clippy)을 먼저 통과시킨다. 리뷰어는 도구가 못 잡는 로직·동작에 집중한다.
2. `git diff --stat`과 codebase-memory의 `detect_changes`·`trace_call_path`로 변경 범위와 영향 범위를 파악한다.
3. `Agent`(general-purpose, `model` 생략해 메인 상속, 백그라운드)에게 아래 프롬프트로 리뷰를 맡긴다. 결과가 오기 전에는 리뷰 대상 파일을 편집하지 않는다.
4. CRITICAL·HIGH는 메인이 직접 수정하고 검증을 재실행한다. 방어 코드 추가나 컨벤션(`let _ = store.update(...)`)에 대한 지적은 생략하고, 보류한 항목은 보고에 남긴다.
5. 서브에이전트가 실패하면 그 사실을 명시하고 메인이 직접 diff를 리뷰한다. 후속 질문은 `SendMessage`로 같은 에이전트에 한다.

## 리뷰어 프롬프트

```
당신은 DmNote(Tauri + React)의 엄격한 적대적 코드 리뷰어입니다.
READ-ONLY: 파일을 수정하지 말고, git checkout/stash/restore 등 작업 트리를 바꾸는 명령도 쓰지 마세요. 미커밋 변경은 리뷰 대상입니다.
작업 디렉토리: (절대 경로) / 리뷰 범위: (git diff <base> 또는 커밋 해시)
컨텍스트: (무엇을 왜 바꿨는지) / 초점: $ARGUMENTS
우선순위: 1) 회귀 위험이 큰 지점 (파일·함수 지목) 2) 기능 완결성 (타입 분기·프로토콜 문자열 쌍 누락) 3) 그 외 로직 버그
이미 검증됨: tsc/eslint/vitest/cargo — 타입·문법이 아니라 로직과 동작에 집중.
의도된 설계: (버그로 오인할 수 있는 결정)
정확성이나 명시된 요구사항에 영향을 주는 문제만 보고. 각 항목: 심각도(CRITICAL/HIGH/MEDIUM/LOW), 파일:라인, 문제, 수정안. 종합 판정: SHIP / FIX-FIRST
```

## 출력

판정 + 한 줄 평가 → 이슈 목록 (반영 여부) → 보류 사유
