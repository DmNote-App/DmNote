import { describe, expect, it } from 'vitest';
import { buildNoteShaders } from './noteShaders';

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const borderMask = (distanceFromEdge: number, borderWidth: number): number => {
  const signedDistance = -distanceFromEdge;
  const outerMask = clamp01(1 - signedDistance);
  const innerMask = clamp01(1 - (signedDistance + borderWidth));
  return outerMask - innerMask;
};

const edgeCoverage = (
  left: number,
  width: number,
  borderWidth: number,
  halo: number,
): { left: number; right: number } => {
  const right = left + width;
  let leftCoverage = 0;
  let rightCoverage = 0;

  for (
    let pixel = Math.floor(left) - 4;
    pixel <= Math.ceil(right) + 4;
    pixel += 1
  ) {
    const sampleX = pixel + 0.5;
    if (sampleX < left - halo || sampleX >= right + halo) continue;
    const fromLeft = sampleX - left;
    const fromRight = right - sampleX;
    if (fromLeft > -1 && fromLeft < borderWidth + 1) {
      leftCoverage += borderMask(fromLeft, borderWidth);
    }
    if (fromRight > -1 && fromRight < borderWidth + 1) {
      rightCoverage += borderMask(fromRight, borderWidth);
    }
  }

  return { left: leftCoverage, right: rightCoverage };
};

describe('WebGL 노트 쿼드 AA halo', () => {
  it('분수 좌표에서도 테두리 양쪽의 1px AA를 같은 면적으로 보존한다', () => {
    const clipped = edgeCoverage(50.501, 118, 2, 0);
    expect(Math.abs(clipped.left - clipped.right)).toBeGreaterThan(0.9);

    for (const phase of [0.001, 0.125, 0.25, 0.499, 0.501, 0.75, 0.999]) {
      const covered = edgeCoverage(50 + phase, 118, 2, 1);
      expect(covered.left).toBeCloseTo(2, 10);
      expect(covered.right).toBeCloseTo(2, 10);
    }
  });

  it('vertex shader가 길이 있는 노트에 최소 1px halo를 확보한다', () => {
    const { vertex } = buildNoteShaders({ webgl2: true, lutRows: 256 });
    expect(vertex).toContain(
      'float edgeAAHalo = noteLength > 0.0 ? 1.0 : 0.0;',
    );
    expect(vertex).toContain('float quadHalo = max(glowSize, edgeAAHalo);');
    expect(vertex).toContain('noteWidth + quadHalo * 2.0');
    expect(vertex).toContain('noteLength + quadHalo * 2.0');
    expect(vertex).toContain(
      'vec2 halfSize = vec2(noteWidth, noteLength) * 0.5',
    );
  });
});

describe('노트 셰이더 소스', () => {
  it('WebGL2는 GLSL ES 3.00으로, LUT를 명시적 LOD로 샘플한다', () => {
    const { vertex, fragment } = buildNoteShaders({
      webgl2: true,
      lutRows: 256,
    });
    // #version은 첫 줄이어야 컴파일된다
    expect(vertex.startsWith('#version 300 es\n')).toBe(true);
    expect(fragment.startsWith('#version 300 es\n')).toBe(true);
    // 암시적 미분 샘플은 분기가 펼쳐져 그라데이션 없는 노트도 샘플 비용을 낸다
    expect(fragment).toContain('textureLod(lut, uv, 0.0)');
    expect(fragment).not.toContain('texture2D');
    expect(fragment).not.toContain('gl_FragColor');
  });

  it('WebGL1 폴백은 같은 본문을 GLSL ES 1.00으로 낸다', () => {
    const webgl1 = buildNoteShaders({ webgl2: false, lutRows: 256 });
    const webgl2 = buildNoteShaders({ webgl2: true, lutRows: 256 });
    expect(webgl1.vertex).not.toContain('#version');
    expect(webgl1.fragment).toContain('texture2D(lut, uv)');
    expect(webgl1.fragment).toContain('#define FRAG_COLOR gl_FragColor');

    const body = (source: string) =>
      source.slice(source.indexOf('\n  uniform'));
    expect(body(webgl1.vertex)).toBe(body(webgl2.vertex));
    expect(body(webgl1.fragment)).toBe(body(webgl2.fragment));
  });

  it('LUT 행 수를 실수 리터럴로 넘긴다', () => {
    const { vertex } = buildNoteShaders({ webgl2: true, lutRows: 128 });
    expect(vertex).toContain('#define LUT_ROWS 128.0\n');
  });

  it('렌더러가 넘기는 인스턴스 속성을 모두 선언한다', () => {
    const { vertex } = buildNoteShaders({ webgl2: true, lutRows: 256 });
    for (const name of [
      'noteInfo',
      'noteSize',
      'noteDir',
      'noteColorTop',
      'noteColorBottom',
      'noteRadius',
      'noteGlow',
      'noteGlowColorTop',
      'noteGlowColorBottom',
      'noteBorder',
      'noteBorderOpacity',
      'noteBorderGradientInfo',
      'noteBodyPaint',
      'noteGlowPaint',
    ]) {
      expect(vertex).toMatch(new RegExp(`ATTRIBUTE \\w+ ${name};`));
    }
  });
});
