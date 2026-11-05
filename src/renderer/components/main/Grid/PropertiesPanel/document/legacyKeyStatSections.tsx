import React, { useRef, useState } from 'react';

import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import { isNativeElementId } from '@src/renderer/editor/model/elementId';
import {
  keySlotInfoOf,
  keySlotOf,
} from '@src/renderer/elementKinds/definitions/key/keySlotInfo';
import { panelFieldViewOf } from '@src/renderer/elementKinds/runtime/fieldView';
import type { KeyPosition } from '@src/types/key/keys';
import type { StatItemType } from '@src/types/key/statItems';
import type { KeyInfo } from '@utils/input/KeyMaps';
import { getStatTypeLabel } from '@utils/grid/statTypeLabel';
import { singleSelectionHandlers } from '../selection/singleSelectionHandlers';
import CounterTabContent from '../single/CounterTabContent';
import NoteTabContent from '../single/NoteTabContent';
import SingleGeometrySection from '../single/SingleGeometrySection';
import StyleTabContent from '../single/StyleTabContent';
import type { KeyStatKind, Translate } from './documentPanelModel';

// 옛 키·스탯 단일 패널의 탭 내용 - 선언 패널의 섹션 자리에 옛 부품을 그대로 그린다. 값은 옛 패널이 보던
// 옛 칸 모양 보기(트리 값 + 편집 미리보기)를 읽고, 쓰기는 옛 키·스탯 패널과 같은 단일 처리기로 한다

interface KeyStatSectionProps {
  element: ElementNode;
  // 옛 패널이 보던 값 - 트리 값 + 편집 미리보기 (옛 칸 모양)
  position: KeyPosition;
  panelElement: HTMLElement | null;
  t: Translate;
}

// 옛 키·스탯 부품의 t 모양 - 속성 패널이 넘기는 번역은 늘 글자를 돌려준다
const legacyT = (t: Translate) => t as (key: string) => string;

/** 패널 제목·카운터 이름에 쓰는 이름 - 키는 슬롯, 스탯은 수치 종류 */
const keyInfoOf = (
  element: ElementNode,
  position: KeyPosition,
): KeyInfo | null => {
  if (element.kind === 'key') return keySlotInfoOf(keySlotOf(element));
  const statTitle = getStatTypeLabel(
    ((position as { statType?: StatItemType }).statType ??
      'kps') as StatItemType,
  );
  return {
    browserKey: statTitle,
    globalKey: statTitle,
    displayName: statTitle,
  };
};

/** 위치·크기 - 옛 키·스탯 패널처럼 고친 값을 패널에 먼저 둔다 (바탕 값이 바뀌면 바탕 값으로) */
export const KeyStatGeometry = ({
  element,
  position,
  t,
}: Omit<KeyStatSectionProps, 'panelElement'>) => {
  const kind = element.kind as KeyStatKind;
  const handlers = singleSelectionHandlers;
  const settled = (source: KeyPosition) => ({
    source,
    dx: source.dx,
    dy: source.dy,
    width: source.width || 60,
    height: source.height || 60,
  });
  const [local, setLocal] = useState(() => settled(position));
  if (local.source !== position) setLocal(settled(position));
  const previewStyle = handlers.stableStylePropertyPreviewHandler(
    kind,
    element.id,
  );
  const commitStyle = handlers.stableStylePropertyCommitHandler(
    kind,
    element.id,
    { settleGesture: true },
  );
  const setField =
    (field: 'dx' | 'dy' | 'width' | 'height') => (value: number) =>
      setLocal((prev) => ({ ...prev, [field]: value }));
  return (
    <SingleGeometrySection
      keyPosition={position}
      localDx={local.dx}
      localDy={local.dy}
      localWidth={local.width}
      localHeight={local.height}
      onLocalDxChange={setField('dx')}
      onLocalDyChange={setField('dy')}
      onLocalWidthChange={setField('width')}
      onLocalHeightChange={setField('height')}
      onGeometryPreview={handlers.stableGeometryPreviewHandler(
        kind,
        element.id,
      )}
      onGeometryCommit={handlers.stableGeometryHandler(kind, element.id)}
      onRotationPreview={
        previewStyle
          ? (value) => previewStyle({ property: 'rotation', value })
          : undefined
      }
      onRotationCommit={
        commitStyle
          ? (value) => commitStyle({ property: 'rotation', value })
          : undefined
      }
      t={legacyT(t)}
    />
  );
};

