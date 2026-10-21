import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8');

const tokensCss = read('src/renderer/styles/tokens.css');
const baseCss = read('src/renderer/styles/tokens/base.css');
const darkCss = read('src/renderer/styles/tokens/dark.css');
const lightCss = read('src/renderer/styles/tokens/light.css');
const mainCss = read('src/renderer/styles/main.css');
const globalCss = read('src/renderer/styles/global.css');
const tailwindConfig = read('tailwind.config.js');

const themes: [string, string][] = [
  ['dark', darkCss],
  ['light', lightCss],
];

const declared = (css: string, token: string): string | null => {
  const match = css.match(new RegExp(`${token}:\\s*([^;]+);`));
  return match ? match[1].trim() : null;
};

describe('canvas 위 glass 표면 계약', () => {
  it('일반 glass와 분리된 밝기·대비·채도 clamp를 가진다', () => {
    // 캔버스는 사용자가 만든 임의 밝기라 일반 표면과 다른 세기가 필요하다.
    // 값이 같아지면 분리해 둔 이유가 사라지므로 다르다는 것 자체를 계약으로 고정
    for (const [name, css] of themes) {
      for (const dial of ['dim', 'contrast', 'sat']) {
        const base = declared(css, `--ui-glass-backdrop-${dial}`);
        const canvas = declared(css, `--ui-glass-canvas-backdrop-${dial}`);
        expect(base, `${name} ${dial}`).not.toBeNull();
        expect(canvas, `${name} canvas ${dial}`).not.toBeNull();
      }
      expect(
        declared(css, '--ui-glass-canvas-backdrop-sat'),
        `${name} canvas sat`,
      ).not.toBe(declared(css, '--ui-glass-backdrop-sat'));
    }
    expect(mainCss).toContain(
      ':where(.backdrop-glass-canvas).backdrop-glass {',
    );
    expect(mainCss).toContain(
      ':where(.backdrop-glass-canvas).backdrop-glass-popup {',
    );
  });

  it('필터 체인이 세 다이얼을 모두 소비한다', () => {
    // 토큰만 늘리고 체인에 안 넣으면 라이트의 범위 압축이 조용히 죽는다
    const filters: string[] = mainCss.match(/backdrop-filter:[^;]+;/g) ?? [];
    const clamped = filters.filter((rule) => rule.includes('brightness('));
    expect(clamped.length).toBeGreaterThan(0);
    for (const rule of clamped) {
      expect(rule).toContain('contrast(');
      expect(rule).toContain('saturate(');
    }
  });

  // Windows 투명 효과는 접근성이 아니라 개인 설정 토글이고 배터리 절약 모드가 임의로 끈다
  it('OS 투명도 축소 설정으로 글래스를 강등하지 않는다', () => {
    // 결정 근거 주석은 쿼리 이름을 그대로 적어두므로 규칙만 남기고 검사
    const rulesOnly = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
    // 메인 창이 로드하는 시트 전부
    for (const css of [
      mainCss,
      tokensCss,
      baseCss,
      darkCss,
      lightCss,
      globalCss,
    ]) {
      expect(rulesOnly(css)).not.toContain('prefers-reduced-transparency');
    }
  });

  it('글래스 표면이 접두사 없는 backdrop-filter를 유지한다', () => {
    // WebView2는 표준 속성을 읽는다. 규칙 본문만 잘라 접두사 선언만 남는 회귀를 잡는다
    const ruleBody = (className: string) =>
      mainCss.match(new RegExp(`^\\.${className} \\{([^}]*)\\}`, 'm'))?.[1] ??
      '';
    for (const className of [
      'backdrop-glass',
      'backdrop-glass-popup',
      'backdrop-glass-scrim',
    ]) {
      expect(ruleBody(className)).toMatch(/\n\s*backdrop-filter:\s*blur\(/);
    }
  });

  it('popup 전용 짧은 shadow가 두 테마에 모두 연결된다', () => {
    for (const [name, css] of themes) {
      const popup = declared(css, '--ui-shadow-popup');
      const modal = declared(css, '--ui-shadow-3');
      expect(popup, `${name} popup`).not.toBeNull();
      // 팝업은 모달의 넓은 번짐을 재사용하지 않는다
      expect(popup, `${name} popup`).not.toBe(modal);
    }
    expect(tailwindConfig).toContain(
      "'elevation-popup': 'var(--ui-shadow-popup)'",
    );
  });

  it('루미노시티 레이어의 목표 휘도가 glass 틴트와 같은 색이다', () => {
    // 틴트만 올리고 여기를 두면 캡이 휘도를 도로 끌어당긴다
    for (const [name, css] of themes) {
      const tint = declared(css, '--ui-glass-backdrop-lum-tint');
      const glass = declared(css, '--ui-glass');
      expect(tint, `${name} lum tint`).toMatch(/^#[0-9a-f]{6}$/);
      const [r, g, b] = [1, 3, 5].map((i) =>
        parseInt((tint as string).slice(i, i + 2), 16),
      );
      expect(glass, `${name} glass`).toContain(`rgba(${r}, ${g}, ${b},`);
    }
  });
});
