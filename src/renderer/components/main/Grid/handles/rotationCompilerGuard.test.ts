/**
 * React Compiler 회귀 가드 - 회전 핸들·패널 입력은 컴파일 대상으로 남는다
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { transformSync } from '@babel/core';
import { describe, expect, it } from 'vitest';

const compile = (relativePath: string): string => {
  const filename = resolve(process.cwd(), relativePath);
  const result = transformSync(readFileSync(filename, 'utf8'), {
    filename,
    configFile: false,
    babelrc: false,
    parserOpts: { plugins: ['jsx', 'typescript'] },
    plugins: [['babel-plugin-react-compiler', {}]],
  });
  return result?.code ?? '';
};

const COMPILED = [
  'src/renderer/components/main/Grid/handles/CanvasRotateHandle.tsx',
  'src/renderer/components/main/Grid/PropertiesPanel/batch/geometry/SelectionRotationInput.tsx',
];

describe('요소 회전 컴파일러 가드', () => {
  it.each(COMPILED)('%s는 컴파일 대상으로 남는다', (path) => {
    expect(compile(path)).toContain('react/compiler-runtime');
  });
});
