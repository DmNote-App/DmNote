# Display Element 이벤트 핸들러 개선 사항

## 📋 개요

플러그인 개발자가 Display Element의 이벤트 핸들러를 더 편리하게 사용할 수 있도록 자동 핸들러 관리 시스템을 구현했습니다.

## 🎯 해결한 문제

### 이전 방식의 문제점

```javascript
// ❌ 문제점 1: 전역 네임스페이스 오염
window[`handleKpsPanelClick_${panelId}`] = async () =>
  await handlePanelClick(panelId);
window[`handleKpsPositionChange_${panelId}`] = async (pos) =>
  await handlePositionChange(panelId, pos);
window[`handleKpsDelete_${panelId}`] = async () =>
  await handlePanelDelete(panelId);

// ❌ 문제점 2: 문자열로 전달
dmn.ui.displayElement.add({
  onClick: `handleKpsPanelClick_${panelId}`,
  onPositionChange: `handleKpsPositionChange_${panelId}`,
  onDelete: `handleKpsDelete_${panelId}`,
});

// ❌ 문제점 3: 수동 클린업 필요
dmn.plugin.registerCleanup(() => {
  delete window[`handleKpsPanelClick_${panelId}`];
  delete window[`handleKpsPositionChange_${panelId}`];
  delete window[`handleKpsDelete_${panelId}`];
});
```

**문제점:**

- 전역 네임스페이스 오염
- 핸들러 이름 충돌 위험
- 클린업 시 수동으로 delete 해야 함
- 타입 안정성 부족

## ✨ 개선된 방식

### 새로운 API 사용법

```javascript
// ✅ 함수를 직접 전달 - 자동으로 핸들러 등록됨!
dmn.ui.displayElement.add({
  html: generatePanelHtml(panelId),
  position: settings.position,
  draggable: true,

  // 함수를 직접 전달 (문자열 아님!)
  onClick: async () => await handlePanelClick(panelId),
  onPositionChange: async (pos) => await handlePositionChange(panelId, pos),
  onDelete: async () => await handlePanelDelete(panelId),
});

// ✅ 클린업도 자동으로 처리됨 (수동 delete 불필요)
dmn.plugin.registerCleanup(() => {
  dmn.ui.displayElement.clearMyElements(); // 핸들러도 자동으로 정리됨
});
```

### 장점

- ✅ **전역 네임스페이스 오염 없음** - `window` 객체에 핸들러 등록 불필요
- ✅ **이름 충돌 걱정 없음** - 시스템이 고유 ID 자동 생성
- ✅ **자동 클린업** - Element 삭제 시 핸들러도 자동으로 정리
- ✅ **타입 안정성 향상** - 함수 시그니처 검증 가능
- ✅ **클로저 활용 가능** - 로컬 변수에 자유롭게 접근

## 🔧 구현 내용

### 1. 핸들러 레지스트리 시스템 (`tauriApi.ts`)

```typescript
class PluginHandlerRegistry {
  private handlers: Map<string, HandlerFunction> = new Map();
  private pluginHandlers: Map<string, Set<string>> = new Map();

  // 핸들러 등록 및 고유 ID 생성
  register(pluginId: string, handler: HandlerFunction): string {
    const handlerId = `__dmn_handler_${pluginId}_${Date.now()}_${Math.random()
      .toString(36)
      .substring(7)}`;
    this.handlers.set(handlerId, handler);
    // ...
    return handlerId;
  }

  // 플러그인의 모든 핸들러 삭제
  clearPlugin(pluginId: string): void {
    // ...
  }
}
```

### 2. 타입 정의 개선 (`api.ts`)

```typescript
export type PluginDisplayElement = {
  // 함수 또는 문자열 모두 지원 (하위 호환성)
  onClick?: string | (() => void | Promise<void>);
  onPositionChange?:
    | string
    | ((position: { x: number; y: number }) => void | Promise<void>);
  onDelete?: string | (() => void | Promise<void>);
  // ...
};

export type PluginDisplayElementInternal = PluginDisplayElement & {
  // 자동 생성된 핸들러 ID (클린업용)
  _onClickId?: string;
  _onPositionChangeId?: string;
  _onDeleteId?: string;
};
```

### 3. displayElement.add 자동 처리

```typescript
displayElement: {
  add: (element: Omit<PluginDisplayElement, "id">) => {
    // 함수가 전달된 경우 자동으로 핸들러 등록
    if (typeof element.onClick === "function") {
      onClickId = handlerRegistry.register(pluginId, element.onClick);
    }

    // 내부적으로 문자열 ID로 변환하여 저장
    const internalElement = {
      ...element,
      onClick: onClickId || (typeof element.onClick === "string" ? element.onClick : undefined),
      _onClickId: onClickId, // 클린업용
    };

    // ...
  },
}
```

