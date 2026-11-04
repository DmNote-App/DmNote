// 테스트 꾸미기 - 옛 위치 모양 값으로 트리 장면을 만든다. 종류가 가진 칸은 고유 값·기능 묶음·입력에,
// 나머지 옛 칸은 legacy.fields에 싣는다. 기본값은 채우지 않아 옛 모양 보기(legacyPositionOf)가 준 값과 같다.
// 가짜 백엔드(fakeElementDocumentBackend)에 올려 실제 트리 스토어·런타임으로 읽게 한다
import { elementKindData } from '@src/renderer/elementKinds/defineElementKind';
import { elementKindDefinition } from '@src/renderer/elementKinds/runtime/elementKindRegistry';
import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import { PLUGIN_KIND_PREFIX } from '@src/types/elementKinds';
import {
  BUILTIN_BUNDLE_FIELDS,
  type Document,
  type JsonValue,
  type Node,
  type Scene,
} from '@src/types/generated/elementDocument';
import type { FakeElementDocumentBackend } from './fakeElementDocumentBackend';

type LegacyPosition = Record<string, unknown>;

/** 트리에 든 플러그인 요소 - id는 전체 id(`플러그인::요소`) */
export interface LegacyShapedPlugin {
  id: string;
  pluginId: string;
  groupId?: string;
}

// 틀로 가는 옛 칸
const FRAME_FIELDS = new Set(['id', 'dx', 'dy', 'width', 'height', 'rotation']);

/** 옛 위치 하나 → 트리 요소 (id가 없으면 `{종류}-{순번}`) */
export const legacyShapedNode = (
  kind: string,
  position: LegacyPosition,
  index: number,
  slot?: JsonValue,
): ElementNode => {
  const definition = elementKindDefinition(kind);
  const { fields, bundles: bundleNames } = definition
    ? elementKindData(definition)
    : { fields: [], bundles: [] };
  const valueNames = new Set((fields ?? []).map((field) => field.name));
  const bundleOf = new Map<string, string>();
  for (const name of bundleNames ?? []) {
    for (const field of BUILTIN_BUNDLE_FIELDS[
      name as keyof typeof BUILTIN_BUNDLE_FIELDS
    ] ?? []) {
      bundleOf.set(field, name);
    }
  }
  const values: Record<string, JsonValue> = {};
  const bundles: Record<string, Record<string, JsonValue>> = {};
  const legacyFields: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(position)) {
    if (FRAME_FIELDS.has(field) || field === 'hidden' || value === undefined) {
      continue;
    }
    if (kind === 'knob' && field === 'axisId' && typeof value === 'string') {
      continue;
    }
    // 공통 정보 - 값이 있으면 공통 정보 칸, 비었으면(null) 옛 칸에 그대로
    if (
      (field === 'layerName' && typeof value === 'string') ||
      (field === 'className' && typeof value === 'string') ||
      (field === 'useInlineStyles' && typeof value === 'boolean')
    ) {
      continue;
    }
    const bundle = bundleOf.get(field);
    if (valueNames.has(field)) values[field] = value as JsonValue;
    else if (bundle) (bundles[bundle] ??= {})[field] = value as JsonValue;
    else legacyFields[field] = value;
  }
  const axisId = kind === 'knob' ? position.axisId : undefined;
  return {
    type: 'element',
    id: (position.id as string | undefined) ?? `${kind}-${index}`,
    kind,
    frame: {
      x: Number(position.dx ?? 0),
      y: Number(position.dy ?? 0),
      width: Number(position.width ?? 60),
      height: Number(position.height ?? 60),
      rotation: Number(position.rotation ?? 0),
    },
    hidden: position.hidden === true,
    ...(typeof position.layerName === 'string'
      ? { name: position.layerName }
      : {}),
    ...(typeof position.className === 'string'
      ? { className: position.className }
      : {}),
    ...(typeof position.useInlineStyles === 'boolean'
      ? { useInlineStyles: position.useInlineStyles }
      : {}),
    ...(Object.keys(values).length > 0 ? { values } : {}),
    ...(Object.keys(bundles).length > 0 ? { bundles } : {}),
    ...(kind === 'key' ? { input: { type: 'key', slot: slot ?? '' } } : {}),
    ...(typeof axisId === 'string' ? { input: { type: 'axis', axisId } } : {}),
    legacy: {
      index,
      ...(Object.keys(legacyFields).length > 0 ? { fields: legacyFields } : {}),
    },
  } as unknown as ElementNode;
};

/** 탭 하나의 옛 모양 목록 */
export interface LegacySceneInput {
  // 키 슬롯 - 없으면 위치마다 빈 슬롯
  keyMappings?: JsonValue[];
  keys?: LegacyPosition[];
  stats?: LegacyPosition[];
  graphs?: LegacyPosition[];
  knobs?: LegacyPosition[];
  sprites?: LegacyPosition[];
  plugins?: LegacyShapedPlugin[];
  // 옛 그룹 - groupId가 같은 요소를 그룹 노드로 묶는다 (정의가 있는 그룹만)
  layerGroups?: { id: string; name: string }[];
}

