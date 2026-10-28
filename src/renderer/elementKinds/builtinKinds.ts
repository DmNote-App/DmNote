import { cursorTrackerKind } from './definitions/cursorTracker';
import { graphKind } from './definitions/graph';
import { keyKind } from './definitions/key';
import { knobKind } from './definitions/knob';
import { spriteKind } from './definitions/sprite';
import { statKind } from './definitions/stat';

// 내장 종류 - 앞 다섯은 EDITOR_ELEMENT_TYPES와 같은 순서(옛 저장 모양으로 관리),
// 그 뒤는 트리 문서에만 있는 종류
export const BUILTIN_ELEMENT_KINDS = [
  keyKind,
  statKind,
  graphKind,
  knobKind,
  spriteKind,
  cursorTrackerKind,
] as const;

// 추출 스크립트가 읽는 정의 파일 목록 - 위 배열과 같은 순서
export const BUILTIN_ELEMENT_KIND_FILES = [
  'definitions/key.ts',
  'definitions/stat.ts',
  'definitions/graph.ts',
  'definitions/knob.ts',
  'definitions/sprite.ts',
  'definitions/cursorTracker.ts',
] as const;
