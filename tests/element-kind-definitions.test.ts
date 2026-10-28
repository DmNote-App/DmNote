import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  extractBuiltinKinds,
  extractDefinition,
  OUTPUT_PATH,
} from '../scripts/extract-element-kinds.mjs';
import { BUILTIN_ELEMENT_KINDS } from '../src/renderer/elementKinds/builtinKinds';
import { elementKindData } from '../src/renderer/elementKinds/defineElementKind';
import { EDITOR_ELEMENT_TYPES } from '../src/types/editor';
import { ELEMENT_KIND_MODELS } from '../src/types/elementKinds';
import { DEFAULT_SPRITE_SIZE } from '../src/types/key/sprites';

// 종류 정의(TS)에서 뽑은 데이터를 Rust가 include_str!로 읽는다
// (src-tauri/src/models/element_kinds.rs) - 추출 결과가 커밋본과 같아야 한다
describe('요소 종류 정의 추출', () => {
  it('커밋된 추출 결과가 정의 파일과 같다', () => {
    expect(readFileSync(OUTPUT_PATH, 'utf8')).toBe(extractBuiltinKinds());
  });

  it('구문 트리로 읽은 데이터가 실행 시 정의와 같다', () => {
    const extracted = JSON.parse(extractBuiltinKinds()) as unknown[];
    expect(extracted).toEqual(
      BUILTIN_ELEMENT_KINDS.map((definition) =>
        JSON.parse(JSON.stringify(elementKindData(definition))),
      ),
    );
  });

  it('내장 종류 목록과 크기가 기존 종류 모델과 같다', () => {
    expect(BUILTIN_ELEMENT_KINDS.map((definition) => definition.kind)).toEqual([
      ...EDITOR_ELEMENT_TYPES,
    ]);
    for (const definition of BUILTIN_ELEMENT_KINDS) {
      const model = ELEMENT_KIND_MODELS[definition.kind];
      expect(definition.defaultSize).toEqual(model.defaultSize);
      expect(definition.fallbackSize).toEqual(model.fallbackSize);
    }
    const sprite = BUILTIN_ELEMENT_KINDS.find(
      (definition) => definition.kind === 'sprite',
    );
    expect(sprite?.defaultSize.width).toBe(DEFAULT_SPRITE_SIZE);
  });

  it('데이터 칸에 함수나 외부 값이 섞이면 실패한다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dmn-kinds-'));
    try {
      const write = (body: string) => {
        const path = join(dir, 'kind.ts');
        writeFileSync(path, body);
        return () => extractDefinition(path);
      };
      expect(
        write(
          `defineElementKind({ kind: 'a', version: 1, fields: [{ name: 'x', value: { type: 'bool' }, default: () => true }] });`,
        ),
      ).toThrow(/리터럴/);
      expect(
        write(
          `import { LIMIT } from './x';\ndefineElementKind({ kind: 'a', version: 1, maxPerScene: LIMIT });`,
        ),
      ).toThrow(/상수 리터럴/);
      expect(
        write(
          `const n = 3;\ndefineElementKind({ kind: 'a', version: 1, maxPerScene: n, render: () => null });`,
        )(),
      ).toEqual({ kind: 'a', version: 1, maxPerScene: 3 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
