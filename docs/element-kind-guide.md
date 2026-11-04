# 요소 종류 추가 가이드

새 캔버스 요소 종류를 내장 레지스트리에 더하는 방법을 정리한다. 설계 배경과 결정은 [요소 종류 레지스트리 설계](element-kind-design.md)에 있다. 본보기는 커서 트래커다.

## 한눈에 보기

종류 하나는 정의 하나다. `defineElementKind(data, code)`의 첫 인수(데이터)는 백엔드가 읽는 규칙표이고, 둘째 인수(코드)는 그리기·패널·동작이다. 앱은 정의 하나로 저장·검증, 편집 화면, 오버레이·OBS 그리기, 속성 패널, 추가 메뉴를 함께 맞춘다.

| 할 일            | 파일                                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| 정의             | `src/renderer/elementKinds/definitions/<kind>.ts`                                                    |
| 그리기·동작·입력 | `src/renderer/elementKinds/<kind>/`                                                                  |
| 종류 목록        | `src/renderer/elementKinds/builtinKinds.ts` - `BUILTIN_ELEMENT_KINDS`·`BUILTIN_ELEMENT_KIND_FILES`   |
| 백엔드 규칙표    | `npm run kinds:extract` → `src-tauri/kinds/builtin-kinds.json` (함께 커밋)                           |
| 이름             | `src/renderer/locales/*.json`의 `elementKinds.<kind>.*` (다섯 언어 모두)                             |
| 테스트           | 동작 코드 단위 테스트. 추출 결과는 `tests/element-kind-definitions.test.ts`가 정의와 같은지 검사한다 |

새 종류는 트리 문서에만 산다. 앞의 다섯 종류(키·통계·그래프·노브·스프라이트)는 옛 저장 모양과 플러그인 공개 API 모양을 함께 지는 종류라, 새 종류를 `EDITOR_ELEMENT_TYPES`에 넣지 않는다. 종류 목록에는 다섯 종류 뒤에 두고, 두 배열(`BUILTIN_ELEMENT_KINDS`·`BUILTIN_ELEMENT_KIND_FILES`)은 같은 순서로 맞춘다.

## 1. 데이터 부분 - 백엔드가 읽는 규칙표

```ts
export const cursorTrackerKind = defineElementKind(
  {
    kind: 'cursorTracker',
    version: 1,
    fields: [
      {
        name: 'mode',
        value: { type: 'enum', options: ['motion', 'position'] },
        default: 'motion',
      },
      {
        name: 'sensitivity',
        value: { type: 'number', min: 0.1, max: 10 },
        default: 1,
      },
      { name: 'dotColor', value: { type: 'color' }, default: '#FFFFFF' },
    ],
    bundles: ['surface'],
    inputs: ['pointer'],
    defaultSize: { width: 120, height: 120 },
    fallbackSize: { width: 120, height: 120 },
  },
  {
    /* 코드 부분 */
  },
);
```

- `kind`: 저장 이름이다. 정한 뒤에는 바꾸지 않는다.
- `version`: 값 모양을 바꾸면 올리고, 옛 값을 옮기는 방법을 `migrations`에 적는다. 선언으로 못 옮기는 경우만 코드 부분의 `hooks`를 쓴다.
- `fields`: 고유 값 규칙표다. 칸마다 `name`·`value`(값 종류)·`default`, 비울 수 있으면 `nullable: true`. 값 종류는 `bool`, `number`(`min`·`max`·`integer`), `string`(`maxLength`), `enum`(`options`), `color`, `gradient`, `file`(`asset`: image·sound·font), `elementRef`, `id`, `list`, `object`다.
- `bundles`: 앱이 정한 기능 묶음 - `surface`(배경·테두리·그림자), `font`, `image`, `note`, `counter`, `sound`. 묶음 하나가 패널 섹션 하나이고, 값 검사와 패널은 앱이 맡는다.
- `inputs`: 앱이 넣어 주는 입력 - `keySlot`(키 슬롯), `axis`(HID 축), `pointer`(마우스 이동). 새 입력 종류는 백엔드 입력과 프론트 입력 원천을 함께 만들어야 한다.
- `defaultSize`(새로 만들 때 크기)·`fallbackSize`(저장 크기가 없을 때 기준), `rotatable`(기본 `true`), `maxPerScene`(탭 하나에 둘 수 있는 개수).

데이터 부분은 리터럴만 쓴다. 함수·호출·바깥 값이 섞이면 추출이 실패한다. 추출 결과는 Rust가 `include_str!`로 읽어(`src-tauri/src/models/element_kinds.rs`) 커밋을 검사하고 정리할 때 쓴다. 정의를 고친 뒤에는 `npm run kinds:extract`를 돌리고 JSON을 함께 커밋한다(`npm run kinds:check`는 다른지만 본다).

`file` 칸과 기능 묶음 안 파일 칸이 가리키는 자산은 자산 정리(orphan sweep)에서 자동으로 지켜진다. image·sound·font 밖의 새 자산 종류를 만들 때만 `AGENTS.md`의 자산 규칙을 따른다.

