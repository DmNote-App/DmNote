// 새 요소의 빠진 고유 값·기능 묶음을 종류 기본값으로 채운다 - 엔진 넣기의 채우기와 같다(fixture로 고정).
// 넣기는 완성된 노드를 보내 낙관 화면과 확정 문서가 같게 한다
import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import {
  BUILTIN_BUNDLE_DEFAULTS,
  type JsonValue,
} from '@src/types/generated/elementDocument';
import { elementKindData } from '../defineElementKind';
import { elementKindDefinition } from './elementKindRegistry';

export const fillKindDefaults = (node: ElementNode): ElementNode => {
  const definition = elementKindDefinition(node.kind);
  if (!definition) return node;
  const { fields, bundles: bundleNames } = elementKindData(definition);
  const values: Record<string, JsonValue> = { ...node.values };
  for (const field of fields ?? []) {
    if (!(field.name in values)) {
      values[field.name] = (field.default ?? null) as JsonValue;
    }
  }
  const bundles: Record<string, JsonValue> = { ...node.bundles };
  for (const name of bundleNames ?? []) {
    if (!(name in bundles))
      bundles[name] = BUILTIN_BUNDLE_DEFAULTS[name] ?? null;
  }
  return {
    ...node,
    ...(Object.keys(values).length > 0 ? { values } : {}),
    ...(Object.keys(bundles).length > 0 ? { bundles } : {}),
  };
};
