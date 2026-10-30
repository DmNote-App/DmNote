import type { LayerGroupDef } from '@src/types/layerGroups';
import type { PluginDisplayElementInternal } from '@src/types/plugin/api';

export const isPluginVisibleInMode = (
  element: Pick<PluginDisplayElementInternal, 'tabId'>,
  mode: string,
): boolean => !element.tabId || element.tabId === mode;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildNextLayerGroupName(
  baseLabel: string,
  groups: LayerGroupDef[],
): string {
  const normalizedBase = (baseLabel || 'New Group').trim() || 'New Group';
  const pattern = new RegExp(`^${escapeRegExp(normalizedBase)}\\s+(\\d+)$`);
  const usedNumbers = new Set<number>();

  groups.forEach((group) => {
    const match = group.name.match(pattern);
    if (!match) return;
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > 0) {
      usedNumbers.add(value);
    }
  });

  let next = 1;
  while (usedNumbers.has(next)) {
    next += 1;
  }

  return `${normalizedBase} ${next}`;
}
