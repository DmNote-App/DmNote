'use no memo';
// 프리뷰 오버레이(모듈 상태)를 렌더 중에 읽어서 컴파일러 메모 제외
// 키에 붙은 요소(플러그인 요소의 키 앵커)의 기준 위치 - 그 키 하나만 찾는다 (장면 전체 옛 모양 기록 없이)
import type { Node, Scene } from '@src/types/generated/elementDocument';
import { slotCanonical } from '@utils/keySlot';
import { keySlotOf } from '../definitions/key/keySlotInfo';
import { viewFieldsOf } from './viewFields';

/** 그 슬롯(정규형) 키의 보이는 위치 - 트리 순서로 첫 키, 편집 미리보기 포함. 없으면 null.
 * previewVersion은 React Compiler가 메모하는 파일에서 미리보기 판을 인자로 넘기는 자리(값은 안에서 읽는다) */
export const keyAnchorPosition = (
  scene: Scene | undefined,
  sceneId: string,
  keyCode: string,
  _previewVersion?: number,
): { x: number; y: number } | null => {
  const visit = (nodes: readonly Node[]): { x: number; y: number } | null => {
    for (const node of nodes) {
      if (node.type === 'group') {
        const found = visit(node.children);
        if (found) return found;
        continue;
      }
      const slot = node.kind === 'key' ? keySlotOf(node) : null;
      if (slot == null || slotCanonical(slot) !== keyCode) continue;
      const view = viewFieldsOf(node, sceneId);
      return { x: view.dx, y: view.dy };
    }
    return null;
  };
  return scene ? visit(scene.nodes) : null;
};
