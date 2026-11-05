'use no memo';
// 편집 미리보기(모듈 상태)를 렌더 중에 읽어서 컴파일러 메모 제외
// 일괄 패널의 칸 하나 - 선언 일괄 패널과 여러 종류를 고른 일괄 패널의 종류별 칸 묶음이 같이 쓴다
import React from 'react';

import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import type {
  ElementKindDefinition,
  PanelRowDecl,
} from '@src/renderer/elementKinds/defineElementKind';
import type { Op } from '@src/types/generated/elementDocument';
import { editDocument } from '../../document/documentEditActions';
import { rowState, type Translate, type Values } from './documentPanelModel';
import { FieldRow } from './documentPanelRows';
import { batchPanelWriterFor, type PanelWriter } from './documentPanelWriter';

interface BatchRowContext {
  sceneId: string;
  elements: readonly ElementNode[];
  items: readonly Values[];
  definition: ElementKindDefinition | undefined;
  writer: PanelWriter | null;
  panelElement: HTMLElement | null;
  t: Translate;
}

// 고유 값 칸 하나 (섞인 값) - 옛 종류는 옛 일괄 처리기, 트리에만 있는 종류는 트리 연산.
// 보일 조건이 있는 칸은 그 칸이 보이는 요소에만 쓴다 (섞인 값도 그 요소들로 - rowState)
export const batchRowRenderer =
  ({
    sceneId,
    elements: allElements,
    items,
    definition,
    writer: allWriter,
    panelElement,
    t,
  }: BatchRowContext) =>
  (row: PanelRowDecl<Values>) => {
    const owners = row.visible
      ? allElements.filter((_, index) => row.visible!(items[index]))
      : allElements;
    const elements = owners.length > 0 ? owners : allElements;
    const writer =
      allWriter && elements.length !== allElements.length
        ? batchPanelWriterFor(sceneId, elements)
        : allWriter;
    const commitValues = (next: Values) => {
      void Promise.all(
        elements.map(async (element) => {
          const merged = { ...(element.values ?? {}), ...next };
          const frame = await definition?.adjustFrame?.(
            merged as never,
            element.frame,
          );
          const ops: Op[] = [
            { op: 'setValues', scene: sceneId, id: element.id, values: next },
          ];
          if (frame) {
            ops.push({ op: 'setFrame', scene: sceneId, id: element.id, frame });
          }
          return ops;
        }),
      ).then((ops) => editDocument(ops.flat()));
    };
    return (
      <FieldRow
        row={row}
        state={rowState(definition, row, items)}
        batch
        onCommit={(value, options) =>
          writer
            ? writer.commitField(row.field, value, options)
            : commitValues({ [row.field]: value })
        }
        onPreview={
          writer ? (value) => writer.previewField(row.field, value) : undefined
        }
        onCancelPreview={writer?.cancelPreview}
        colorId={`${elements[0]?.kind}-${row.field}-batch-${sceneId}`}
        elementIds={elements.map(({ id }) => id)}
        panelElement={panelElement}
        t={t}
      />
    );
  };
