import { newElementId } from '@src/renderer/editor/model/elementId';
import {
  addGraphAt,
  addKnobAt,
  addSpriteAt,
  addStatAt,
  placeDuplicatedGraph,
  placeDuplicatedKnob,
  placeDuplicatedSprite,
  placeDuplicatedStat,
} from '@src/renderer/editor/runtime/operations/elementOps';
import type { CanonicalPositionOf, ItemElementType } from '@src/types/editor';
import { DEFAULT_ELEMENT_ROTATION } from '@src/types/key/rotation';
import {
  CENTER_SPRITE_ANCHOR,
  DEFAULT_SPRITE_ACTIVATION,
  DEFAULT_SPRITE_PRESS_DURATION_MS,
  DEFAULT_SPRITE_SIZE,
  DEFAULT_SPRITE_TRANSITION_EASING,
  DEFAULT_SPRITE_TRANSITION_MS,
  IDENTITY_SPRITE_TRANSFORM,
} from '@src/types/key/sprites';
import type {
  CounterAnimationBezier,
  KeyCounterSettings,
} from '@src/types/key/keys';
import { createDefaultCounterSettings } from '@src/types/key/keys';
import {
  DEFAULT_ELEMENT_ACTIVE_BG,
  DEFAULT_ELEMENT_BG,
  DEFAULT_ELEMENT_FONT,
  DEFAULT_ELEMENT_RADIUS,
} from '@utils/element/elementDefaults';
import { getLooseStatTypeLabel } from '@utils/grid/statTypeLabel';
import { toSpriteWireShape } from '@utils/sprite/spriteWireShape';

interface ItemCanvasRules<K extends ItemElementType> {
  // 새 요소 기본값
  create: (dx: number, dy: number) => CanonicalPositionOf<K>;
  add: (mode: string, position: CanonicalPositionOf<K>) => Promise<unknown>;
  // 복제 시작 - 고스트 라벨과 복제 템플릿
  duplicateSource: (position: CanonicalPositionOf<K>) => {
    keyName: string;
    position: CanonicalPositionOf<K>;
  };
  placeDuplicated: (
    mode: string,
    source: CanonicalPositionOf<K>,
    dx: number,
    dy: number,
    zIndex: number,
  ) => Promise<unknown>;
}

// 노트 기본값 - KeyPosition 기반 아이템 공통
const itemNoteDefaults = (noteEffectEnabled: boolean) =>
  ({
    count: 0,
    noteColor: '#FFFFFF',
    noteOpacity: 90,
    noteAlignment: 'center',
    noteEffectEnabled,
    noteGlowEnabled: false,
    noteGlowSyncPaint: false,
    noteGlowSize: 10,
    noteGlowOpacity: 70,
    noteGlowColor: '#FFFFFF',
    noteAutoYCorrection: true,
  } as const);

