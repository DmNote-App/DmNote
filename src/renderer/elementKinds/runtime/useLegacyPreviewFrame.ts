'use no memo';
// 프리뷰 오버레이(모듈 상태)를 previewVersion으로 다시 읽어야 해서 컴파일러 메모 제외
import { useSyncExternalStore } from 'react';

import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import { readAuthorityPositions } from '@src/renderer/editor/model/elementStores';
import {
  composePreviewPositions,
  getPreviewOverlayVersion,
  subscribePreviewOverlay,
} from '@src/renderer/editor/runtime/gesture/previewOverlay';
import { isEditorElementType } from '@src/types/editor';
import { TREE_EDITED_KINDS } from '@src/types/elementKinds';
import type { Frame } from '@src/types/generated/elementDocument';
import { PREVIEW_DOMAIN_BY_ELEMENT_TYPE } from '@src/types/preview';

const noSubscribe = () => () => {};
const noVersion = () => 0;

/** 트리로 옮긴 옛 종류 - 옛 패널 미리보기(편집 제스처)의 위치·크기·회전을 감싸는 상자에도 얹는다.
 * Escape 취소도 같은 제스처라 함께 걷힌다 */
export const useLegacyPreviewFrame = (
  element: ElementNode | undefined,
  sceneId: string,
): Frame | null => {
  const treeEdited =
    !!element &&
    isEditorElementType(element.kind) &&
    TREE_EDITED_KINDS.has(element.kind);
  useSyncExternalStore(
    treeEdited ? subscribePreviewOverlay : noSubscribe,
    treeEdited ? getPreviewOverlayVersion : noVersion,
  );
  if (!treeEdited || !element || !isEditorElementType(element.kind)) {
    return null;
  }
  const positions = readAuthorityPositions(element.kind) as unknown as Record<
    string,
    Array<Record<string, unknown> & { id: string }>
  >;
  const base = positions[sceneId]?.find(({ id }) => id === element.id);
  const composed = composePreviewPositions(
    PREVIEW_DOMAIN_BY_ELEMENT_TYPE[element.kind],
    positions,
  )[sceneId]?.find(({ id }) => id === element.id);
  if (!base || !composed || composed === base) return null;
  const changed = (field: string) =>
    typeof composed[field] === 'number' && composed[field] !== base[field]
      ? (composed[field] as number)
      : undefined;
  const x = changed('dx');
  const y = changed('dy');
  const width = changed('width');
  const height = changed('height');
  const rotation = changed('rotation');
  if ([x, y, width, height, rotation].every((value) => value === undefined)) {
    return null;
  }
  return {
    x: x ?? element.frame.x,
    y: y ?? element.frame.y,
    width: width ?? element.frame.width,
    height: height ?? element.frame.height,
    rotation: rotation ?? element.frame.rotation,
  };
};
