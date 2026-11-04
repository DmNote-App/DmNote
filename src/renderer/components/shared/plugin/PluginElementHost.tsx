import React, { type ComponentType } from 'react';
import { usePluginDisplayElementStore } from '@stores/plugin/usePluginDisplayElementStore';
import type { EditablePluginElementProps } from './EditablePluginElement';

// 창에 맞는 요소 - 편집 화면은 편집 가능한 요소, 오버레이·OBS는 그리기만.
// 오버레이 번들에 편집 코드가 들지 않게 고르는 쪽(Grid·OverlayScene)이 넘긴다
export type PluginElementComponent = ComponentType<EditablePluginElementProps>;

interface PluginElementHostProps
  extends Omit<EditablePluginElementProps, 'element'> {
  fullId: string;
  ElementComponent: PluginElementComponent;
}

/**
 * fullId로 자기 요소 하나만 구독하는 얇은 래퍼.
 * 리스트 렌더러가 elements 배열 전체를 구독하지 않아도 되게 하며,
 * 다른 요소의 갱신은 이 컴포넌트를 리렌더하지 않는다
 * (updateElement가 미변경 요소의 참조를 보존하므로 Object.is 비교로 차단됨)
 */
const PluginElementHost = ({
  fullId,
  ElementComponent,
  ...rest
}: PluginElementHostProps) => {
  const element = usePluginDisplayElementStore((state) =>
    state.elements.find((el) => el.fullId === fullId),
  );

  // 제거 직후 렌더 목록 갱신 전의 과도기 방어
  if (!element) return null;

  return <ElementComponent element={element} {...rest} />;
};

export default PluginElementHost;