// 키 외 종류별 캔버스 생성·복제 규칙
export const ITEM_CANVAS_RULES: {
  [K in ItemElementType]: ItemCanvasRules<K>;
} = {
  stat: {
    create: (dx, dy) => ({
      id: newElementId(),
      statType: 'kps',
      dx,
      dy,
      rotation: DEFAULT_ELEMENT_ROTATION,
      width: 60,
      height: 60,
      hidden: false,
      activeImage: '',
      inactiveImage: '',
      soundPath: '',
      soundVolume: 100,
      activeTransparent: false,
      idleTransparent: false,
      ...itemNoteDefaults(true),
      className: '',
      counter: createDefaultCounterSettings(),
    }),
    add: addStatAt,
    duplicateSource: (position) => {
      const clonedNoteColor =
        position.noteColor &&
        typeof position.noteColor === 'object' &&
        position.noteColor !== null
          ? { ...position.noteColor }
          : position.noteColor;

      const clonedCounter: KeyCounterSettings | null = position.counter
        ? {
            ...position.counter,
            fill: { ...position.counter.fill },
            ...(position.counter.animation
              ? {
                  animation: {
                    ...position.counter.animation,
                    bezier: [
                      ...position.counter.animation.bezier,
                    ] as CounterAnimationBezier,
                  },
                }
              : {}),
          }
        : null;

      return {
        keyName: getLooseStatTypeLabel(position.statType),
        position: {
          ...position,
          noteColor: clonedNoteColor,
          counter: clonedCounter ?? createDefaultCounterSettings(),
        },
      };
    },
    placeDuplicated: placeDuplicatedStat,
  },
  graph: {
    create: (dx, dy) => ({
      id: newElementId(),
      statType: 'kps',
      graphType: 'line',
      graphSpeed: 1000,
      graphColor: '#86EFAC',
      showAvgLine: true,
      graphAnimationEnabled: true,
      dx,
      dy,
      rotation: DEFAULT_ELEMENT_ROTATION,
      width: 120,
      height: 60,
      hidden: false,
      activeImage: '',
      inactiveImage: '',
      soundPath: '',
      soundVolume: 100,
      activeTransparent: false,
      idleTransparent: false,
      ...itemNoteDefaults(true),
      className: '',
      counter: createDefaultCounterSettings(),
      backgroundColor: DEFAULT_ELEMENT_BG,
      borderRadius: DEFAULT_ELEMENT_RADIUS,
      fontColor: DEFAULT_ELEMENT_FONT,
      activeFontColor: DEFAULT_ELEMENT_FONT,
      fontSize: 12,
      useInlineStyles: false,
      displayText: '',
    }),
    add: addGraphAt,
    duplicateSource: (position) => ({
      keyName: getLooseStatTypeLabel(position.statType),
      position: { ...position },
    }),
    placeDuplicated: placeDuplicatedGraph,
  },
  knob: {
    create: (dx, dy) => ({
      id: newElementId(),
      axisId: '',
      sensitivity: 1,
      reverse: false,
      dx,
      dy,
      rotation: DEFAULT_ELEMENT_ROTATION,
      width: 60,
      height: 60,
      hidden: false,
      activeImage: '',
      inactiveImage: '',
      activeTransparent: false,
      idleTransparent: false,
      ...itemNoteDefaults(false),
      className: '',
      counter: createDefaultCounterSettings(),
      backgroundColor: DEFAULT_ELEMENT_BG,
      activeBackgroundColor: DEFAULT_ELEMENT_ACTIVE_BG,
    }),
    add: addKnobAt,
    duplicateSource: (position) => ({
      keyName: 'Knob',
      position: { ...position },
    }),
    placeDuplicated: placeDuplicatedKnob,
  },
  sprite: {
    // wire 정규화: nullish layerName·groupId는 키 부재로 맞춰 ack와 일치
    create: (dx, dy) =>
      toSpriteWireShape({
        id: newElementId(),
        dx,
        dy,
        width: DEFAULT_SPRITE_SIZE,
        height: DEFAULT_SPRITE_SIZE,
        hidden: false,
        zIndex: null,
        layerName: null,
        groupId: null,
        className: null,
        useInlineStyles: null,
        rotation: 0,
        baseImage: null,
        pivot: { ...CENTER_SPRITE_ANCHOR },
        idleTransform: { ...IDENTITY_SPRITE_TRANSFORM },
        poses: [],
        activation: DEFAULT_SPRITE_ACTIVATION,
        pressDurationMs: DEFAULT_SPRITE_PRESS_DURATION_MS,
        transitionMs: DEFAULT_SPRITE_TRANSITION_MS,
        transitionEasing: DEFAULT_SPRITE_TRANSITION_EASING,
        // 기준 크기는 첫 이미지를 고를 때 패널이 채운다
        referenceNaturalSize: null,
      }),
    add: addSpriteAt,
    duplicateSource: (position) => ({
      keyName: 'Sprite',
      position: { ...position },
    }),
    placeDuplicated: placeDuplicatedSprite,
  },
};
