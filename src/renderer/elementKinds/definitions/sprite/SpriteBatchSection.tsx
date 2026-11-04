import React, { useEffect, useRef } from 'react';
import { spriteItemsApi } from '@api/modules/editor/itemsApi';
import { usePanelElements } from '@components/main/Grid/PropertiesPanel/document/usePanelElements';
import {
  NumberInput,
  PropertyRow,
  PropertySection,
} from '@components/main/Grid/PropertiesPanel/controls/PropertyInputs';
import SpriteImagePreviewCard from '@components/main/Grid/PropertiesPanel/single/SpriteImagePreviewCard';
import Dropdown from '@components/main/common/dropdown/Dropdown';
import { editGestureController } from '@src/renderer/editor/runtime/gesture/editGestureController';
import { AXIS_FIELD_WIDTH } from '@utils/cardRecipes';
import { pickValidatedImage } from '@utils/media/pickValidatedImage';
import { clamp } from '@utils/number/clamp';
import { anchorToPercent, percentToAnchor } from '@utils/sprite/spriteGeometry';
import {
  fitSpriteBoundsToNaturalSize,
  spritePivotChangePatch,
} from '@utils/sprite/spritePlacement';
import {
  DEFAULT_SPRITE_TRANSITION_EASING,
  SPRITE_CONSTRAINTS,
  type ReactiveSpritePosition,
  type SpriteActivation,
  type SpriteAnchor,
} from '@src/types/key/sprites';
import type { PanelSectionProps } from '../../defineElementKind';
import { currentTreePosition } from '../../runtime/treeElementPosition';
import { spriteEasingOptions } from './spriteEasingOptions';

// 여러 스프라이트 - 고친 값을 고른 스프라이트 모두에 (하나를 고를 때와 같은 규칙을 스프라이트마다).
// 상태 목록은 스프라이트마다 다른 목록이라 하나를 고를 때 편집한다

type SpritePatch = Partial<ReactiveSpritePosition>;

const MixedLabel = () => (
  <span className="text-fg-faint text-body italic">Mixed</span>
);

// 모두 같은 값인지
const sameAcross = <T,>(
  sprites: readonly ReactiveSpritePosition[],
  read: (sprite: ReactiveSpritePosition) => T,
) => sprites.every((sprite) => read(sprite) === read(sprites[0]));

const useSpriteBatch = (sceneId: string, elementIds: readonly string[]) => {
  const { items } = usePanelElements(sceneId, elementIds);
  const sprites = items as unknown as ReactiveSpritePosition[];
  const ids = sprites.map(({ id }) => id);

  // 스프라이트마다 저장 시점의 최신 값에서 패치를 만든다 (못 만드는 스프라이트는 그대로).
  // 활성 미리보기 게스처가 있으면 gestureId를 실어 정산한다
  const commit = (
    patchOf: (current: ReactiveSpritePosition) => SpritePatch | null,
  ) => {
    const gestureId = editGestureController.activeGestureId() ?? undefined;
    const persisted = spriteItemsApi.patchPositions(ids, patchOf, gestureId);
    editGestureController.settleCommit(persisted);
    void persisted.catch((error) => {
      console.error('Failed to update sprites', error);
    });
  };

  // 스크럽·타이핑 실시간 미리보기 - 스프라이트마다 저장 값(미리보기 없음) 기준
  const preview = (
    patchOf: (canonical: ReactiveSpritePosition) => SpritePatch | null,
  ) => {
    const entries = ids.flatMap((id) => {
      const canonical = currentTreePosition(sceneId, id) as
        | ReactiveSpritePosition
        | undefined;
      const patch = canonical ? patchOf(canonical) : null;
      return patch ? [{ id, patch: patch as Record<string, unknown> }] : [];
    });
    editGestureController.preview(sceneId, entries, {
      domain: 'spritePosition',
    });
  };

  return { sprites, commit, preview };
};

/** 기본 이미지 - 고른 이미지를 모두에 (상자는 스프라이트마다 제 기준점으로 이미지 비율에 맞춘다) */
export const SpriteBatchImageSection = ({
  sceneId,
  elementIds,
  t: translate,
}: PanelSectionProps) => {
  const t = (key: string) => translate(key) ?? '';
  const { sprites, commit } = useSpriteBatch(sceneId, elementIds);
  const idsKey = sprites.map(({ id }) => id).join(',');
  // 파일 창이 떠 있는 동안 고른 스프라이트가 바뀌었거나 패널이 닫혔으면 고른 이미지를 버린다
  const generationRef = useRef(0);
  const loadingImageRef = useRef(false);
  useEffect(
    () => () => {
      generationRef.current += 1;
    },
    [idsKey],
  );
  if (sprites.length === 0) return null;

  const handleBaseImageSelect = async () => {
    if (loadingImageRef.current) return;
    const generation = generationRef.current;
    loadingImageRef.current = true;
    const picked = await pickValidatedImage(t);
    loadingImageRef.current = false;
    if (!picked || generationRef.current !== generation) return;
    const referenceNaturalSize = {
      source: picked.path,
      width: picked.width,
      height: picked.height,
    };
    commit((current) => ({
      baseImage: picked.path,
      referenceNaturalSize,
      ...fitSpriteBoundsToNaturalSize(current, current.pivot, picked),
    }));
  };

  // 기본 이미지를 지워도 기준 크기는 남긴다 - 이미지가 있는 스프라이트만
  const handleBaseImageReset = () =>
    commit((current) =>
      current.baseImage == null
        ? null
        : {
            baseImage: null,
            referenceNaturalSize: current.referenceNaturalSize
              ? { ...current.referenceNaturalSize, source: null }
              : null,
          },
    );

  const mixed = !sameAcross(sprites, (sprite) => sprite.baseImage ?? null);
  return (
    <SpriteImagePreviewCard
      source={mixed ? null : sprites[0].baseImage}
      mixed={mixed}
      onPick={() => void handleBaseImageSelect()}
      onReset={handleBaseImageReset}
      t={t}
    />
  );
};

