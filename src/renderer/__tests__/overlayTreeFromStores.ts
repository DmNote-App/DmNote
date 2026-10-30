import { useKeyStore } from '@stores/data/useKeyStore';
import { useStatItemStore } from '@stores/data/useStatItemStore';
import { useGraphItemStore } from '@stores/data/useGraphItemStore';
import { useKnobItemStore } from '@stores/data/useKnobItemStore';
import { useSpriteStore } from '@stores/data/useSpriteStore';
import type { Node, Scene } from '@src/types/generated/elementDocument';

type RuntimeModule =
  typeof import('@src/renderer/editor/document/elementDocumentRuntime');

// 오버레이는 키·아이템 위치를 트리에서 읽는다 - 옛 스토어를 채우던 오버레이 테스트용으로
// 그 스토어 값으로 트리 장면을 만든다 (옛 위치 객체는 옛 칸에 그대로 싣는다)
//   vi.mock('@src/renderer/editor/document/elementDocumentRuntime', async (importOriginal) =>
//     (await import('@src/renderer/__tests__/overlayTreeFromStores')).treeFromStores(importOriginal));

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

let lastInputs: unknown[] = [];
let lastScene: Scene | undefined;

const sceneFor = (sceneId: string): Scene => {
  const keys = useKeyStore.getState();
  const inputs = [
    keys.keyMappings[sceneId],
    keys.positions[sceneId],
    useStatItemStore.getState().positions[sceneId],
    useGraphItemStore.getState().positions[sceneId],
    useKnobItemStore.getState().positions[sceneId],
    useSpriteStore.getState().positions[sceneId],
  ];
  // 같은 입력이면 같은 장면 (구독 스냅샷)
  if (
    lastScene &&
    inputs.length === lastInputs.length &&
    inputs.every((input, index) => input === lastInputs[index])
  ) {
    return lastScene;
  }
  const [slots = [], keyPositions = []] = inputs as [unknown[], Loose[]];
  const nodes: Node[] = (slots as unknown[]).map((slot, index) => ({
    ...(elementOf('key', keyPositions[index] ?? {}, index) as object),
    input: { type: 'key', slot },
  })) as Node[];
  (['stat', 'graph', 'knob', 'sprite'] as const).forEach((kind, offset) => {
    ((inputs[2 + offset] ?? []) as Loose[]).forEach((position, index) =>
      nodes.push(elementOf(kind, position, index)),
    );
  });
  lastInputs = inputs;
  lastScene = { nodes };
  return lastScene;
};

const subscribeAll = (listener: () => void) => {
  const unsubscribes = [
    useKeyStore.subscribe(listener),
    useStatItemStore.subscribe(listener),
    useGraphItemStore.subscribe(listener),
    useKnobItemStore.subscribe(listener),
    useSpriteStore.subscribe(listener),
  ];
  return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
};

export const treeFromStores = async (
  importOriginal: () => Promise<RuntimeModule>,
): Promise<RuntimeModule> => {
  const actual = await importOriginal();
  const { useSyncExternalStore } = await import('react');
  return {
    ...actual,
    useElementDocumentReady: () => true,
    useElementDocumentScene: (sceneId: string) =>
      useSyncExternalStore(subscribeAll, () => sceneFor(sceneId)),
  };
};
