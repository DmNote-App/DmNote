import React, { useRef, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  PluginDisplayElementInternal,
  DisplayElementTemplateHelpers,
} from '@src/types/plugin/api';
import { usePluginDisplayElementStore } from '@stores/plugin/usePluginDisplayElementStore';
import { useTranslation } from '@contexts/useTranslation';
import { html, styleMap, css } from '@utils/plugin/components/templateEngine';
import { translatePluginMessage } from '@utils/plugin/pluginI18n';
import { usePluginElementMeasurementRuntime } from './usePluginElementMeasurementRuntime';
import { usePluginElementOverlayRuntime } from './usePluginElementOverlayRuntime';

// scoped 플러그인 shadow tree에 주입되는 커서 정책 스타일 식별자
const SHADOW_CURSOR_STYLE_ATTR = 'data-dmn-cursor-policy';

interface PluginElementViewInput {
  element: PluginDisplayElementInternal;
  windowType: 'main' | 'overlay';
  zoom: number;
}

/** 요소 내용 - 정의·번역·설정 변경 알림·shadow root·템플릿·측정·오버레이 런타임 (편집 화면·오버레이 공용) */
export const usePluginElementView = ({
  element,
  windowType,
  zoom,
}: PluginElementViewInput) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [shadowRoot, setShadowRoot] = useState<ShadowRoot | null>(null);
  const updateElement = usePluginDisplayElementStore(
    (state) => state.updateElement,
  );
  const updateElementBatched = usePluginDisplayElementStore(
    (state) => state.updateElementBatched,
  );
  const definitions = usePluginDisplayElementStore(
    (state) => state.definitions,
  );
  const definition = element.definitionId
    ? definitions.get(element.definitionId)
    : undefined;
  const { i18n, t } = useTranslation();
  const locale = i18n.language;
  const localeRef = useRef(locale);

  const pluginTranslate = (
    key: string,
    params?: Record<string, string | number>,
    fallback?: string,
  ) =>
    translatePluginMessage({
      messages: definition?.messages,
      locale,
      key,
      params,
      fallback,
    });

  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);

  const pluginTranslateStable = (
    key: string,
    params?: Record<string, string | number>,
    fallback?: string,
  ) =>
    translatePluginMessage({
      messages: definition?.messages,
      locale: localeRef.current,
      key,
      params,
      fallback,
    });

  // Settings 변경 감지용 ref와 콜백 리스트
  const prevSettingsRef = useRef<Record<string, unknown> | null>(null);
  const settingsChangeListenersRef = useRef<
    Set<
      (
        newSettings: Record<string, unknown>,
        oldSettings: Record<string, unknown>,
      ) => void
    >
  >(new Set());

  // Settings 변경 감지 (overlay에서만 - 리스너 콜백용)
  useEffect(() => {
    if (windowType !== 'overlay') return;

    const currentSettings = element.settings || {};
    const prevSettings = prevSettingsRef.current;

    // 최초 마운트 시에는 이전 설정 저장만
    if (prevSettings === null) {
      prevSettingsRef.current = { ...currentSettings };
      return;
    }

    // 설정이 실제로 변경되었는지 확인
    const hasChanged =
      JSON.stringify(currentSettings) !== JSON.stringify(prevSettings);

    if (hasChanged) {
      // 모든 리스너에게 변경 알림
      settingsChangeListenersRef.current.forEach((listener) => {
        try {
          listener(currentSettings, prevSettings);
        } catch (error) {
          console.error(
            '[PluginElement] onSettingsChange listener error:',
            error,
          );
        }
      });

      // 이전 설정 업데이트
      prevSettingsRef.current = { ...currentSettings };
    }
  }, [windowType, element.settings]);

  // Shadow DOM 설정 (scoped 옵션)
  useEffect(() => {
    if (element.scoped && containerRef.current && !shadowRoot) {
      try {
        // 이미 shadowRoot가 있는지 확인
        if (containerRef.current.shadowRoot) {
          setShadowRoot(containerRef.current.shadowRoot);
        } else {
          const root = containerRef.current.attachShadow({
            mode: 'open',
          });
          setShadowRoot(root);
        }
      } catch {
        console.warn(
          `[PluginElement] Shadow DOM already attached for ${element.fullId}`,
        );
      }
    }
  }, [element.scoped, element.fullId, shadowRoot]);

  // 메인 창 한정 shadow tree 커서 정책 주입
  // 문서 규칙(.dmn-grabbable *)은 shadow 경계를 못 넘으므로 내부에서 상속을 강제
  useEffect(() => {
    if (windowType !== 'main' || !shadowRoot) return;
    if (shadowRoot.querySelector(`style[${SHADOW_CURSOR_STYLE_ATTR}]`)) return;
    const style = document.createElement('style');
    style.setAttribute(SHADOW_CURSOR_STYLE_ATTR, '');
    style.textContent = '* { cursor: inherit !important; }';
    shadowRoot.prepend(style);
  }, [windowType, shadowRoot]);

  // 템플릿 렌더링 결과 계산
  const renderedContent = (() => {
    if (definition && definition.template) {
      const state = element.state || {};
      const settings = element.settings || {};

      const renderState =
        windowType === 'main' && definition.previewState
          ? { ...state, ...definition.previewState }
          : state;

      try {
        return definition.template(renderState, settings, {
          html: html as unknown as DisplayElementTemplateHelpers['html'],
          styleMap,
          css,
          locale,
          t: pluginTranslate,
        });
      } catch (error) {
        console.error(`[PluginElement] Template render error:`, error);
        return null;
      }
    }
    return null;
  })();

  usePluginElementMeasurementRuntime({
    containerRef,
    shadowRoot,
    renderedContent,
    element,
    definition,
    windowType,
    zoom,
    updateElement,
  });

  usePluginElementOverlayRuntime({
    windowType,
    definition,
    element,
    updateElement,
    updateElementBatched,
    localeRef,
    pluginTranslateStable,
    settingsChangeListenersRef,
  });

  // 문자열 템플릿(레거시) __html 래퍼를 값 기준으로 고정.
  // React 19는 {__html} 객체 identity가 바뀌면 내용이 같아도 innerHTML을 다시 설정해
  // 내부 노드를 전부 교체한다 - 프레스 중 재렌더(isDragging 등)가 클릭 대상 노드를
  // detach시켜 브라우저가 click 디스패치를 포기하고 선택 클릭이 유실되는 것을 차단
  const legacyHtml = renderedContent
    ? typeof renderedContent === 'string'
      ? renderedContent
      : null
    : element.html || null;
  const legacyHtmlProp = useMemo(
    () => (legacyHtml === null ? null : { __html: legacyHtml }),
    [legacyHtml],
  );

  // 렌더링 로직
  const renderContent = (): React.ReactNode => {
    if (renderedContent) {
      // 템플릿 결과가 문자열인 경우 (레거시)
      if (legacyHtmlProp) {
        return <div dangerouslySetInnerHTML={legacyHtmlProp} />;
      }
      // React Element인 경우 (DisplayElementTemplateResult -> ReactNode)
      return renderedContent as unknown as React.ReactNode;
    }

    // 템플릿이 없고 html 속성만 있는 경우 (레거시)
    if (legacyHtmlProp) {
      return <div dangerouslySetInnerHTML={legacyHtmlProp} />;
    }

    return null;
  };

  return {
    containerRef,
    definition,
    locale,
    t,
    content:
      element.scoped && shadowRoot
        ? createPortal(renderContent(), shadowRoot as unknown as Element)
        : renderContent(),
  };
};
