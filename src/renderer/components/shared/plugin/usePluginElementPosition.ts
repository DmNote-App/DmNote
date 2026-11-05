import { useSyncExternalStore } from 'react';
import type { PluginDisplayElementInternal } from '@src/types/plugin/api';
import { useKeyStore } from '@stores/data/useKeyStore';
import { useElementDocumentScene } from '@src/renderer/editor/document/elementDocumentRuntime';
import { keyAnchorPosition } from '@src/renderer/elementKinds/runtime/keyAnchorPosition';
import {
  getPreviewOverlayVersion,
  subscribePreviewOverlay,
} from '@src/renderer/editor/runtime/gesture/previewOverlay';
import { resolvePluginElementPosition } from '@utils/plugin/layout/pluginElementLayout';

/** 표시 위치 - 키에 붙은 요소는 트리의 그 키 위치(편집 미리보기 포함) + 앵커 오프셋, 아니면 자기 위치 (창 오프셋 더함) */
export const usePluginElementPosition = (
  element: Pick<PluginDisplayElementInternal, 'position' | 'anchor'>,
  positionOffset: { x: number; y: number },
) => {
  const selectedKeyType = useKeyStore((state) => state.selectedKeyType);
  const scene = useElementDocumentScene(selectedKeyType);
  const previewVersion = useSyncExternalStore(
    subscribePreviewOverlay,
    getPreviewOverlayVersion,
  );
  return resolvePluginElementPosition({
    element,
    keyPositionOf: (keyCode) =>
      keyAnchorPosition(scene, selectedKeyType, keyCode, previewVersion),
    positionOffset,
  });
};
