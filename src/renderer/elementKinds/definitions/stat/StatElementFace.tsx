import { useInPanelSelection } from '@components/main/Grid/document/treeEditedSelection';
import StatItem from '@components/overlay/counters/StatItem';
import KeyFaceView, {
  type KeyFacePosition,
} from '@components/shared/key/KeyFaceView';
import { bundleFieldViewOf } from '@src/renderer/elementKinds/runtime/bundleFieldView';
import type { ElementRenderProps } from '@src/renderer/elementKinds/runtime/renderTypes';
import { useKeyStore } from '@stores/data/useKeyStore';
import type { StatItemType } from '@src/types/key/statItems';
import {
  getLooseStatTypeLabel,
  getStatTypeLabel,
} from '@utils/grid/statTypeLabel';

// 스탯 그리기 - 오버레이·OBS는 수치 신호로(StatItem), 편집 화면은 편집 미리보기로 그린다(KeyFaceView).
// 바깥 카운터는 창마다 카운터 층이 트리 틀을 따라 그린다

type StatFaceProps = ElementRenderProps<Record<string, unknown>>;
type StatView = KeyFacePosition & {
  statType?: StatItemType | null;
  displayText?: string | null;
};

const PreviewStat = ({ element }: StatFaceProps) => {
  const mode = useKeyStore((state) => state.selectedKeyType);
  // 일괄 미리보기(그라데이션·상태)는 패널이 편집하는 선택에 든 요소만
  const inPanelSelection = useInPanelSelection(mode, element.id);
  const position = bundleFieldViewOf(element) as StatView;
  return (
    <KeyFaceView
      anchorKind="stat"
      elementId={element.id}
      // 축 핸들 원점은 요소의 틀, 클래스는 상태 속성과 같은 노드에 (옛 스탯과 같다)
      position={position}
      keyName={getLooseStatTypeLabel(position.statType)}
      isSelected={inPanelSelection}
      counterEnabled={true}
      counterPreviewValue={0}
      placement={{ dx: 0, dy: 0, zIndex: 0 }}
    />
  );
};

const StatElementFace = (props: StatFaceProps) => {
  if (!props.live) return <PreviewStat {...props} />;
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
