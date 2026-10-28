import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// 사용자 CSS 공개 약속 - 문서(docs/content/*/custom-css)에 안내한 CSS 변수·data 속성·
// 앱 클래스가 렌더러 소스에 남아 있어야 한다. 요소 종류를 새 정의의 그리기 코드로
// 옮길 때 같은 이름을 쓰게 고정한다 (설계 문서 3.10)
const root = join(__dirname, '..');

const filesUnder = (dir: string, pattern: RegExp): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return filesUnder(path, pattern);
    return pattern.test(name) ? [path] : [];
  });

const docsText = (locale: string) =>
  filesUnder(join(root, 'docs/content', locale, 'custom-css'), /\.mdx$/)
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');

const rendererSource = filesUnder(join(root, 'src/renderer'), /\.(css|ts|tsx)$/)
  .filter((path) => !/\.test\.tsx?$/.test(path))
  .filter((path) => !relative(root, path).includes('benchmarks'))
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n');

const documentedVariables = (locale: string) =>
  new Set(
    [
      ...readFileSync(
        join(root, 'docs/content', locale, 'custom-css/variables/page.mdx'),
        'utf8',
      ).matchAll(/^\|\s*`(--[a-z0-9-]+)`/gm),
    ].map((match) => match[1]),
  );

const documentedDataAttributes = (locale: string) =>
  new Set(
    [...docsText(locale).matchAll(/\[(data-[a-z0-9-]+)/g)].map(
      (match) => match[1],
    ),
  );

// 문서 예시의 클래스 중 앱이 붙이는 것 - 나머지(.kps-graph, .my-key 등)는
// 사용자가 속성 패널에서 직접 붙이는 클래스 이름 예시
const APP_CLASSES = ['counter'];

describe('사용자 CSS 공개 약속', () => {
  it('문서의 CSS 변수가 한국어·영어에서 같다', () => {
    expect([...documentedVariables('en')].sort()).toEqual(
      [...documentedVariables('ko')].sort(),
    );
    expect(documentedVariables('ko').size).toBeGreaterThanOrEqual(41);
  });

  it('문서의 CSS 변수는 렌더러가 읽는다', () => {
    const missing = [...documentedVariables('ko')].filter(
      (name) => !rendererSource.includes(name),
    );
    expect(missing).toEqual([]);
  });

  it('문서의 data 속성은 렌더러가 붙인다', () => {
    const attributes = new Set([
      ...documentedDataAttributes('ko'),
      ...documentedDataAttributes('en'),
    ]);
    expect(attributes.size).toBeGreaterThan(0);
    const missing = [...attributes].filter(
      (name) => !rendererSource.includes(name),
    );
    expect(missing).toEqual([]);
  });

  it('문서의 앱 클래스는 렌더러가 붙인다', () => {
    const docs = docsText('ko');
    for (const name of APP_CLASSES) {
      expect(docs).toContain(`.${name}`);
      expect(rendererSource).toMatch(
        new RegExp(`(className=|classList|class=)[^\\n]*\\b${name}\\b`),
      );
    }
  });
});