/** 옛 모양 목록 → 장면 - 키(슬롯 순서) · 스탯 · 그래프 · 노브 · 스프라이트 · 플러그인 순, 그룹은 끝에 */
export const legacyShapedScene = ({
  keyMappings,
  keys = [],
  stats = [],
  graphs = [],
  knobs = [],
  sprites = [],
  plugins = [],
  layerGroups = [],
}: LegacySceneInput): Scene => {
  const slots = keyMappings ?? keys.map(() => '');
  const nodes: Node[] = [
    ...slots.map((slot, index) =>
      legacyShapedNode('key', keys[index] ?? {}, index, slot),
    ),
    ...stats.map((position, index) =>
      legacyShapedNode('stat', position, index),
    ),
    ...graphs.map((position, index) =>
      legacyShapedNode('graph', position, index),
    ),
    ...knobs.map((position, index) =>
      legacyShapedNode('knob', position, index),
    ),
    ...sprites.map((position, index) =>
      legacyShapedNode('sprite', position, index),
    ),
    ...plugins.map(({ pluginId, ...position }, index) =>
      legacyShapedNode(`${PLUGIN_KIND_PREFIX}${pluginId}`, position, index),
    ),
  ] as Node[];
  const groupOf = (node: Node) =>
    (node as { legacy?: { fields?: { groupId?: unknown } } }).legacy?.fields
      ?.groupId;
  const grouped = new Set(
    nodes.filter((node) =>
      layerGroups.some((group) => group.id === groupOf(node)),
    ),
  );
  const roots = nodes.filter((node) => !grouped.has(node));
  for (const group of layerGroups) {
    const children = nodes.filter((node) => groupOf(node) === group.id);
    if (children.length > 0) {
      roots.push({
        type: 'group',
        id: group.id,
        name: group.name,
        children,
      } as Node);
    }
  }
  return { nodes: roots };
};

type ByScene<T> = Record<string, readonly T[] | undefined>;

/** 옛 스토어 모양 갱신으로 가짜 백엔드 문서를 바꾼다 (다른 창·되돌리기처럼). 칸마다 통째로 바꾸는 것도
 * 옛 스토어 setState와 같다 - 키 위치는 canonical이 비지 않았으면 canonical, 아니면 보이는 위치 */
export const legacyShapedSeed = (backend: () => FakeElementDocumentBackend) => {
  const empty = () => ({
    keyMappings: {} as ByScene<unknown>,
    canonicalPositions: {} as ByScene<LegacyPosition>,
    positions: {} as ByScene<LegacyPosition>,
    stats: {} as ByScene<LegacyPosition>,
    graphs: {} as ByScene<LegacyPosition>,
    knobs: {} as ByScene<LegacyPosition>,
    sprites: {} as ByScene<LegacyPosition>,
    plugins: {} as ByScene<LegacyShapedPlugin>,
    layerGroups: {} as ByScene<{ id: string; name: string }>,
  });
  let state = empty();
  const publish = () => {
    const sceneIds = new Set(
      Object.values(state).flatMap((byScene) => Object.keys(byScene)),
    );
    const document: Document = {
      formatVersion: 1,
      kindVersions: {},
      scenes: Object.fromEntries(
        [...sceneIds].map((sceneId) => {
          const canonical = state.canonicalPositions[sceneId];
          return [
            sceneId,
            legacyShapedScene({
              keyMappings: state.keyMappings[sceneId] as JsonValue[],
              keys: [
                ...(canonical?.length
                  ? canonical
                  : state.positions[sceneId] ?? []),
              ],
              stats: [...(state.stats[sceneId] ?? [])],
              graphs: [...(state.graphs[sceneId] ?? [])],
              knobs: [...(state.knobs[sceneId] ?? [])],
              sprites: [...(state.sprites[sceneId] ?? [])],
              plugins: [...(state.plugins[sceneId] ?? [])],
              layerGroups: [...(state.layerGroups[sceneId] ?? [])],
            }),
          ];
        }),
      ),
    };
    backend().replace(() => document);
  };
  const setItems = (
    kind: 'stats' | 'graphs' | 'knobs' | 'sprites',
    positions: ByScene<object>,
  ) => {
    state = { ...state, [kind]: positions as ByScene<LegacyPosition> };
    publish();
  };
  return {
    /** 옛 키 배열 - 키 매핑·canonical·보이는 위치 (준 칸만 바꾼다) */
    keys: (update: {
      keyMappings?: ByScene<unknown>;
      canonicalPositions?: ByScene<object>;
      positions?: ByScene<object>;
    }) => {
      state = {
        ...state,
        ...Object.fromEntries(
          Object.entries(update).filter(([, value]) => value !== undefined),
        ),
      };
      publish();
    },
    /** 옛 종류 위치 목록 - 옛 아이템 스토어 setState와 같은 모양 (통째로) */
    stats: ({ positions }: { positions: ByScene<object> }) =>
      setItems('stats', positions),
    graphs: ({ positions }: { positions: ByScene<object> }) =>
      setItems('graphs', positions),
    knobs: ({ positions }: { positions: ByScene<object> }) =>
      setItems('knobs', positions),
    sprites: ({ positions }: { positions: ByScene<object> }) =>
      setItems('sprites', positions),
    /** 트리에 든 플러그인 요소 (통째로) */
    plugins: (plugins: ByScene<LegacyShapedPlugin>) => {
      state = { ...state, plugins };
      publish();
    },
    /** 옛 그룹 - 옛 그룹 스토어 setState와 같은 모양 (통째로) */
    layerGroups: ({
      layerGroups,
    }: {
      layerGroups: ByScene<{ id: string; name: string }>;
    }) => {
      state = { ...state, layerGroups };
      publish();
    },
    /** 지금 꾸민 목록 */
    current: () => state,
    reset: () => {
      state = empty();
      publish();
    },
  };
};
