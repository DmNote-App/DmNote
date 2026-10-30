import type { Node, Scene } from '@src/types/generated/elementDocument';

type RuntimeModule =
  typeof import('@src/renderer/editor/document/elementDocumentRuntime');

// 트리를 읽는 곳(오버레이·속성 패널 등)의 테스트 - 옛 스토어를 채우던 테스트가 그대로 돌도록
// 그 스토어 값으로 트리 장면을 만든다 (옛 위치 객체는 옛 칸에 그대로 싣는다)
//   vi.mock('@src/renderer/editor/document/elementDocumentRuntime', async (importOriginal) =>
//     (await import('@src/renderer/__tests__/treeFromLegacyStores')).treeFromStores(importOriginal));
// 목을 만들 때마다 스토어를 새로 불러온다 - 모듈을 다시 불러오는 테스트(vi.resetModules)가 새 스토어를 본다

type Loose = Record<string, unknown> & { id?: string };

const elementOf = (kind: string, position: Loose, index: number): Node => {
  const id = position.id ?? `${kind}-${index}`;
  return {
    type: 'element',
    id,
    kind,
    frame: {
      x: Number(position.dx ?? 0),
      y: Number(position.dy ?? 0),
      width: Number(position.width ?? 60),
      height: Number(position.height ?? 60),
      rotation: Number(position.rotation ?? 0),
    },
    hidden: position.hidden === true,
    legacy: { index, fields: position },
  } as unknown as Node;
};

