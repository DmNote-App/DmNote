// 여러 종류를 고른 일괄 패널 - 고른 종류들 패널 선언의 합 (섹션 순서·탭·섹션마다 가진 종류)과
// 기능 묶음 칸을 고칠 수 있는 종류 (눌림 그림·그림자 선언)
import { BUILTIN_ELEMENT_KINDS } from '@src/renderer/elementKinds/builtinKinds';
import type {
  BundleName,
  ElementKindDefinition,
  PanelSectionDecl,
  PanelTab,
} from '@src/renderer/elementKinds/defineElementKind';
import { elementKindDefinition } from '@src/renderer/elementKinds/runtime/elementKindRegistry';
import { defaultPanel, panelTabsOf, type Values } from './documentPanelModel';

export interface UnionSection {
  section: PanelSectionDecl<Values>;
  // 이 섹션을 가진 종류 - 종류 순서
  kinds: string[];
}

// 종류 순서 - 고른 순서와 상관없이 같은 배치 (내장 종류 순서, 그 밖은 뒤에)
const KIND_ORDER: readonly string[] = BUILTIN_ELEMENT_KINDS.map(
  ({ kind }) => kind,
);
const kindRank = (kind: string) => {
  const rank = KIND_ORDER.indexOf(kind);
  return rank < 0 ? KIND_ORDER.length : rank;
};

// 같은 섹션 - 공통 섹션·기능 묶음은 종류 사이에서 하나, 칸 묶음·직접 만든 섹션은 종류마다
const sectionKey = (
  kind: string,
  section: PanelSectionDecl<Values>,
  index: number,
) =>
  'common' in section
    ? `common:${section.common}`
    : 'bundle' in section
    ? `bundle:${section.bundle}`
    : `${kind}#${index}`;

/** 고른 종류들의 일괄 섹션 - 종류마다 선언 순서를 지키며 합친다. 한 종류에만 있는 섹션은
 * 그 종류의 다음 섹션 중 이미 있는 것 바로 앞에 (없으면 끝에) */
export const unionBatchSections = (
  kinds: readonly string[],
): UnionSection[] => {
  const merged: Array<UnionSection & { key: string }> = [];
  const definitions = [...new Set(kinds)]
    .sort((left, right) => kindRank(left) - kindRank(right))
    .flatMap((kind) => {
      const definition = elementKindDefinition(kind);
      return definition ? [definition] : [];
    });
  for (const definition of definitions) {
    const keyed = (definition.panel ?? defaultPanel(definition))
      .map((section, index) => ({
        section,
        key: sectionKey(definition.kind, section, index),
      }))
      .filter(({ section }) => section.only !== 'single');
    keyed.forEach(({ section, key }, index) => {
      const found = merged.find((entry) => entry.key === key);
      if (found) {
        found.kinds.push(definition.kind);
        return;
      }
      const next = keyed
        .slice(index + 1)
        .map((later) => merged.findIndex((entry) => entry.key === later.key))
        .find((position) => position >= 0);
      merged.splice(next ?? merged.length, 0, {
        key,
        section,
        kinds: [definition.kind],
      });
    });
  }
  return merged.map(({ section, kinds: owners }) => ({
    section,
    kinds: owners,
  }));
};

/** 고른 종류들의 일괄 패널 탭 - 탭 순서대로 */
export const unionBatchTabs = (kinds: readonly string[]): PanelTab[] =>
  panelTabsOf(
    unionBatchSections(kinds).map(({ section }) => section),
    true,
  );

/** 그 종류가 기능 묶음 칸을 고칠 수 있는지 - 묶음을 갖고, 눌림 칸은 눌림 그림이 있을 때만,
 * 그림자는 그림자를 그릴 때만 */
export const canEditBundleField = (
  kind: string,
  bundle: BundleName,
  {
    active = false,
    shadow = false,
  }: { active?: boolean; shadow?: boolean } = {},
): boolean => {
  const definition: ElementKindDefinition | undefined =
    elementKindDefinition(kind);
  if (!definition?.bundles?.includes(bundle)) return false;
  if (active && definition.activeVisual !== true) return false;
  return !(shadow && definition.surfaceShadow === false);
};
