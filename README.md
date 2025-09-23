**한국어** | [English](docs/readme_en.md)

<div align="center">
  <img src="build/icon.ico" alt="dmnote Logo" width="120" height="120">

  <h1>DM Note</h1>
  
  <p>
    <strong>리듬게임을 위한 오픈 소스 키뷰어 프로그램</strong>
  </p>
  <p>
    <strong>사용자 정의 키 매핑과 스타일링, 손쉽게 전환 가능한 프리셋, 모던하고 직관적인 인터페이스를 제공합니다.</strong>
  </p>
  
  [![GitHub release](https://img.shields.io/github/release/lee-sihun/DmNote.svg?logo=github)](https://github.com/lee-sihun/DmNote/releases)
  [![GitHub downloads](https://img.shields.io/github/downloads/lee-sihun/DmNote/total.svg?logo=github)](https://github.com/lee-sihun/DmNote/releases/download/1.2.0/DM.NOTE.v.1.2.0.zip)
  [![GitHub license](https://img.shields.io/github/license/lee-sihun/DmNote.svg?logo=github)](https://github.com/lee-sihun/DmNote/blob/master/LICENSE)
</div>

https://github.com/user-attachments/assets/20fb118d-3982-4925-9004-9ce0936590c2


## 🌟 개요

**DM Note**는 DJMAX RESPECT V에서 사용하기 위해 만들어진 키뷰어 프로그램입니다. Electron과 React로 구축 되었으며
키보드 후킹을 위해 [node-global-key-listener-extended](https://github.com/lee-sihun/node-global-key-listener) 패키지를 사용합니다.
간편한 설정으로 스트리밍이나 플레이 영상 제작 시 키 입력을 시각적으로 보여줄 수 있습니다. 현재는 windows 환경만 지원하며, 리듬게임 이외의 다른 게임에서도 사용이 가능합니다.

[DM NOTE v1.2.0 다운로드](https://github.com/lee-sihun/DmNote/releases/download/1.2.0/DM.NOTE.v.1.2.0.zip)

## ✨ 주요 기능

### ⌨️ 키보드 입력 및 매핑

- 실시간 키보드 입력 감지 및 시각화
- 커스텀 키 매핑 설정

### 🎨 키 스타일 커스터마이징

- 키 사이즈 조절 및 추가/삭제
- 그리드 기반 키 배치
- 이미지 할당 지원
- 커스텀 CSS 지원

### 💾 프리셋 및 설정 관리

- 사용자 설정 자동 저장
- 프리셋 저장/불러오기

### 🖼️ 오버레이 및 창 관리

- 창 위치 고정
- 항상 위에 표시
- 리사이즈 기준점 선택

### 🌧️ 노트 효과 (Raining Effect) 커스터마이징

- 노트 효과 색상, 투명도, 라운딩, 속도, 높이 조절
- 리버스 기능

### ⚙️ 그래픽 및 설정

- 다국어 지원 (한글, 영어)
- 그래픽 렌더링 옵션 (Direct3D 11/9, OpenGL)
- 설정 초기화

## 🚀 개발

### 기술 스택

- **프론트엔드**: React 19 + Typescript + Vite 7
- **백엔드**: Electron
- **스타일링**: Tailwind CSS 3
- **키보드 후킹**: [node-global-key-listener-extended](https://github.com/lee-sihun/node-global-key-listener)
- **패키지 매니저**: npm

### 폴더 구조

```
DmNote/
├── src/                   # 소스 코드
│   ├── main/              # Electron 메인 프로세스
│   │   ├── config/        # 창 관련 설정
│   │   ├── services/      # 백그라운드 서비스 (키보드 후킹, 설정 관리 등)
│   │   └── windows/       # 창 생성 및 관리
│   ├── renderer/          # React 렌더러 프로세스
│   │   ├── assets/        # 정적 에셋
│   │   ├── components/    # UI 컴포넌트
│   │   ├── locales/       # 다국어 지원 (i18n)
│   │   ├── stores/        # 전역 상태 관리 (Zustand)
│   │   ├── utils/         # 유틸리티 함수
│   │   └── windows/       # 각 창별 진입점
│   └── types/             # TypeScript 타입 선언
├── package.json           # 프로젝트 의존성 및 실행 스크립트
├── tailwind.config.js     # Tailwind CSS 설정
├── tsconfig.json          # TypeScript 설정
├── vite.config.ts         # Vite 설정
```

### 기본 설치 및 실행

이 프로젝트는 전역 키보드 후킹을 위해 `node-gyp`를 이용하는 [node-global-key-listener-extended](https://github.com/lee-sihun/node-global-key-listener) 패키지를 사용하고 있습니다. 해당 패키지는 네이티브 C++ 코드를 빌드해야 하므로 다음 개발 환경이 설치되어 있어야 합니다.

- **Node.js**
- **Python 3.x**
- **Visual Studio Build Tools** (C++ 데스크톱 개발 워크로드 포함)

위의 개발 환경이 모두 준비되었다면, 터미널에서 다음 명령어를 순서대로 입력하세요.

```bash
git clone https://github.com/lee-sihun/DmNote.git
cd DmNote
npm install
npm run start
```

### (선택) C++ 빌드 도구 없이 빠르게 테스트

개발 환경에 C++ 빌드 환경 구성이 어려운 경우, 패키지의 사전 빌드된 버전을 사용해서 테스트를 진행할 수 있습니다. `package.json`의 `postinstall` 스크립트를 제거하고 `dependencies` 항목을 아래와 같이 변경해주세요.

```json
{
  "dependencies": {
    "node-global-key-listener-extended": "github:lee-sihun/node-global-key-listener#win-keyserver-version"
  }
}
```

파일을 수정한 뒤, 터미널에서 `npm install`와 `npm run start`를 실행해주세요.

## 🖼️ 스크린샷

<!--img src="docs/assets/2025-08-29_12-07-12.webp" alt="Note Effect" width="700"-->

<img src="docs/assets/IMG_1005.gif" alt="Note Effect" width="700">

<!--img src="docs/assets/1.webp" alt="키뷰어 데모 1" width="700"-->

<img src="docs/assets/2025-09-20_11-55-17.gif" alt="키뷰어 데모 2" width="700">

<!--img src="docs/assets/IMG_1008.gif" alt="키뷰어 데모 3" width="700"-->

<img src="docs/assets/2025-09-20_11-57-38.gif" alt="키뷰어 데모 4" width="700">

## 📝 참고사항

- 그래픽 문제 발생 시 설정에서 렌더링 옵션을 변경해주세요.
- OBS 윈도우 캡쳐로 크로마키 없이 배경을 투명하게 불러올 수 있습니다.
- 게임 화면 위에 표시할 경우, **항상 위에 표시**로 배치한 뒤 **오버레이 창 고정**을 활성화해주세요.
- 기본 제공 프리셋, 커스텀 CSS 예제 파일은 `resources > resources` 폴더에 있습니다.
- 클래스명 할당 시 선택자는 제외하고 이름만 입력해주세요.(`blue` -> o, `.blue` -> x)
- 프로그램 기본 설정은 `%appdata%/dm-note` 폴더의 `config.json`에 저장됩니다.

## 🤝 기여하기

여러분의 참여를 환영합니다! 자세한 내용은 [기여 가이드](CONTRIBUTING.md)를 확인해주세요.

## 📄 라이선스

[GPL-3.0 License Copyright (C) 2024 lee-sihun](https://github.com/lee-sihun/DmNote/blob/master/LICENSE)

## ❤️ Special Thanks!

- [electron/electron](https://github.com/electron/electron)
- [LaunchMenu/node-global-key-listener](https://github.com/LaunchMenu/node-global-key-listener)

<!--
## 🔜 업데이트 예정

- 키 입력 카운트, 입력 속도 시각화
- 동시 입력 간격 밀리초(ms) 표시
- 입력 통계 분석 기능
 -->


