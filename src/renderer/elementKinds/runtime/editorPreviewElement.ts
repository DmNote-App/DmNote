'use no memo';
// 프리뷰 오버레이(모듈 상태)를 버전으로 다시 읽어서 컴파일러 메모 제외
import { useSyncExternalStore } from 'react';

import { applyLocalOps } from '@src/renderer/editor/document/documentLocalOps';
import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import {
  getPreviewOverlayVersion,
  previewPatchOf,
  subscribePreviewOverlay,
} from '@src/renderer/editor/runtime/gesture/previewOverlay';
import type {
  GradientEditSession,
  GradientPreviewSurface,
} from '@stores/grid/useGradientEditStore';
import { isEditorElementType } from '@src/types/editor';
import { PREVIEW_DOMAIN_BY_ELEMENT_TYPE } from '@src/types/preview';
import { legacyPatchOps } from './legacyPosition';
import type { ElementBundles } from './renderTypes';

// 같은 요소·같은 미리보기면 같은 객체 - 얼굴의 메모가 참조로 비교한다
const cache = new WeakMap<
  ElementNode,
  Map<string, { version: number; result: ElementNode }>
>();

/** 편집 화면 - 옛 패널 미리보기(옛 칸 패치)를 트리 값·묶음·공통 정보에 얹은 요소.
 * 그리기를 한 벌로 옮긴 종류가 쓴다 (옛 패널이 선언 패널로 옮기면 미리보기가 트리 모양이 되어 걷는다) */
export const editorPreviewElementOf = (
  element: ElementNode,
  sceneId: string,
): ElementNode => {
  if (!isEditorElementType(element.kind)) return element;
  const version = getPreviewOverlayVersion();
  let byScene = cache.get(element);
  const cached = byScene?.get(sceneId);
  if (cached?.version === version) return cached.result;
  const patch = previewPatchOf(
    PREVIEW_DOMAIN_BY_ELEMENT_TYPE[element.kind],
    sceneId,
    element.id,
  );
  let result = element;
  if (patch) {
    // 옛 칸 → 트리 연산 대응과 낙관 적용을 그대로 쓴다 (둘 다 백엔드와 같게 고정돼 있다)
    const { ops } = legacyPatchOps(sceneId, element, patch);
    const [shown] =
      applyLocalOps(
        {
          formatVersion: 1,
          kindVersions: {},
          scenes: { [sceneId]: { nodes: [element] } },
        },
        ops,
      ).scenes[sceneId]?.nodes ?? [];
    if (shown?.type === 'element') result = shown;
  }
  if (!byScene) {
    byScene = new Map();
    cache.set(element, byScene);
  }
  byScene.set(sceneId, { version, result });
  return result;
};

/** editorPreviewElementOf 구독 - 이 요소의 미리보기가 바뀔 때만 다시 그린다 */
export const useEditorPreviewElement = (
  element: ElementNode,
  sceneId: string,
): ElementNode =>
  useSyncExternalStore(subscribePreviewOverlay, () =>
    editorPreviewElementOf(element, sceneId),
  );

// 그라데이션 편집 세션이 덮는 묶음 칸 - [묶음, 대기 칸, 입력 칸]
const SESSION_FIELDS: Partial<
  Record<GradientPreviewSurface, readonly [string, string, string]>
> = {
  background: ['surface', 'backgroundGradient', 'activeBackgroundGradient'],
  border: ['surface', 'borderGradient', 'activeBorderGradient'],
  font: ['font', 'fontGradient', 'activeFontGradient'],
};

/** 편집 화면 - 그라데이션 편집 세션이 편집 중인 표면을 세션 spec으로 일시 페인트한다 (저장·기록을 거치지 않는다) */
export const withGradientSession = (
  bundles: ElementBundles,
  session: GradientEditSession | null,
): ElementBundles => {
  const target = session && SESSION_FIELDS[session.surface];
  if (!target) return bundles;
  const [bundle, idle, active] = target;
  const current = bundles[bundle];
  return {
    ...bundles,
    [bundle]: {
      ...(current && typeof current === 'object' ? current : {}),
      [session.stateMode === 'active' ? active : idle]: session.spec,
    },
  };
};
