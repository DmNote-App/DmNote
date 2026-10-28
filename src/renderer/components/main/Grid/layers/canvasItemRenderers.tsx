import type { ReactElement } from 'react';
import DraggableKey from '@components/shared/key/Key';
import GraphItem from './GraphItem';
import KnobItem from './KnobItem';
import SpriteItem from './SpriteItem';
import type { GridElementInteractionProps } from '@hooks/Grid/useGridElementInteraction';
import { getLooseStatTypeLabel } from '@utils/grid/statTypeLabel';
import type { CanonicalPositionOf, ItemElementType } from '@src/types/editor';

// 캔버스 아이템 공통 props - 선택·도구·뷰포트·상호작용 핸들러
export type CanvasItemCommonProps = GridElementInteractionProps & {
  zIndex?: number;
};

type CanvasItemRenderer<K extends ItemElementType> = (
  key: string,
  common: CanvasItemCommonProps,
  position: CanonicalPositionOf<K>,
) => ReactElement;

// 키 외 종류별 편집 캔버스 아이템. 키는 매핑·범위 선택이 결합돼
// NativeGridElements가 직접 그린다
const CANVAS_ITEM_RENDERERS: {
  [K in ItemElementType]: CanvasItemRenderer<K>;
} = {
  stat: (key, common, position) => (
    <DraggableKey
      key={key}
      {...common}
      anchorKind="stat"
      position={position}
      keyName={getLooseStatTypeLabel(position.statType)}
      counterEnabled={true}
      counterPreviewValue={0}
    />
  ),
  graph: (key, common, position) => (
    <GraphItem key={key} {...common} position={position} />
  ),
  knob: (key, common, position) => (
    <KnobItem key={key} {...common} position={position} />
  ),
  sprite: (key, common, position) => (
    <SpriteItem key={key} {...common} position={position} />
  ),
};

export const renderCanvasItem = <K extends ItemElementType>(
  type: K,
  position: CanonicalPositionOf<K>,
  common: CanvasItemCommonProps,
): ReactElement =>
  (CANVAS_ITEM_RENDERERS[type] as CanvasItemRenderer<K>)(
    position.id,
    common,
    position,
  );
