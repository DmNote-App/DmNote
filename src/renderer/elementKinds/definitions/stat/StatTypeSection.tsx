import React from 'react';

import Dropdown from '@components/main/common/dropdown/Dropdown';
import { PropertyRow } from '@components/main/Grid/PropertiesPanel/controls/PropertyInputs';
import { singleSelectionHandlers } from '@components/main/Grid/PropertiesPanel/selection/singleSelectionHandlers';
import SingleMappingSection from '@components/main/Grid/PropertiesPanel/single/SingleMappingSection';
import { usePanelElements } from '@components/main/Grid/PropertiesPanel/document/usePanelElements';
import { reportElementOpError } from '@src/renderer/editor/runtime/intent/elementIntent';
import { patchElementPropertyByTargets } from '@src/renderer/editor/runtime/operations/elementPropertyCore';
import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import { useDocumentElement } from '@src/renderer/editor/document/elementDocumentRuntime';
import {
  STAT_BASE_OPTIONS,
  STAT_KPS_OPTIONS,
  type StatItemType,
} from '@src/types/key/statItems';
import type { PanelSectionProps } from '../../defineElementKind';
import { useViewFields } from '../../runtime/viewFields';

/** 스탯 종류 - 기본(KPS·누적)과 KPS 종류 두 칸. 옛 스탯 패널의 매핑 자리 그대로 (여럿이면 고른 스탯 모두에) */
const StatTypeSection = ({ sceneId, elementIds, t }: PanelSectionProps) => {
  const element = useDocumentElement(sceneId, elementIds[0] ?? '');
  if (elementIds.length > 1) {
    return (
      <StatTypeBatchRows sceneId={sceneId} elementIds={elementIds} t={t} />
    );
  }
  return element ? (
    <StatTypeRows sceneId={sceneId} element={element} t={t} />
  ) : null;
};

const baseOf = (statType: StatItemType) =>
  statType === 'total' ? 'total' : 'kps';

const commitStatType = (ids: readonly string[], statType: StatItemType) => {
  if (ids.length === 0) return;
  void patchElementPropertyByTargets(
    ids.map((id) => ({ elementType: 'stat' as const, id })),
    { property: 'statType', value: statType },
  ).catch(reportElementOpError);
};

// 여럿 - 값이 다르면 Mixed. 기본을 KPS로 바꾸면 누적 스탯만 KPS로, KPS 종류는 KPS 기준 스탯끼리
const StatTypeBatchRows = ({
  sceneId,
  elementIds,
  t,
}: Pick<PanelSectionProps, 'sceneId' | 'elementIds' | 't'>) => {
  // 옛 패널이 보던 값 - 트리 값 + 편집 미리보기
  const { elements, items } = usePanelElements(sceneId, elementIds);
  const stats = elements.map((element, index) => ({
    id: element.id,
    statType: ((items[index]?.statType as StatItemType) ||
      'kps') as StatItemType,
  }));
  if (stats.length === 0) return null;
  const bases = new Set(stats.map(({ statType }) => baseOf(statType)));
  const kpsStats = stats.filter(({ statType }) => baseOf(statType) === 'kps');
  const kpsTypes = new Set(kpsStats.map(({ statType }) => statType));
  return (
    <SingleMappingSection
      keyIndex={0}
      mappingControlLayout={
        <>
          <PropertyRow label={t('propertiesPanel.statType') || 'Stat Type'}>
            <Dropdown
              commitStrategy="after-paint"
              options={STAT_BASE_OPTIONS}
              value={bases.size === 1 ? [...bases][0] : undefined}
              placeholder={bases.size === 1 ? undefined : 'Mixed'}
              onChange={(value) =>
                value === 'total'
                  ? commitStatType(
                      stats
                        .filter(({ statType }) => statType !== 'total')
                        .map(({ id }) => id),
                      'total',
                    )
                  : commitStatType(
                      stats
                        .filter(({ statType }) => statType === 'total')
                        .map(({ id }) => id),
                      'kps',
                    )
              }
            />
          </PropertyRow>
          {kpsStats.length > 0 ? (
            <PropertyRow label={t('propertiesPanel.statKpsType') || 'KPS Type'}>
              <Dropdown
                commitStrategy="after-paint"
                options={STAT_KPS_OPTIONS}
                value={kpsTypes.size === 1 ? [...kpsTypes][0] : undefined}
                placeholder={kpsTypes.size === 1 ? undefined : 'Mixed'}
                onChange={(value) =>
                  commitStatType(
                    kpsStats.map(({ id }) => id),
                    value as StatItemType,
                  )
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

const StatTypeRows = ({
  sceneId,
  element,
  t,
}: Pick<PanelSectionProps, 'sceneId' | 't'> & { element: ElementNode }) => {
  // 옛 패널이 보던 값 - 트리 값 + 편집 미리보기
  const position = useViewFields(element, sceneId);
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
