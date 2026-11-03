import StatItem from '@components/overlay/counters/StatItem';
import type { KeyElementPosition } from '@hooks/overlay/useKeyElementStyles';
import { bundleFieldViewOf } from '@src/renderer/elementKinds/runtime/bundleFieldView';
import { renderPreviewFace } from '@src/renderer/elementKinds/runtime/previewFaces';
import type { ElementRenderProps } from '@src/renderer/elementKinds/runtime/renderTypes';
import type { StatItemType } from '@src/types/key/statItems';
import { getStatTypeLabel } from '@utils/grid/statTypeLabel';

// 스탯 그리기 - 오버레이·OBS는 수치 신호로(StatItem), 편집 화면은 편집 미리보기로 그린다(StatPreview -
// 편집 창만 등록해 오버레이 번들에 편집 코드가 따라오지 않는다).
// 바깥 카운터는 창마다 카운터 층이 트리 틀을 따라 그린다

type StatFaceProps = ElementRenderProps<Record<string, unknown>>;
type StatView = KeyElementPosition & {
  statType?: StatItemType | null;
  displayText?: string | null;
};

const StatElementFace = (props: StatFaceProps) => {
  if (!props.live) return renderPreviewFace(props);
  const position = bundleFieldViewOf(
    props.element,
    props.placement,
  ) as StatView;
  const statType = position.statType ?? 'kps';
  // 표시 글자가 비면 수치 종류 이름
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

export default StatElementFace;
