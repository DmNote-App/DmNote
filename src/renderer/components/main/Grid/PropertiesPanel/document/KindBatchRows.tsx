'use no memo';
// 편집 미리보기(모듈 상태)를 렌더 중에 읽어서 컴파일러 메모 제외
import React, { Fragment } from 'react';

import type { PanelSectionDecl } from '@src/renderer/elementKinds/defineElementKind';
import { elementKindDefinition } from '@src/renderer/elementKinds/runtime/elementKindRegistry';
import { PropertySection } from '../controls/PropertyInputs';
import { batchRowRenderer } from './documentBatchRows';
import { visibleRows, type Translate, type Values } from './documentPanelModel';
import { usePanelElements } from './usePanelElements';

interface KindBatchRowsProps {
  sceneId: string;
  // 같은 종류 요소들
  elementIds: readonly string[];
  // 그 종류의 칸 묶음 섹션 하나
  section: Extract<PanelSectionDecl<Values>, { rows: unknown }>;
  panelElement: HTMLElement | null;
  t: Translate;
}

/** 한 종류의 칸 묶음 섹션 - 여러 종류를 고른 일괄 패널에서 그 종류 요소만 고친다 (보일 칸이 없으면 섹션도 없다) */
const KindBatchRows = ({
  sceneId,
  elementIds,
  section,
  panelElement,
  t,
}: KindBatchRowsProps) => {
  const { elements, writer, items } = usePanelElements(sceneId, elementIds);
  if (elements.length === 0) return null;
  const rows = visibleRows(section.rows, items, true);
  if (rows.length === 0) return null;
  const render = batchRowRenderer({
    sceneId,
    elements,
    items,
    definition: elementKindDefinition(elements[0].kind),
    writer,
    panelElement,
    t,
  });
  return (
    <PropertySection>
      {rows.map((row) => (
        <Fragment key={row.field}>{render(row)}</Fragment>
      ))}
    </PropertySection>
  );
};

export default KindBatchRows;