### 4. 자동 클린업 처리

```typescript
// Element 삭제 시
remove: (fullId: string) => {
  const element = usePluginDisplayElementStore.getState().elements.find(el => el.fullId === fullId);
  if (element) {
    // 자동 등록된 핸들러 정리
    if (element._onClickId) handlerRegistry.unregister(element._onClickId);
    if (element._onPositionChangeId) handlerRegistry.unregister(element._onPositionChangeId);
    if (element._onDeleteId) handlerRegistry.unregister(element._onDeleteId);
  }
  // ...
},

// 플러그인 클린업 시 (useCustomJsInjection.ts)
const runPluginCleanups = (pluginId: string) => {
  // ...
  handlerRegistry.clearPlugin(pluginId); // 플러그인의 모든 핸들러 정리
};
```

## 📝 마이그레이션 가이드

### Before (이전)

```javascript
// 핸들러를 전역에 노출
window[`handleClick_${id}`] = async () => await handleClick(id);
window[`handlePositionChange_${id}`] = async (pos) =>
  await handlePositionChange(id, pos);
window[`handleDelete_${id}`] = async () => await handleDelete(id);

dmn.ui.displayElement.add({
  onClick: `handleClick_${id}`,
  onPositionChange: `handlePositionChange_${id}`,
  onDelete: `handleDelete_${id}`,
});

// 클린업 시 수동 삭제
dmn.plugin.registerCleanup(() => {
  delete window[`handleClick_${id}`];
  delete window[`handlePositionChange_${id}`];
  delete window[`handleDelete_${id}`];
});
```

### After (개선)

```javascript
// 함수를 직접 전달
dmn.ui.displayElement.add({
  onClick: async () => await handleClick(id),
  onPositionChange: async (pos) => await handlePositionChange(id, pos),
  onDelete: async () => await handleDelete(id),
});

// 클린업 간소화
dmn.plugin.registerCleanup(() => {
  dmn.ui.displayElement.clearMyElements(); // 핸들러 자동 정리
});
```

## 📚 적용된 예제

### kps.js 플러그인

**변경 전:**

```javascript
// 핸들러 등록
window[`handleKpsPanelClick_${panelId}`] = async () =>
  await handlePanelClick(panelId);
window[`handleKpsPositionChange_${panelId}`] = async (pos) =>
  await handlePositionChange(panelId, pos);
window[`handleKpsDelete_${panelId}`] = async () =>
  await handlePanelDelete(panelId);

const elementId = dmn.ui.displayElement.add({
  onClick: `handleKpsPanelClick_${panelId}`,
  onPositionChange: `handleKpsPositionChange_${panelId}`,
  onDelete: `handleKpsDelete_${panelId}`,
});

// 클린업
dmn.plugin.registerCleanup(() => {
  for (const [panelId] of panels.entries()) {
    delete window[`handleKpsPanelClick_${panelId}`];
    delete window[`handleKpsPositionChange_${panelId}`];
    delete window[`handleKpsDelete_${panelId}`];
  }
});
```

**변경 후:**

```javascript
// ✨ 함수를 직접 전달
const elementId = dmn.ui.displayElement.add({
  onClick: async () => await handlePanelClick(panelId),
  onPositionChange: async (pos) => await handlePositionChange(panelId, pos),
  onDelete: async () => await handlePanelDelete(panelId),
});

// ✨ 클린업 간소화
dmn.plugin.registerCleanup(() => {
  dmn.ui.displayElement.clearMyElements(); // 핸들러도 자동으로 정리됨
});
```

## 🔄 하위 호환성

기존 문자열 방식도 계속 지원됩니다:

```javascript
// ✅ 여전히 작동함 (하지만 권장하지 않음)
window.handleMyClick = async () => {
  /* ... */
};

dmn.ui.displayElement.add({
  onClick: "handleMyClick", // 문자열 ID
});
```

## 📖 문서화

- **사용자 가이드**: `docs/custom-js-guide.md` - "Display Element 이벤트 핸들러" 섹션 추가
- **마이그레이션 가이드**: 이전 방식과 새로운 방식 비교
- **실전 예제**: KPS 패널 예제 포함

## 🎉 결론

이제 플러그인 개발자는:

- 전역 네임스페이스를 오염시키지 않고
- 이름 충돌 걱정 없이
- 자동 클린업의 혜택을 받으며
- 타입 안정성을 갖춘

**더 깔끔하고 안전한 코드**를 작성할 수 있습니다! 🚀

