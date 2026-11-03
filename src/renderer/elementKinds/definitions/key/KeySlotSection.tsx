import React from 'react';

import SingleMappingSection from '@components/main/Grid/PropertiesPanel/single/SingleMappingSection';
import {
  useDocumentElement,
  useElementDocumentScene,
} from '@src/renderer/editor/document/elementDocumentRuntime';
import {
  reportElementOpError,
  reportElementOpSkipped,
} from '@src/renderer/editor/runtime/intent/elementIntent';
import { rebindKeySlotById } from '@src/renderer/editor/runtime/operations/keySlotOps';
import type { PanelSectionProps } from '../../defineElementKind';
import { treeModeArrays } from '../../runtime/treeModeArrays';
import { keySlotOf } from './keySlotInfo';

/** 키 매핑 - 입력 슬롯을 바꾼다 (트리 입력 연산 - 낙관 적용). 옛 키 패널의 매핑 섹션 그대로 */
const KeySlotSection = ({
  sceneId,
  elementIds,
  panelElement,
  t,
}: PanelSectionProps) => {
  const id = elementIds[0] ?? '';
  const element = useDocumentElement(sceneId, id);
  const scene = useElementDocumentScene(sceneId);
  // 슬롯 입력 방식(단일·개별·동시)은 키마다 - 옛 패널과 같은 트리 순번으로 가린다
  const keyIndex = treeModeArrays(scene).keyPositions.findIndex(
    (position) => position.id === id,
  );
  return (
    <SingleMappingSection
      keyIndex={keyIndex}
      keySlot={keySlotOf(element)}
      onKeyMappingChange={(_index, slot) =>
        void rebindKeySlotById(id, slot)
          .then((applied) => {
            if (!applied) {
              reportElementOpSkipped('key mapping target disappeared');
            }
          })
          .catch(reportElementOpError)
      }
      panelElement={panelElement}
      t={t as (key: string) => string}
    />
  );
};

export default KeySlotSection;