/** 스타일 탭 겉모습 - 표면·글자·사용자 CSS·사운드·이미지 (옛 스타일 탭에서 키 매핑·위치를 뺀 부분) */
export const KeyStatStyle = ({
  element,
  position,
  panelElement,
  useCustomCSS,
  t,
}: KeyStatSectionProps & { useCustomCSS: boolean }) => {
  const kind = element.kind as KeyStatKind;
  const { id } = element;
  const isKey = kind === 'key';
  const handlers = singleSelectionHandlers;
  const [showImagePicker, setShowImagePicker] = useState(false);
  const imageButtonRef = useRef<HTMLButtonElement>(null);
  return (
    <StyleTabContent
      keyPosition={position}
      keyInfo={keyInfoOf(element, position)}
      canvasAnchor={
        position.id && isNativeElementId(position.id)
          ? { kind, id: position.id }
          : undefined
      }
      onElementPropertyCommit={handlers.stableElementPropertyCommitHandler(
        kind,
        id,
      )}
      showSoundControls={isKey}
      shadowActiveState={isKey}
      showImagePicker={showImagePicker}
      onToggleImagePicker={() => setShowImagePicker(!showImagePicker)}
      onInactiveImageCommit={handlers.stableInactiveImageHandler(kind, id)}
      onActiveImageCommit={
        isKey ? handlers.stableActiveImageHandler('key', id) : undefined
      }
      onIdleTransparentCommit={handlers.stableIdleTransparentHandler(kind, id)}
      onActiveTransparentCommit={
        isKey ? handlers.stableActiveTransparentHandler('key', id) : undefined
      }
      onIdleImageFitCommit={handlers.stableIdleImageFitHandler(kind, id)}
      onActiveImageFitCommit={
        isKey ? handlers.stableActiveImageFitHandler('key', id) : undefined
      }
      onSoundPathCommit={
        isKey ? handlers.stableSoundPathHandler(id) : undefined
      }
      onSoundEnabledCommit={
        isKey ? handlers.stableSoundEnabledHandler(id) : undefined
      }
      onSoundVolumeCommit={
        isKey ? handlers.stableSoundVolumeHandler(id) : undefined
      }
      onStylePropertyPreview={handlers.stableStylePropertyPreviewHandler(
        kind,
        id,
      )}
      onStylePropertyCommit={handlers.stableStylePropertyCommitHandler(
        kind,
        id,
        { settleGesture: true },
      )}
      onPaintPreview={handlers.stablePaintPreviewHandler(kind, id)}
      onPaintCommit={handlers.stablePaintCommitHandler(kind, id)}
      onShadowCommit={handlers.stableShadowCommitHandler(kind, id)}
      imageButtonRef={imageButtonRef}
      panelElement={panelElement}
      useCustomCSS={useCustomCSS}
      t={legacyT(t)}
    />
  );
};

/** 노트 탭 (키) - Esc 되돌리기 기준은 미리보기 없는 지금 값 */
export const KeyNoteTab = ({
  element,
  position,
  panelElement,
  t,
}: KeyStatSectionProps) => {
  const { id } = element;
  const handlers = singleSelectionHandlers;
  return (
    <NoteTabContent
      keyPosition={position}
      canonicalKeyPosition={panelFieldViewOf(element) as unknown as KeyPosition}
      onElementPropertyCommit={handlers.stableElementPropertyCommitHandler(
        'key',
        id,
      )}
      onStylePropertyPreview={handlers.stableStylePropertyPreviewHandler(
        'key',
        id,
      )}
      onStylePropertyCommit={handlers.stableStylePropertyCommitHandler(
        'key',
        id,
        { settleGesture: true },
      )}
      onNotePaintPreview={handlers.stableNotePaintPreviewHandler(id)}
      onNotePaintCommit={handlers.stableNotePaintCommitHandler(id)}
      panelElement={panelElement}
      t={legacyT(t)}
    />
  );
};

/** 카운터 탭 (키·스탯) */
export const KeyStatCounterTab = ({
  element,
  position,
  panelElement,
  t,
}: KeyStatSectionProps) => {
  const kind = element.kind as KeyStatKind;
  const { id } = element;
  const handlers = singleSelectionHandlers;
  return (
    <CounterTabContent
      keyPosition={position}
      keyDisplayName={keyInfoOf(element, position)?.displayName}
      isStat={kind === 'stat'}
      onCounterEnabledCommit={handlers.stableCounterEnabledHandler(kind, id)}
      onCounterAnimationEnabledCommit={handlers.stableCounterAnimationEnabledHandler(
        kind,
        id,
      )}
      onCounterLayoutCommit={handlers.stableCounterLayoutHandler(kind, id)}
      onCounterTypographyCommit={handlers.stableCounterTypographyHandler(
        kind,
        id,
      )}
      onCounterFillCommit={handlers.stableCounterFillHandler(kind, id)}
      onCounterAnimationPresetCommit={handlers.stableCounterAnimationPresetHandler(
        kind,
        id,
      )}
      panelElement={panelElement}
      t={legacyT(t)}
    />
  );
};
