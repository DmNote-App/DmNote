import React, {
  Fragment,
  Suspense,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';

import Checkbox from '@components/main/common/checkbox/Checkbox';
import Dropdown from '@components/main/common/dropdown/Dropdown';
import type {
  BundleName,
  PanelRowDecl,
  PanelSectionDecl,
  PanelSectionProps,
} from '@src/renderer/elementKinds/defineElementKind';
import { BUILTIN_ELEMENT_KINDS } from '@src/renderer/elementKinds/builtinKinds';
import { preloadPanelControls } from '@src/renderer/elementKinds/runtime/lazyPanelControl';
import type { JsonValue } from '@src/types/generated/elementDocument';
import {
  fieldState,
  visibleRows,
  type FieldState,
  type Translate,
  type Values,
} from './documentPanelModel';
import {
  ColorInput,
  NumberInput,
  PropertyRow,
  PropertySection,
} from '../controls/PropertyInputs';

// 편집 창이 패널 부품을 불러올 때 종류 패널의 지연 로딩 입력도 미리 불러 둔다 - 처음 여는 패널이 빈 칸으로
// 한 번 그려지지 않게
preloadPanelControls(BUILTIN_ELEMENT_KINDS as never);

const MixedLabel = () => (
  <span className="text-fg-faint text-body italic">Mixed</span>
);

interface FieldRowProps {
  row: PanelRowDecl<Values>;
  // 보일 값 (displayValueOf를 거친 값) - 여러 개면 첫 값과 섞임
  state: FieldState;
  // 여러 개를 고른 패널 - 섞임 표시를 옛 일괄 패널과 같게 입력 앞에 둔다
  batch?: boolean;
  // settlesPreview - 미리보기를 보인 칸의 확정 (그 미리보기 제스처를 이 커밋으로 정산)
  onCommit: (value: JsonValue, options?: { settlesPreview?: boolean }) => void;
  // 색 칸 미리보기·취소 - 미리보기를 쓰는 칸만
  onPreview?: (value: JsonValue) => void;
  onCancelPreview?: () => void;
  colorId?: string;
  // 고른 요소들 - 직접 만든 입력이 받는다
  elementIds: readonly string[];
  panelElement: HTMLElement | null;
  t: Translate;
}

/** 정의의 패널 칸 하나 - 지금 패널 부품으로 그린다 */
export const FieldRow = ({
  row,
  state,
  batch = false,
  onCommit,
  onPreview,
  onCancelPreview,
  colorId,
  elementIds,
  panelElement,
  t,
}: FieldRowProps) => {
  const { value, isMixed } = state;
  // 입력 중 값(draft 칸) - 그 요소의 저장 값이 바뀌면(커밋 착지·다른 창) 걷는다. 먼저 비우면 착지 전 한 프레임
  // 옛 값이 비친다. 다른 요소로 바뀐 첫 렌더부터 앞 요소의 입력 중 값이 비치지 않게 요소 id도 함께 묶는다
  const draftSource = `${elementIds.join(',')}\n${JSON.stringify(value)}`;
  const [draft, setDraft] = useState<{
    value: number;
    source: string;
  } | null>(null);
  // 바탕이 바뀌면 지운다 - 가리기만 하면 되돌리기·요소 왕복으로 바탕이 돌아왔을 때 묵은 값이 다시 비친다
  if (draft && draft.source !== draftSource) setDraft(null);
  const draftValue = draft && draft.source === draftSource ? draft.value : null;
  const label = t(row.label) || row.label;
  const control = row.control;
  const mixedLabel = isMixed ? <MixedLabel /> : null;
  const usesDraft = control.type === 'number' && control.draft && !batch;
  if (control.type === 'toggle') {
    const checked = value === true;
    const checkbox = (
      <Checkbox
        commitStrategy="after-paint"
        checked={checked}
        onChange={() => onCommit(!checked)}
      />
    );
    return (
      <div className="flex justify-between items-center w-full min-h-[32px]">
        <p className="text-fg-muted text-label">{label}</p>
        {batch ? (
          <div className="flex items-center gap-[6px]">
            {mixedLabel}
            {checkbox}
          </div>
        ) : (
          checkbox
        )}
      </div>
    );
  }
  const colorValue = (typeof value === 'string' ? value : '') || '#FFFFFF';
  return (
    <PropertyRow label={label}>
      {control.type === 'custom' ? null : mixedLabel}
      {control.type === 'number' ? (
        <NumberInput
          value={draftValue ?? (typeof value === 'number' ? value : 0)}
          width={control.width}
          onChange={(next) => {
            if (usesDraft) setDraft({ value: next, source: draftSource });
            if (control.snap === undefined) {
              onCommit(next);
              return;
            }
            // 범위로 자른 뒤 단위로 맞춘다
            const clamped = Math.max(
              control.min ?? -Infinity,
              Math.min(control.max ?? Infinity, next),
            );
            onCommit(Math.round(clamped / control.snap) * control.snap);
          }}
          {...(usesDraft
            ? {
                onPreview: (next: number) =>
                  setDraft({ value: next, source: draftSource }),
                onCancel: () => setDraft(null),
              }
            : {})}
          min={control.min}
          max={control.max}
          suffix={control.suffix}
          allowDecimal={(control.decimalScale ?? 0) > 0}
          decimalScale={control.decimalScale}
          isMixed={isMixed}
        />
      ) : control.type === 'select' ? (
        <Dropdown
          commitStrategy="after-paint"
          options={control.options.map((option) => ({
            value: option.value,
            label: t(option.label) || option.label,
          }))}
          value={typeof value === 'string' ? value : undefined}
          onChange={(next) => onCommit(next)}
        />
      ) : control.type === 'color' && control.preview && onPreview ? (
        // 고르는 동안 화면에 먼저 보이고 놓을 때 확정, Esc는 되돌린다
        <ColorInput
          value={colorValue}
          hexMixed={state.hexMixed}
          alphaMixed={state.alphaMixed}
          onChange={() => {}}
          onPreview={(next) => onPreview(next)}
          onChangeComplete={(next) => onCommit(next, { settlesPreview: true })}
          onCancel={onCancelPreview}
          colorId={colorId}
          panelElement={panelElement}
        />
      ) : control.type === 'color' ? (
        <ColorInput
          value={colorValue}
          onChange={(next) => onCommit(next)}
          solidOnly
          panelElement={panelElement}
          hexMixed={state.hexMixed}
          alphaMixed={state.alphaMixed}
        />
      ) : (
        // 직접 만든 입력은 편집 화면 전용이라 지연 로딩일 수 있다
        <Suspense fallback={null}>
          {mixedLabel}
          <control.component
            value={value}
            onCommit={onCommit}
            elementIds={elementIds}
          />
        </Suspense>
      )}
    </PropertyRow>
  );
};

interface SurfaceRowsProps {
  // 고른 요소들의 표면 묶음
  surfaces: readonly Values[];
  onCommit: (fields: Values) => void;
  panelElement: HTMLElement | null;
  t: Translate;
}

/** 표면 묶음 칸 - 그래프·노브 패널과 같은 칸 이름·부품 (섹션 상자는 패널이 감싼다) */
export const SurfaceRows = ({
  surfaces,
  onCommit,
  panelElement,
  t,
}: SurfaceRowsProps) => {
  const color = (name: string) => {
    const { value, isMixed } = fieldState(surfaces, name);
    return { value: typeof value === 'string' ? value : '', isMixed };
  };
  const number = (name: string, fallback: number) => {
    const { value, isMixed } = fieldState(surfaces, name);
    return { value: typeof value === 'number' ? value : fallback, isMixed };
  };
  const background = color('backgroundColor');
  const border = color('borderColor');
  const borderWidth = number('borderWidth', 1);
  const borderRadius = number('borderRadius', 4);
  return (
    <>
      <PropertyRow label={t('propertiesPanel.backgroundColor') || 'Background'}>
        <ColorInput
          value={background.value}
          onChange={(next) => onCommit({ backgroundColor: next })}
          solidOnly
          panelElement={panelElement}
          hexMixed={background.isMixed}
          alphaMixed={background.isMixed}
        />
      </PropertyRow>
      <PropertyRow label={t('propertiesPanel.borderColor') || 'Border'}>
        <ColorInput
          value={border.value}
          onChange={(next) => onCommit({ borderColor: next })}
          solidOnly
          panelElement={panelElement}
          hexMixed={border.isMixed}
          alphaMixed={border.isMixed}
        />
      </PropertyRow>
      <PropertyRow label={t('propertiesPanel.borderWidth') || 'Border Width'}>
        <NumberInput
          value={borderWidth.value}
          onChange={(next) => onCommit({ borderWidth: Math.max(0, next) })}
          min={0}
          max={20}
          suffix="px"
          isMixed={borderWidth.isMixed}
        />
      </PropertyRow>
      <PropertyRow label={t('propertiesPanel.borderRadius') || 'Radius'}>
        <NumberInput
          value={borderRadius.value}
          onChange={(next) => onCommit({ borderRadius: Math.max(0, next) })}
          min={0}
          max={500}
          suffix="px"
          isMixed={borderRadius.isMixed}
        />
      </PropertyRow>
    </>
  );
};

// 섹션마다 그리는 쪽 - 단일·여러 개 패널이 공통 섹션·기능 묶음·칸을 자기 방식으로 그린다
export interface PanelSectionRenderers {
  geometry: () => ReactNode;
  customCss: () => ReactNode;
  // 직접 만든 섹션 - 편집 화면 전용이라 지연 로딩일 수 있다
  custom: (component: ComponentType<PanelSectionProps>) => ReactNode;
  // 이어진 기능 묶음 - 섹션 상자도 그리는 쪽이 정한다 (옛 종류는 옛 패널의 섹션 배치 그대로)
  bundles: (bundles: readonly BundleName[]) => ReactNode;
  row: (row: PanelRowDecl<Values>) => ReactNode;
}

type SectionGroup =
  | { kind: 'single'; section: PanelSectionDecl<Values> }
  | { kind: 'bundles'; bundles: BundleName[] };

// 이어진 기능 묶음 섹션은 함께 그린다 (옛 패널의 스타일 섹션과 같은 모양)
const groupSections = (
  sections: readonly PanelSectionDecl<Values>[],
): SectionGroup[] => {
  const groups: SectionGroup[] = [];
  for (const section of sections) {
    const last = groups[groups.length - 1];
    if ('bundle' in section) {
      if (last?.kind === 'bundles') last.bundles.push(section.bundle);
      else groups.push({ kind: 'bundles', bundles: [section.bundle] });
      continue;
    }
    groups.push({ kind: 'single', section });
  }
  return groups;
};

interface PanelSectionsProps {
  sections: readonly PanelSectionDecl<Values>[];
  // 고른 요소들의 칸 값 - 칸 보이기 판단
  items: readonly Values[];
  // 여러 개를 고른 패널 - 하나에만 쓰는 칸은 뺀다
  batch?: boolean;
  renderers: PanelSectionRenderers;
}

/** 정의의 섹션 순서대로 그린다 (하나·여럿 중 한쪽에만 쓰는 섹션은 빼고) */
export const PanelSections = ({
  sections,
  items,
  batch = false,
  renderers,
}: PanelSectionsProps) =>
  groupSections(
    sections.filter((section) => section.only !== (batch ? 'single' : 'batch')),
  ).map((group, index) => {
    if (group.kind === 'bundles') {
      return (
        <Fragment key={`bundles-${index}`}>
          {renderers.bundles(group.bundles)}
        </Fragment>
      );
    }
    const { section } = group;
    if ('bundle' in section) return null;
    if ('custom' in section) {
      return (
        <Fragment key={`custom-${index}`}>
          {renderers.custom(section.custom)}
        </Fragment>
      );
    }
    if ('common' in section) {
      return (
        <Fragment key={`common-${index}`}>
          {section.common === 'geometry'
            ? renderers.geometry()
            : renderers.customCss()}
        </Fragment>
      );
    }
    const rows = visibleRows(section.rows, items, batch);
    if (rows.length === 0) return null;
    return (
      <PropertySection key={`rows-${index}`}>
        {rows.map((row) => (
          <Fragment key={row.field}>{renderers.row(row)}</Fragment>
        ))}
      </PropertySection>
    );
  });
