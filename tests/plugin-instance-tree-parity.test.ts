import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { normalizePluginInstanceTabId } from '../src/renderer/plugins/runtime/displayElement/instanceLifecycle';
import type { SavedInstance } from '../src/renderer/plugins/runtime/api/pluginInstanceSnapshotApplier';
import {
  pluginInstanceOps,
  pluginInstancesFromTree,
} from '../src/renderer/plugins/runtime/api/pluginTreeInstances';
import type { Document, Node } from '../src/types/generated/elementDocument';

// Rust 테스트(state/plugin_tree/instances_fixture.rs)가 만든 fixture - 플러그인 런타임의 인스턴스 ↔ 트리 노드
// 변환이 백엔드 저장 항목 ↔ 노드(placeable·place, project_plugin_bucket)와 같은지 고정한다
const fixture = JSON.parse(
  readFileSync(
    join(__dirname, 'fixtures', 'plugin-instance-tree.json'),
    'utf8',
  ),
) as {
  pluginId: string;
  base: Document;
  entries: SavedInstance[];
  document: Document;
  projected: SavedInstance[];
  placed: { scene: string; parent: string | null; node: Node }[];
  tabs: { tabId: string | null; scene: string }[];
};

const viewOf = (document: Document) => ({
  getSceneIds: () => Object.keys(document.scenes),
  getScene: (sceneId: string) => document.scenes[sceneId],
});

const fullIdOf = (instance: SavedInstance) =>
  `${fixture.pluginId}::${instance.instanceId}`;

describe('플러그인 인스턴스 ↔ 트리 파리티', () => {
  it('백엔드가 둔 트리를 읽으면 백엔드가 읽는 항목과 같다', () => {
    expect(
      pluginInstancesFromTree(viewOf(fixture.document), fixture.pluginId),
    ).toEqual(fixture.projected);
  });

  it.each(fixture.entries.map((entry) => [entry.instanceId, entry] as const))(
    '%s: 새 인스턴스 넣기는 백엔드가 항목으로 둔 노드와 같은 장면·그룹·노드다',
    (_, entry) => {
      const [op, ...rest] = pluginInstanceOps(
        viewOf(fixture.base),
        fixture.pluginId,
        new Map(),
        new Map([[fullIdOf(entry), entry]]),
      );
      expect(rest).toEqual([]);
      if (op?.op !== 'insert') throw new Error('넣기여야 한다');
      const { legacy: _legacy, ...node } = op.node as Node & {
        legacy?: unknown;
      };
      expect({ scene: op.scene, parent: op.parent, node }).toEqual(
        fixture.placed.find((placed) => placed.node.id === fullIdOf(entry)),
      );
    },
  );

  it('탭 정규화가 같다', () => {
    for (const { tabId, scene } of fixture.tabs) {
      expect(normalizePluginInstanceTabId(tabId ?? undefined)).toBe(scene);
    }
  });
});