/** 기준점·반응 방식·재생/전환 시간·가속 곡선. 재생 시간은 단발 재생, 전환 시간은 누름 유지 스프라이트에 */
const SpriteBatchSection = ({
  sceneId,
  elementIds,
  t: translate,
}: PanelSectionProps) => {
  const t = (key: string) => translate(key) ?? '';
  const { sprites, commit, preview } = useSpriteBatch(sceneId, elementIds);
  if (sprites.length === 0) return null;
  const [first] = sprites;
  const { anchor, transitionMs, pressDurationMs } = SPRITE_CONSTRAINTS;

  // 기준점 축 하나 - 스프라이트마다 제 기준점에 그 축만 바꾼다 (기본 이미지는 제자리)
  const pivotWith = (
    current: ReactiveSpritePosition,
    patch: Partial<SpriteAnchor>,
  ) => spritePivotChangePatch(current, { ...current.pivot, ...patch });
  const pivotLabel = t('propertiesPanel.spritePivot') || '기준점';
  const pivotInput = (axis: 'x' | 'y') => (
    <NumberInput
      value={anchorToPercent(first.pivot[axis])}
      isMixed={!sameAcross(sprites, (sprite) => sprite.pivot[axis])}
      onChange={(value) =>
        commit((current) =>
          pivotWith(current, { [axis]: percentToAnchor(value) }),
        )
      }
      onPreview={(value) =>
        preview((canonical) =>
          pivotWith(canonical, { [axis]: percentToAnchor(value) }),
        )
      }
      onCancel={() => editGestureController.cancel()}
      prefix={axis.toUpperCase()}
      suffix="%"
      ariaLabel={`${pivotLabel} ${axis.toUpperCase()}`}
      width={AXIS_FIELD_WIDTH}
      min={anchor.min * 100}
      max={anchor.max * 100}
      allowDecimal
      decimalScale={1}
    />
  );

  // 시간 칸 - 그 반응 방식의 스프라이트에만. Rust u32 계약이라 스크럽 소수값을 정수로 고정
  const durationRow = (
    field: 'pressDurationMs' | 'transitionMs',
    owners: readonly ReactiveSpritePosition[],
    owns: (sprite: ReactiveSpritePosition) => boolean,
    label: string,
  ) => {
    const { min, max } =
      field === 'pressDurationMs' ? pressDurationMs : transitionMs;
    const patchOf = (value: number) => (sprite: ReactiveSpritePosition) =>
      owns(sprite) ? { [field]: Math.round(clamp(value, min, max)) } : null;
    return (
      <PropertyRow label={label}>
        <NumberInput
          value={owners[0][field]}
          isMixed={!sameAcross(owners, (sprite) => sprite[field])}
          onChange={(value) => commit(patchOf(value))}
          onPreview={(value) => preview(patchOf(value))}
          onCancel={() => editGestureController.cancel()}
          suffix="ms"
          min={min}
          max={max}
        />
      </PropertyRow>
    );
  };
  const isOnPress = (sprite: ReactiveSpritePosition) =>
    sprite.activation === 'onPress';
  const onPressSprites = sprites.filter(isOnPress);
  const whileHeldSprites = sprites.filter((sprite) => !isOnPress(sprite));

  const easingOf = (sprite: ReactiveSpritePosition) =>
    sprite.transitionEasing || DEFAULT_SPRITE_TRANSITION_EASING;
  const activationMixed = !sameAcross(sprites, (sprite) => sprite.activation);
  const easingMixed = !sameAcross(sprites, easingOf);

  return (
    <>
      <PropertySection>
        <PropertyRow label={pivotLabel}>
          {pivotInput('x')}
          {pivotInput('y')}
        </PropertyRow>
      </PropertySection>

      <PropertySection>
        <PropertyRow
          label={t('propertiesPanel.spriteActivation') || '반응 방식'}
        >
          {activationMixed && <MixedLabel />}
          <Dropdown
            options={[
              {
                label: t('propertiesPanel.spriteActivationHold') || '누름 유지',
                value: 'whileHeld',
              },
              {
                label:
                  t('propertiesPanel.spriteActivationPress') || '단발 재생',
                value: 'onPress',
              },
            ]}
            value={first.activation}
            onChange={(value) =>
              commit((current) =>
                current.activation === value
                  ? null
                  : { activation: value as SpriteActivation },
              )
            }
            align="right"
          />
        </PropertyRow>
        {onPressSprites.length > 0 &&
          durationRow(
            'pressDurationMs',
            onPressSprites,
            isOnPress,
            t('propertiesPanel.spritePressDuration') || '재생 시간',
          )}
        {whileHeldSprites.length > 0 &&
          durationRow(
            'transitionMs',
            whileHeldSprites,
            (sprite) => !isOnPress(sprite),
            t('propertiesPanel.spriteTransition') || '전환 시간',
          )}

        <PropertyRow label={t('propertiesPanel.spriteEasing') || '가속 곡선'}>
          {easingMixed && <MixedLabel />}
          <Dropdown
            options={spriteEasingOptions(easingOf(first), t)}
            value={easingOf(first)}
            onChange={(value) =>
              commit((current) =>
                current.transitionEasing === value
                  ? null
                  : { transitionEasing: value },
              )
            }
            align="right"
          />
        </PropertyRow>
      </PropertySection>
    </>
  );
};

export default SpriteBatchSection;
