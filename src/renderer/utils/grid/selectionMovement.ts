import type { PluginDisplayElementInternal } from '@src/types/plugin/api';

export const selectedPluginIds = (
  elements: readonly PluginDisplayElementInternal[],
  selectedFullIds: ReadonlySet<string>,
): string[] => [
  ...new Set(
    elements
      .filter((element) => selectedFullIds.has(element.fullId))
      .map((element) => element.pluginId),
  ),
];

export const moveSelectedPluginElements = (
  elements: readonly PluginDisplayElementInternal[],
  selectedFullIds: ReadonlySet<string>,
  deltaX: number,
  deltaY: number,
): PluginDisplayElementInternal[] =>
  elements.map((element) =>
    selectedFullIds.has(element.fullId)
      ? {
          ...element,
          position: {
            x: element.position.x + deltaX,
            y: element.position.y + deltaY,
          },
        }
      : element,
  );
