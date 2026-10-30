import { isNativeElementId } from '../../model/elementId';
import type { NativeElementType } from '../../model/elementIdMap';
import { commitSemanticOps } from './editorSemanticOps';
import type { EditorElementPropertyPatchV1 } from '@src/types/editor';

// 빈 목록·비 native id·중복 id는 커밋 대상이 아니다
const hasCommittableTargets = (targets: readonly { id: string }[]): boolean =>
  targets.length > 0 &&
  targets.every(({ id }) => isNativeElementId(id)) &&
  new Set(targets.map(({ id }) => id)).size === targets.length;

export const patchElementPropertyById = (
  type: NativeElementType,
  id: string,
  patch: EditorElementPropertyPatchV1,
  options: { gestureId?: string; preflight?: () => void } = {},
): Promise<boolean> => {
  if (!isNativeElementId(id)) return Promise.resolve(false);
  const ops = [{ kind: 'patchElement' as const, elementType: type, id, patch }];
  // 트리로 갈 겉모습 칸은 대기 중인 트리 편집이 얹는다
  return commitSemanticOps(ops, {
    ...(options.gestureId ? { gestureId: options.gestureId } : {}),
    preflight: options.preflight,
  }).then((outcome) => outcome.opResults[0]?.status !== 'targetMissing');
};

interface ElementPropertyTarget {
  elementType: NativeElementType;
  id: string;
}

export interface PropertyCommitOptions {
  gestureId?: string;
  preflight?: () => void;
}

// 공용 다건 경로: 빈 목록·비 native id·중복 id를 거르고 같은 property patch를
// 전 대상에 eager+wire로 커밋한다. 속성별 기계적 래퍼는 전부 여기로 위임하고
// value 타입은 판별 유니온 patch가 컴파일 타임에 강제한다
export const patchElementPropertyByTargets = (
  targets: readonly ElementPropertyTarget[],
  patch: EditorElementPropertyPatchV1,
  options: PropertyCommitOptions = {},
): Promise<boolean> => {
  if (!hasCommittableTargets(targets)) return Promise.resolve(false);
  const ops = targets.map(({ elementType, id }) => ({
    kind: 'patchElement' as const,
    elementType,
    id,
    patch,
  }));
  return commitSemanticOps(ops, {
    ...(options.gestureId ? { gestureId: options.gestureId } : {}),
    preflight: options.preflight,
  }).then((outcome) =>
    outcome.opResults.some((result) => result.status !== 'targetMissing'),
  );
};

export const idTargets = (
  elementType: NativeElementType,
  ids: readonly string[],
): ElementPropertyTarget[] => ids.map((id) => ({ elementType, id }));

export const patchElementHiddenById = (
  type: NativeElementType,
  id: string,
  hidden: boolean,
  options: { preflight?: () => void } = {},
): Promise<boolean> =>
  patchElementPropertyById(
    type,
    id,
    { property: 'hidden', value: hidden },
    options,
  );
