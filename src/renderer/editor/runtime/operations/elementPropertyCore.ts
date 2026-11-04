import { isNativeElementId } from '../../model/elementId';
import type { NativeElementType } from '../../model/elementIdMap';
import { commitPropertyPatch } from './treeEditCommit';
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
  // 겉모습 칸은 대기 중인 트리 편집까지 얹은 지금 값에서 계산한다
  return commitPropertyPatch([{ elementType: type, id }], patch, {
    ...(options.gestureId ? { gestureId: options.gestureId } : {}),
    preflight: options.preflight,
  }).then(([status]) => status !== 'targetMissing');
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
// 전 대상에 트리 커밋 하나로 보낸다. 속성별 기계적 래퍼는 전부 여기로 위임하고
// value 타입은 판별 유니온 patch가 컴파일 타임에 강제한다
export const patchElementPropertyByTargets = (
  targets: readonly ElementPropertyTarget[],
  patch: EditorElementPropertyPatchV1,
  options: PropertyCommitOptions = {},
): Promise<boolean> => {
  if (!hasCommittableTargets(targets)) return Promise.resolve(false);
  return commitPropertyPatch(targets, patch, {
    ...(options.gestureId ? { gestureId: options.gestureId } : {}),
    preflight: options.preflight,
  }).then((statuses) => statuses.some((status) => status !== 'targetMissing'));
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
