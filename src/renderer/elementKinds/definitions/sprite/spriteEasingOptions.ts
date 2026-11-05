import { DEFAULT_SPRITE_TRANSITION_EASING } from '@src/types/key/sprites';

// 계약과 동일한 cubic-bezier 문자열만 저장 (transitionEasing은 문자열 그대로 CSS로 간다)
const SPRITE_EASING_PRESETS: ReadonlyArray<{ label: string; value: string }> = [
  { label: 'Default', value: DEFAULT_SPRITE_TRANSITION_EASING },
  { label: 'Linear', value: 'cubic-bezier(0, 0, 1, 1)' },
  { label: 'Ease Out', value: 'cubic-bezier(0, 0, 0.58, 1)' },
  { label: 'Ease In', value: 'cubic-bezier(0.42, 0, 1, 1)' },
  { label: 'Ease In-Out', value: 'cubic-bezier(0.42, 0, 0.58, 1)' },
  { label: 'Overshoot', value: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
];

/** 가속 곡선 선택지 - 프리셋에 없는 값이면 '사용자 정의'로 앞에 둔다 */
export const spriteEasingOptions = (
  value: string,
  t: (key: string) => string | undefined,
): Array<{ label: string; value: string }> =>
  SPRITE_EASING_PRESETS.some((preset) => preset.value === value)
    ? [...SPRITE_EASING_PRESETS]
    : [
        {
          label: t('propertiesPanel.spriteEasingCustom') || '사용자 정의',
          value,
        },
        ...SPRITE_EASING_PRESETS,
      ];
