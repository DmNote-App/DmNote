'use no memo';
// 편집 미리보기(모듈 상태)를 렌더 중에 읽어서 컴파일러 메모 제외
// 일괄 패널이 고른 요소들 - 선언 일괄 패널과 여럿을 받는 섹션(스탯 종류·키 매핑 등)이 같이 읽는다
import { useSyncExternalStore } from 'react';

import { useElementDocumentScene } from '@src/renderer/editor/document/elementDocumentRuntime';
import {
  sceneElements,
  type ElementNode,
} from '@src/renderer/editor/document/documentPatch';
import {
  getPreviewOverlayVersion,
  subscribePreviewOverlay,
} from '@src/renderer/editor/runtime/gesture/previewOverlay';
import { viewFieldsOf } from '@src/renderer/elementKinds/runtime/viewFields';
import type { Scene } from '@src/types/generated/elementDocument';
import type { Values } from './documentPanelModel';
import { batchPanelWriterFor, type PanelWriter } from './documentPanelWriter';

export interface PanelElements {
  scene: Scene | undefined;
  elements: ElementNode[];
  // 옛 종류만 고른 선택의 옛 일괄 처리기 (아니면 없음 - 트리 연산)
  writer: PanelWriter | null;
  // 칸 값 - 트리 칸 보기(고유 값·묶음 칸·틀)에 편집 미리보기를 얹은 값
  items: Values[];
}

// 고른 요소들 - 편집 미리보기가 바뀌면 다시 읽는다
export const usePanelElements = (
  sceneId: string,
  elementIds: readonly string[],
): PanelElements => {
  const scene = useElementDocumentScene(sceneId);
  useSyncExternalStore(
    subscribePreviewOverlay,
    getPreviewOverlayVersion,
    getPreviewOverlayVersion,
  );
  const all = scene ? sceneElements(scene) : [];
  const elements = elementIds.flatMap((id) => {
    const element = all.find((node) => node.id === id);
    return element ? [element] : [];
  });
  const writer = batchPanelWriterFor(sceneId, elements);
  return {
    scene,
    elements,
    writer,
    items: elements.map((element) => viewFieldsOf(element, sceneId) as Values),
  };
};
