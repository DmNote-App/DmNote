import StatItem from './StatItem';
import { getStatTypeLabel } from '@utils/grid/statTypeLabel';
import type { KeyElementPosition } from '@hooks/overlay/useKeyElementStyles';
import type { StatItemType } from '@src/types/key/statItems';

interface OverlayStatItemProps {
  position: KeyElementPosition & {
    statType?: StatItemType | null;
    displayText?: string | null;
  };
}

// 오버레이 스탯 - 표시 글자가 비면 수치 종류 이름 (옛 배열·트리 그리기가 같이 쓴다)
const OverlayStatItem = ({ position }: OverlayStatItemProps) => {
  const statType = position.statType ?? 'kps';
  const label =
    (position.displayText || '').trim() || getStatTypeLabel(statType);
  return (
    <StatItem
      statType={statType}
      label={label}
      position={position}
      counterEnabled={true}
    />
  );
};

export default OverlayStatItem;
