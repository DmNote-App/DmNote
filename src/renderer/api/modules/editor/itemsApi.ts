import { invoke } from '@tauri-apps/api/core';
import { subscribe } from '../shared';
import { commitLegacyEditorPatch } from '@src/renderer/editor/runtime/lifecycle/legacyEditorMutation';

import type { StatItemPositions } from '@src/types/key/statItems';
import type { GraphItemPositions } from '@src/types/key/graphItems';
import type { KnobItemPositions } from '@src/types/key/knobs';
import type { ReactiveSpritePosition } from '@src/types/key/sprites';
import { toSpriteWireShape } from '@utils/sprite/spriteWireShape';
import { commitTreeLegacyFields } from '@src/renderer/editor/runtime/operations/editorSemanticOps';
import type { LayerGroups } from '@src/types/layerGroups';

// 커밋 성사 여부를 호출자가 판별하는 typed 결과. targetMissing은 무커밋
type SpritePatchCommitResult = 'committed' | 'targetMissing' | 'skipped';
type SpritePatchGenerator = (
  current: ReactiveSpritePosition,
) => Partial<ReactiveSpritePosition> | null;

export const statItemsApi = {
  getPositions: () => invoke<StatItemPositions>('stat_positions_get'),
  updatePositions: (positions: StatItemPositions) =>
    commitLegacyEditorPatch({
      schemaVersion: 1,
      statPositions: positions,
    }).then(() => structuredClone(positions)),
  onPositionsChanged: (listener: (positions: StatItemPositions) => void) =>
    subscribe<StatItemPositions>('statPositions:changed', listener),
};

export const graphItemsApi = {
  getPositions: () => invoke<GraphItemPositions>('graph_positions_get'),
  updatePositions: (positions: GraphItemPositions) =>
    commitLegacyEditorPatch({
      schemaVersion: 1,
      graphPositions: positions,
    }).then(() => structuredClone(positions)),
  onPositionsChanged: (listener: (positions: GraphItemPositions) => void) =>
    subscribe<GraphItemPositions>('graphPositions:changed', listener),
};

export const knobItemsApi = {
  getPositions: () => invoke<KnobItemPositions>('knob_positions_get'),
  updatePositions: (positions: KnobItemPositions) =>
    commitLegacyEditorPatch({
      schemaVersion: 1,
      knobPositions: positions,
    }).then(() => structuredClone(positions)),
  onPositionsChanged: (listener: (positions: KnobItemPositions) => void) =>
    subscribe<KnobItemPositions>('knobPositions:changed', listener),
};

export const spriteItemsApi = {
  // 스프라이트 칸 패치를 트리로 - 지금 값에서 패치를 만들고(generatePatch) 트리 커밋으로.
  // 대상 소실이면 무커밋 targetMissing. gestureId는 숫자 스크럽 preview 게스처 정산용
  patchPosition: (
    mode: string,
    id: string,
    patch: Partial<ReactiveSpritePosition>,
    gestureId?: string,
    generatePatch?: SpritePatchGenerator,
  ): Promise<SpritePatchCommitResult> => {
    // 트리 편집기가 맡는 스프라이트는 트리로 (확인 전까지 대기 중인 트리 편집이 얹는다)
    const tree = commitTreeLegacyFields(
      'sprite',
      mode,
      id,
      (current) => {
        const latestPatch = generatePatch
          ? generatePatch(current as unknown as ReactiveSpritePosition)
          : patch;
        if (!latestPatch) return null;
        const next = toSpriteWireShape({
          ...(current as unknown as ReactiveSpritePosition),
          ...latestPatch,
          id,
        }) as unknown as Record<string, unknown>;
        return Object.fromEntries(
          Object.keys(latestPatch).map((field) => [field, next[field] ?? null]),
        );
      },
      gestureId,
    );
    // 지금 장면 트리에 없는 스프라이트는 고칠 수 없다
    return tree ?? Promise.resolve('targetMissing');
  },
};

export const layerGroupsApi = {
  get: () => invoke<LayerGroups>('layer_groups_get'),
  update: (groups: LayerGroups) =>
    commitLegacyEditorPatch({ schemaVersion: 1, layerGroups: groups }).then(
      () => structuredClone(groups),
    ),
  onChanged: (listener: (groups: LayerGroups) => void) =>
    subscribe<LayerGroups>('layerGroups:changed', listener),
};
