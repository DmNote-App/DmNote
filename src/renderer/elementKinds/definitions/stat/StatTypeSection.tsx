import React from 'react';

import Dropdown from '@components/main/common/dropdown/Dropdown';
import { PropertyRow } from '@components/main/Grid/PropertiesPanel/controls/PropertyInputs';
import { singleSelectionHandlers } from '@components/main/Grid/PropertiesPanel/selection/singleSelectionHandlers';
import SingleMappingSection from '@components/main/Grid/PropertiesPanel/single/SingleMappingSection';
import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import { useDocumentElement } from '@src/renderer/editor/document/elementDocumentRuntime';
import {
  STAT_BASE_OPTIONS,
  STAT_KPS_OPTIONS,
  type StatItemType,
} from '@src/types/key/statItems';
import type { PanelSectionProps } from '../../defineElementKind';
import { useTreeElementPosition } from '../../runtime/treeElementPosition';

/** 스탯 종류 - 기본(KPS·누적)과 KPS 종류 두 칸. 옛 스탯 패널의 매핑 자리 그대로 */
const StatTypeSection = ({ sceneId, elementIds, t }: PanelSectionProps) => {
  const element = useDocumentElement(sceneId, elementIds[0] ?? '');
  return element ? (
    <StatTypeRows sceneId={sceneId} element={element} t={t} />
  ) : null;
};

const StatTypeRows = ({
  sceneId,
  element,
  t,
}: Pick<PanelSectionProps, 'sceneId' | 't'> & { element: ElementNode }) => {
  // 옛 패널이 보던 값 - 트리 값 + 편집 미리보기
  const position = useTreeElementPosition(element, sceneId);
  const resolvedStatType = (position.statType as StatItemType) || 'kps';
  const statBaseValue = resolvedStatType === 'total' ? 'total' : 'kps';
  const commit = singleSelectionHandlers.stableElementPropertyCommitHandler(
    'stat',
    element.id,
  );
  return (
    <SingleMappingSection
      // 칸 배치를 통째로 넘겨 키 슬롯 순번은 쓰지 않는다
      keyIndex={0}
      mappingControlLayout={
        <>
          <PropertyRow label={t('propertiesPanel.statType') || 'Stat Type'}>
            <Dropdown
              commitStrategy="after-paint"
              options={STAT_BASE_OPTIONS}
              value={statBaseValue}
              onChange={(value) => {
                if (value === 'total') {
                  commit?.({ property: 'statType', value: 'total' });
                  return;
                }
                commit?.({
                  property: 'statType',
                  value:
                    resolvedStatType === 'total' ? 'kps' : resolvedStatType,
                });
              }}
            />
          </PropertyRow>
          {statBaseValue === 'kps' ? (
            <PropertyRow label={t('propertiesPanel.statKpsType') || 'KPS Type'}>
              <Dropdown
                commitStrategy="after-paint"
                options={STAT_KPS_OPTIONS}
                value={resolvedStatType}
                onChange={(value) =>
                  commit?.({
                    property: 'statType',
                    value: value as StatItemType,
                  })
                }
              />
            </PropertyRow>
          ) : null}
        </>
      }
      t={t as (key: string) => string}
    />
  );
};

export default StatTypeSection;