## 2. 코드 부분 - 그리기·패널·동작

### 그리기

`render`는 컴포넌트 하나다. 편집 화면(`live: false` - 미리보기 상태)과 오버레이·OBS(`live: true` - 실제 신호)가 같은 코드로 그린다. 받는 값은 다음과 같다.

- `values`: 규칙표로 검사한 고유 값. 타입은 `fields` 선언에서 바로 따라온다.
- `bundles`: 기능 묶음 값. 편집 화면은 편집 미리보기를 얹은 값이다.
- `inputs`: 앱이 넣어 주는 입력(예: `inputs.pointer`). 편집 화면에는 없을 수 있다.
- `element`: 트리 요소(틀·이름 등).

위치·크기·회전·겹침 순서는 앱이 감싸는 상자로 맞추므로, 얼굴은 상자를 채워 그리기만 하면 된다. 겉모습 묶음(`surface`)을 쓰면 `ElementSurface`로 감싼다(`cursorTracker/CursorTrackerFace.tsx` 참고). 실제 신호 구독처럼 오버레이에서만 도는 동작은 `live`일 때만 시작한다.

### 패널

`panel`은 섹션 목록이고, 순서도 종류가 정한다.

- `{ rows: [...] }`: 칸 묶음. 칸마다 `field`, `label`(i18n 키), `control`(`number`·`select`·`toggle`·`color`·`custom`), 보일 조건 `visible(values)`, 하나·여럿 중 한쪽에만 쓸 때 `only`.
- `{ common: 'geometry' }`·`{ common: 'customCss' }`: 공통 위치·크기, 사용자 CSS.
- `{ bundle: 'surface' }` 등: 기능 묶음 섹션.
- `{ custom: Component }`: 선언으로 안 되는 섹션. 값 읽기·쓰기는 종류 코드가 맡는다.
- `tab`: `style`·`note`·`counter`. 섹션이 두 탭 이상에 있으면 패널이 탭을 그린다.

여러 요소를 고르면 패널은 고른 종류들 선언의 합을 그리고, 고친 값은 그 칸을 가진(보일 조건이 있으면 그 칸이 보이는) 요소에만 쓴다. 종류가 따로 할 일은 없다.

편집 화면에서만 쓰는 컴포넌트(직접 만든 입력·섹션)는 `lazyPanelControl(() => import(...))`로 감싸 오버레이 번들에 넣지 않는다.

### 동작

- `label`·`addLabel`·`deleteLabel`·`duplicateLabel`: 레이어·메뉴 이름(i18n 키). `addLabel`이 있으면 캔버스 우클릭 추가 메뉴에 나온다.
- `title(values, element)`: 요소 이름이 없을 때의 패널 제목.
- `lockAspect(values)`: 크기 조절 때 비율을 지킨다.
- `adjustFrame(values, frame)`: 값이 바뀔 때 위치·크기를 함께 맞춘다(예: 비율 고정으로 바꾸면 높이를 모니터 비율에).
- `resizeValues(element, bounds)`: 크기가 바뀔 때 함께 맞출 값.
- `occupiedResizeHandle(element, sceneId)`: 다른 표식이 앉는 크기 조절 손잡이 자리를 비운다.
- `activeVisual`: 눌림 상태 칸(눌림 칠·그림자·이미지)을 보인다. `surfaceShadow: false`는 그림자 칸을 숨긴다.

## 3. 값 쓰기

선언한 칸은 앱이 쓴다. 트리 커밋 입구(`treeEditCommit`)가 화면에 먼저 반영(낙관 적용)하고, 백엔드가 규칙표로 검사해 맞춘 값을 돌려준다. 직접 만든 입력은 받은 `onCommit`으로, 직접 만든 섹션은 트리 커밋 입구(`commitFieldPatches` 등)로 쓴다. 왕복을 기다렸다가 화면에 반영하지 않는다.

## 4. 확인 순서

1. `npm run kinds:extract` - 규칙표 JSON 갱신
2. `npm run type-check`·`npm run lint`·`npm test`
3. `cd src-tauri && cargo test` - 규칙표를 읽는 백엔드 테스트
4. 실제 앱 - 추가 메뉴로 만들기, 패널 칸 고치기(하나·여럿, 다른 종류와 섞어서), 끌기·크기 조절·회전, 되돌리기, 저장 뒤 다시 열기, 오버레이·OBS 그리기

## 본보기 - 커서 트래커

- `definitions/cursorTracker.ts`: 정의(규칙표·패널·비율 고정·위치 맞추기)
- `cursorTracker/CursorTrackerFace.tsx`: 그리기(`live`일 때만 마우스 입력 구독)
- `cursorTracker/cursorTrackerMotion.ts`: 동작 계산과 단위 테스트
- `cursorTracker/MonitorSelect.tsx`: 직접 만든 입력(지연 로딩)
