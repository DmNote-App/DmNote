import { graphKind } from './definitions/graph';
import { keyKind } from './definitions/key';
import { knobKind } from './definitions/knob';
import { spriteKind } from './definitions/sprite';
import { statKind } from './definitions/stat';

// 내장 종류 - 순서는 EDITOR_ELEMENT_TYPES와 같다
export const BUILTIN_ELEMENT_KINDS = [
  keyKind,
  statKind,
  graphKind,
  knobKind,
  spriteKind,
] as const;

// 추출 스크립트가 읽는 정의 파일 목록 - 위 배열과 같은 순서
export const BUILTIN_ELEMENT_KIND_FILES = [
  'definitions/key.ts',
  'definitions/stat.ts',
  'definitions/graph.ts',
  'definitions/knob.ts',
  'definitions/sprite.ts',
] as const;
