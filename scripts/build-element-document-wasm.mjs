// 편집 창이 쓰는 요소 문서 엔진 WASM 빌드 - 결과는 src/renderer/wasm/elementDocument에 커밋한다
// 필요: rustup target add wasm32-unknown-unknown, wasm-bindgen-cli 0.2.126
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const manifest = resolve(root, 'src-tauri/Cargo.toml');
const outDir = resolve(root, 'src/renderer/wasm/elementDocument');

execFileSync(
  'cargo',
  [
    'build',
    '--manifest-path',
    manifest,
    '-p',
    'element-document-wasm',
    '--target',
    'wasm32-unknown-unknown',
    '--release',
  ],
  { stdio: 'inherit' },
);
execFileSync(
  'wasm-bindgen',
  [
    '--target',
    'web',
    '--out-dir',
    outDir,
    '--out-name',
    'elementDocument',
    resolve(
      root,
      'src-tauri/target/wasm32-unknown-unknown/release/element_document_wasm.wasm',
    ),
  ],
  { stdio: 'inherit' },
);
console.info(`저장: ${outDir}`);
