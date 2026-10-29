import type {
  Document,
  DocumentPatch,
  Node,
  Scene,
} from '@src/types/generated/elementDocument';

export type ElementNode = Extract<Node, { type: 'element' }>;

// 트리를 깊이 우선(겹치는 순서, 아래→위)으로 돈다
export const walkNodes = (
  nodes: readonly Node[],
  visit: (node: Node, depth: number) => void,
  depth = 0,
) => {
  for (const node of nodes) {
    visit(node, depth);
    if (node.type === 'group') walkNodes(node.children, visit, depth + 1);
  }
};

export const sceneElements = (scene: Scene): ElementNode[] => {
  const elements: ElementNode[] = [];
  walkNodes(scene.nodes, (node) => {
    if (node.type === 'element') elements.push(node);
  });
  return elements;
};

const replaceNode = (nodes: Node[], next: Node): boolean => {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node.id === next.id && node.type === next.type) {
      nodes[index] =
        node.type === 'group' && next.type === 'group'
          ? { ...next, children: node.children }
          : next;
      return true;
    }
    if (node.type === 'group') {
      const children = [...node.children];
      if (replaceNode(children, next)) {
        nodes[index] = { ...node, children };
        return true;
      }
    }
  }
  return false;
};

// 백엔드 패치 적용 - Rust element_document::patch::apply_patch와 같은 규칙
// (창에는 엔진을 싣지 않으므로 패치만 JS로 적용한다)
export const applyDocumentPatch = (
  document: Document,
  patch: DocumentPatch,
): Document => {
  const scenes = { ...document.scenes };
  for (const [sceneId, scenePatch] of Object.entries(patch.scenes)) {
    if (!scenePatch) continue;
    if (scenePatch.type === 'delete') {
      delete scenes[sceneId];
      continue;
    }
    if (scenePatch.type === 'replace') {
      scenes[sceneId] = scenePatch.scene;
      continue;
    }
    const current = scenes[sceneId];
    if (!current) continue;
    const nodes = [...current.nodes];
    for (const node of scenePatch.nodes) replaceNode(nodes, node);
    scenes[sceneId] = { ...current, nodes };
  }
  return { ...document, kindVersions: patch.kindVersions, scenes };
};
