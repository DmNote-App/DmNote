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
  const [{ useKeyStore }, stat, graph, knob, sprite] = await Promise.all([
    import('@stores/data/useKeyStore'),
    import('@stores/data/useStatItemStore'),
    import('@stores/data/useGraphItemStore'),
    import('@stores/data/useKnobItemStore'),
    import('@stores/data/useSpriteStore'),
  ]);
  const itemStores = [
    stat.useStatItemStore,
    graph.useGraphItemStore,
    knob.useKnobItemStore,
    sprite.useSpriteStore,
  ] as const;
  const lastByScene = new Map<string, { inputs: unknown[]; scene: Scene }>();

  const sceneFor = (sceneId: string): Scene => {
    const keys = useKeyStore.getState();
    // 키 위치 - canonical을 채운 테스트(패널)는 그것, 아니면 보이는 위치(오버레이)
    const keyPositions = keys.canonicalPositions[sceneId]?.length
      ? keys.canonicalPositions[sceneId]
      : keys.positions[sceneId];
    const inputs = [
      keys.keyMappings[sceneId],
      keyPositions,
      ...itemStores.map((store) => store.getState().positions[sceneId]),
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
    const scene: Scene = { nodes };
    lastByScene.set(sceneId, { inputs, scene });
    return scene;
  };

  const elementIn = (sceneId: string, id: string) =>
    sceneFor(sceneId).nodes.find((node) => node.id === id) as never;

  const subscribeAll = (listener: () => void) => {
    const unsubscribes = [
      useKeyStore.subscribe(listener),
      ...itemStores.map((store) => store.subscribe(listener)),
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
        getElement: elementIn,
        subscribe: subscribeAll,
        dispose: () => {},
      } as never),
    useElementDocumentScene: (sceneId: string) =>
      useSyncExternalStore(subscribeAll, () => sceneFor(sceneId)),
  };
};