export const treeFromStores = async (
  importOriginal: () => Promise<RuntimeModule>,
): Promise<RuntimeModule> => {
  const actual = await importOriginal();
  const { useSyncExternalStore } = await import('react');
  const [
    { useLegacyKeyArrays },
    stat,
    graph,
    knob,
    sprite,
    { useLayerGroupStore },
  ] = await Promise.all([
    import('@src/renderer/__tests__/legacyStores/useLegacyKeyArrays'),
    import('@src/renderer/__tests__/legacyStores/useStatItemStore'),
    import('@src/renderer/__tests__/legacyStores/useGraphItemStore'),
    import('@src/renderer/__tests__/legacyStores/useKnobItemStore'),
    import('@src/renderer/__tests__/legacyStores/useSpriteStore'),
    import('@src/renderer/__tests__/legacyStores/useLayerGroupStore'),
  ]);
  // 플러그인 스토어는 이 목 모듈을 불러온다 - 기다리면 목 생성이 서로 막히므로 다 올라온 뒤에 읽는다
  let pluginStore:
    | typeof import('@stores/plugin/usePluginDisplayElementStore').usePluginDisplayElementStore
    | null = null;
  void import('@stores/plugin/usePluginDisplayElementStore').then((module) => {
    pluginStore = module.usePluginDisplayElementStore;
  });
  const itemStores = [
    stat.useStatItemStore,
    graph.useGraphItemStore,
    knob.useKnobItemStore,
    sprite.useSpriteStore,
  ] as const;
  const lastByScene = new Map<string, { inputs: unknown[]; scene: Scene }>();

  const sceneFor = (sceneId: string): Scene => {
    const keys = useLegacyKeyArrays.getState();
    // 키 위치 - canonical을 채운 테스트(패널)는 그것, 아니면 보이는 위치(오버레이)
    const keyPositions = keys.canonicalPositions[sceneId]?.length
      ? keys.canonicalPositions[sceneId]
      : keys.positions[sceneId];
    const inputs = [
      keys.keyMappings[sceneId],
      keyPositions,
      ...itemStores.map((store) => store.getState().positions[sceneId]),
      useLayerGroupStore.getState().layerGroups[sceneId],
      // 그룹에 든 플러그인 요소만 (값 비교 - 상태·html 갱신은 장면을 바꾸지 않는다)
      JSON.stringify(
        (pluginStore?.getState().elements ?? [])
          .filter((plugin) => plugin.groupId)
          .map(({ fullId, pluginId, groupId }) => [fullId, pluginId, groupId]),
      ),
    ];
    // 같은 입력이면 같은 장면 (구독 스냅샷)
    const last = lastByScene.get(sceneId);
    if (last && inputs.every((input, index) => input === last.inputs[index])) {
      return last.scene;
    }
    const [mappedSlots, positions = []] = inputs as [
      unknown[] | undefined,
      Loose[] | undefined,
    ];
    // 매핑이 없는 테스트(패널)는 위치마다 빈 슬롯
    const slots = mappedSlots ?? positions.map(() => '');
    const nodes: Node[] = slots.map((slot, index) => ({
      ...(elementOf('key', positions[index] ?? {}, index) as object),
      input: { type: 'key', slot },
    })) as Node[];
    (['stat', 'graph', 'knob', 'sprite'] as const).forEach((kind, offset) => {
      ((inputs[2 + offset] ?? []) as Loose[]).forEach((position, index) =>
        nodes.push(elementOf(kind, position, index)),
      );
    });
    // 그룹에 든 플러그인 요소 - 그룹 계산(패널 그룹 정보 등)용. 나머지 플러그인은 트리 밖으로 둔다
    (JSON.parse(inputs[7] as string) as [string, string, string][]).forEach(
      ([fullId, pluginId, groupId], index) =>
        nodes.push({
          ...(elementOf(`plugin:${pluginId}`, {}, index) as object),
          id: fullId,
          legacy: { index, fields: { groupId } },
        } as unknown as Node),
    );
    // 옛 그룹(groupId)은 그룹 노드로 - 그룹 정의가 있는 것만
    const groups = (inputs[6] ?? []) as Array<{ id: string; name: string }>;
    const groupOf = (node: Node) =>
      (
        (node as { legacy?: { fields?: Loose } }).legacy?.fields as
          | { groupId?: string }
          | undefined
      )?.groupId;
    const grouped = nodes.filter((node) =>
      groups.some(({ id }) => id === groupOf(node)),
    );
    const roots = nodes.filter((node) => !grouped.includes(node));
    for (const group of groups) {
      const children = grouped.filter((node) => groupOf(node) === group.id);
      if (children.length > 0) {
        roots.push({
          type: 'group',
          id: group.id,
          name: group.name,
          children,
        } as Node);
      }
    }
    const scene: Scene = { nodes: roots };
    lastByScene.set(sceneId, { inputs, scene });
    return scene;
  };

  const find = (nodes: readonly Node[], id: string): Node | undefined => {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.type === 'group') {
        const inner = find(node.children, id);
        if (inner) return inner;
      }
    }
    return undefined;
  };
  const elementIn = (sceneId: string, id: string) =>
    find(sceneFor(sceneId).nodes, id) as never;

  const subscribeAll = (listener: () => void) => {
    const unsubscribes = [
      useLegacyKeyArrays.subscribe(listener),
      ...itemStores.map((store) => store.subscribe(listener)),
      useLayerGroupStore.subscribe(listener),
      pluginStore?.subscribe(listener) ?? (() => undefined),
    ];
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  };

  return {
    ...actual,
    useElementDocumentReady: () => true,
    getElementDocumentStore: () =>
      ({
        getRevision: () => 1,
        getScene: sceneFor,
        getSceneIds: () => {
          const keys = useLegacyKeyArrays.getState();
          return [
            ...new Set([
              ...Object.keys(keys.keyMappings),
              ...Object.keys(keys.canonicalPositions),
              ...Object.keys(keys.positions),
              ...itemStores.flatMap((store) =>
                Object.keys(store.getState().positions),
              ),
            ]),
          ];
        },
        getElement: elementIn,
        subscribe: subscribeAll,
        dispose: () => {},
      } as never),
    useElementDocumentScene: (sceneId: string) =>
      useSyncExternalStore(subscribeAll, () => sceneFor(sceneId)),
  };
};
