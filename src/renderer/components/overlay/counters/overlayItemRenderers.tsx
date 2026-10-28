import type { ReactElement } from 'react';
import StatItem from './StatItem';
import OverlayGraphItem from './OverlayGraphItem';
import OverlayKnobItem from './OverlayKnobItem';
import OverlaySpriteItem from './OverlaySpriteItem';
import { resolveZIndexFallback } from '@utils/element/zIndexFallback';
import type { CanonicalPositionOf, ItemElementType } from '@src/types/editor';

export interface OverlayItemContext {
  // 스프라이트 트리거(키 요소 id) -> canonical 키 문자열
  spriteKeyCanonicalMap: ReadonlyMap<string, string>;
}

type OverlayItemRenderer<K extends ItemElementType> = (
  position: CanonicalPositionOf<K>,
  index: number,
  context: OverlayItemContext,
) => ReactElement;

const STAT_DEFAULT_LABELS: Record<string, string> = {
  kpsAvg: 'AVG',
  kpsMax: 'MAX',
  total: 'Total',
};

// 키 외 종류별 오버레이 아이템. 키는 노트·카운터 레이어와 결합돼 OverlayScene이 직접 그린다
const OVERLAY_ITEM_RENDERERS: {
  [K in ItemElementType]: OverlayItemRenderer<K>;
} = {
  stat: (pos, index) => {
    const statType = pos.statType ?? 'kps';
    const defaultLabel = STAT_DEFAULT_LABELS[statType] ?? 'KPS';
    const label = (pos.displayText || '').trim() || defaultLabel;
    return (
      <StatItem
        key={pos.id}
        statType={statType}
        label={label}
        position={{ ...pos, zIndex: pos.zIndex ?? index }}
        counterEnabled={true}
      />
    );
  },
  graph: (pos, index) => (
    <OverlayGraphItem
      key={pos.id}
      index={index}
      position={{ ...pos, zIndex: pos.zIndex ?? index }}
    />
  ),
  knob: (pos, index) => (
    <OverlayKnobItem
      key={pos.id}
      index={index}
      position={{ ...pos, zIndex: pos.zIndex ?? index }}
    />
  ),
  // 전개 금지 - 원본 identity를 보존해야 잎의 React.memo가 유지된다
  sprite: (pos, index, context) => (
    <OverlaySpriteItem
      key={pos.id}
      position={resolveZIndexFallback(pos, index)}
      keyCanonicalMap={context.spriteKeyCanonicalMap}
    />
  ),
};

export const renderOverlayItem = <K extends ItemElementType>(
  type: K,
  position: CanonicalPositionOf<K>,
  index: number,
  context: OverlayItemContext,
): ReactElement =>
  (OVERLAY_ITEM_RENDERERS[type] as OverlayItemRenderer<K>)(
    position,
    index,
    context,
  );
