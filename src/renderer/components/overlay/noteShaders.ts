// 노트 트랙 셰이더. 본문은 GLSL ES 1.00/3.00 공용이고 차이는 프리루드 매크로로 흡수한다.
// fragment 비용이 글로우 halo 면적에 비례하므로 픽셀마다 하는 일을 줄이는 구성:
// - 노트별 상수(테두리 디코딩·반경 클램프·그라데이션 투영 계수)는 vertex에서 한 번만 계산
// - LUT 샘플은 명시적 LOD - 암시적 미분 샘플은 분기 안에 있어도 컴파일러가 분기를 펼쳐
//   그라데이션을 안 쓰는 노트까지 매 픽셀 샘플 비용을 낸다
// - halo 구간은 본체·테두리 계산 없이 글로우만 출력

const vertexBody = `
  ATTRIBUTE vec3 position;
  ATTRIBUTE vec3 noteInfo; // x: startTime, y: endTime, z: origin x
  ATTRIBUTE vec2 noteSize; // x: 교차축 폭, y: origin y
  ATTRIBUTE vec2 noteDir; // 진행 방향 단위벡터 d (캔버스 좌표, y 아래 양수)
  ATTRIBUTE vec4 noteColorTop;
  ATTRIBUTE vec4 noteColorBottom;
  ATTRIBUTE float noteRadius;
  ATTRIBUTE vec3 noteGlow; // x: glow size, y: glow opacity top (0-1), z: glow opacity bottom (0-1)
  ATTRIBUTE vec3 noteGlowColorTop;
  ATTRIBUTE vec3 noteGlowColorBottom;
  ATTRIBUTE vec4 noteBorder; // x: width, yzw: RGB color
  ATTRIBUTE float noteBorderOpacity; // 0-1, 노트 배경 투명도와 독립
  ATTRIBUTE vec2 noteBorderGradientInfo; // x: LUT 행 (-1 = 단색), y: 각도 라디안
  ATTRIBUTE vec3 noteBodyPaint; // x: LUT 행 (-1 = direct), y: 각도, z: 배율
  ATTRIBUTE vec4 noteGlowPaint; // x: 행, y: 각도, z: 배율, w: LUT 알파 사용

  uniform mat4 projectionMatrix;
  uniform mat4 modelViewMatrix;
  uniform float uTime;
  uniform float uFlowSpeed;
  uniform float uScreenHeight;
  uniform float uTrackHeight;
  uniform float uReverse;

  // xy: 쿼드 로컬 좌표, z: 흐름 비율 (1 - s/H). 글로우 확장 정점의 raw 값을 보간하고 fragment에서 clamp
  VARYING_OUT vec3 vLocal;
  // 이하 노트별 상수. flat은 Apple GPU에서 halo가 큰 장면이 오히려 느려져 쓰지 않는다
  VARYING_OUT vec4 vColorTop;
  VARYING_OUT vec4 vColorBottom;
  VARYING_OUT vec4 vShape; // xy: halfSize, z: 클램프된 radius, w: glow size
  VARYING_OUT vec4 vGlowTop; // rgb: 색, a: opacity
  VARYING_OUT vec4 vGlowBottom;
  VARYING_OUT vec4 vBorder; // x: 디코딩된 width, yzw: RGB color
  VARYING_OUT vec4 vBorderInfo; // x: side mode, y: opacity, z: LUT v (음수 = 단색), w: 글로우 박스 반폭
  VARYING_OUT vec4 vBodyPaint; // x: LUT v (음수 = direct), y: 배율, zw: 투영 계수
  VARYING_OUT vec3 vGlowPaint; // x: LUT v (음수 = direct), y: 배율, z: LUT 알파 사용
  VARYING_OUT vec4 vGradientProj; // xy: 글로우 투영 계수, zw: 테두리 투영 계수

  // 트랙 rect 기준 CSS linear-gradient 투영 계수 - t = 0.5 + px * k.x - py * k.y
  vec2 gradientProjection(float angleRad, float boxW, float boxH) {
    float sinA = sin(angleRad);
    float cosA = cos(angleRad);
    float lineLen = max(abs(boxW * sinA) + abs(boxH * cosA), 0.0001);
    return vec2(sinA, cosA) / lineLen;
  }

  void cullNote() {
    gl_Position = vec4(2.0, 2.0, 2.0, 0.0);
    vLocal = vec3(0.0);
    vColorTop = vec4(0.0);
    vColorBottom = vec4(0.0);
    vShape = vec4(0.0);
    vGlowTop = vec4(0.0);
    vGlowBottom = vec4(0.0);
    vBorder = vec4(0.0);
    vBorderInfo = vec4(0.0, 0.0, -1.0, 0.0);
    vBodyPaint = vec4(-1.0, 0.0, 0.0, 0.0);
    vGlowPaint = vec3(-1.0, 0.0, 0.0);
    vGradientProj = vec4(0.0);
  }

  void main() {
    float startTime = noteInfo.x;
    float endTime = noteInfo.y;
    // O: 히트라인의 c=0 코너, s는 O에서 진행 방향으로 잰 거리
    vec2 origin = vec2(noteInfo.z, noteSize.y);
    float noteWidth = noteSize.x;

    if (startTime == 0.0) {
      cullNote();
      return;
    }

    bool isActive = endTime == 0.0;
    float rawNoteLength = 0.0;
    float glowSize = max(noteGlow.x, 0.0);
    float glowOpacityTop = clamp(noteGlow.y, 0.0, 1.0);
    float glowOpacityBottom = clamp(noteGlow.z, 0.0, 1.0);

    if (isActive) {
      rawNoteLength = max(0.0, (uTime - startTime) * uFlowSpeed / 1000.0);
    } else {
      rawNoteLength = max(0.0, (endTime - startTime) * uFlowSpeed / 1000.0);
    }

    // 활성 [0, len], 완료 [travel, travel+len]
    float len = min(rawNoteLength, uTrackHeight);
    float rawLo;
    float rawHi;
    if (isActive) {
      rawLo = 0.0;
      rawHi = len;
    } else {
      float travel = (uTime - endTime) * uFlowSpeed / 1000.0;
      rawLo = travel;
      rawHi = travel + len;
    }

    // 리버스 = s 공간 미러 (진행 방향과 독립)
    if (uReverse >= 0.5) {
      float mirroredLo = uTrackHeight - rawHi;
      rawHi = uTrackHeight - rawLo;
      rawLo = mirroredLo;
    }

    // 컬링은 raw 구간으로 선판정 - 클램프 뒤에 판정하면 트랙을 벗어난 완료 노트가
    // 0길이로 접혀 잔류한다. 키쪽 경계는 strict less로 스폰 프레임 길이 0 글로우 퍼프 보존
    if (rawLo >= uTrackHeight || rawHi < 0.0 || rawHi < rawLo) {
      cullNote();
      return;
    }

    float sLo = clamp(rawLo, 0.0, uTrackHeight);
    float sHi = clamp(rawHi, 0.0, uTrackHeight);
    float noteLength = sHi - sLo;

    vec2 dir = noteDir;
    vec2 perp = vec2(-dir.y, dir.x);
    float centerS = (sLo + sHi) / 2.0;
    vec2 centerCanvas = origin + dir * centerS + perp * (noteWidth / 2.0);
    // 캔버스(y 아래) → 월드(y 위): y만 뒤집기
    vec2 centerWorld = vec2(centerCanvas.x, uScreenHeight - centerCanvas.y);
    vec2 dirWorld = vec2(dir.x, -dir.y);
    vec2 perpWorld = vec2(perp.x, -perp.y);

    // SDF의 1px AA가 primitive 경계에서 잘리지 않게 최소 halo 보장
    // 길이 0·글로우 없음은 기존처럼 degenerate quad를 유지
    float edgeAAHalo = noteLength > 0.0 ? 1.0 : 0.0;
    float quadHalo = max(glowSize, edgeAAHalo);
    float expandedWidth = noteWidth + quadHalo * 2.0;
    float expandedLength = noteLength + quadHalo * 2.0;

    // 쿼드 로컬: position.x = 교차축, position.y = 진행축
    vec2 planar = centerWorld
      + dirWorld * (position.y * expandedLength)
      + perpWorld * (position.x * expandedWidth);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(planar, 0.0, 1.0);

    float trackHeight = max(uTrackHeight, 0.0001);
    vec2 halfSize = vec2(noteWidth, noteLength) * 0.5;
    // 확장 정점의 raw s로 흐름 비율 (1 = 히트라인쪽, 0 = 먼쪽)
    float sVertex = centerS + position.y * expandedLength;
    vLocal = vec3(
      position.x * expandedWidth,
      position.y * expandedLength,
      1.0 - sVertex / trackHeight
    );

    vColorTop = noteColorTop;
    vColorBottom = noteColorBottom;
    vShape = vec4(
      halfSize,
      clamp(noteRadius, 0.0, min(halfSize.x, halfSize.y)),
      glowSize
    );
    vGlowTop = vec4(noteGlowColorTop, glowOpacityTop);
    vGlowBottom = vec4(noteGlowColorBottom, glowOpacityBottom);

    // 테두리 디코딩: width에 side mode 인코딩됨 (0~20=all, 100~120=vertical, 200~220=horizontal)
    float encodedWidth = noteBorder.x;
    float sideMode = 0.0;
    float borderWidth = encodedWidth;
    if (encodedWidth >= 150.0) {
      sideMode = 2.0;
      borderWidth = encodedWidth - 200.0;
    } else if (encodedWidth >= 50.0) {
      sideMode = 1.0;
      borderWidth = encodedWidth - 100.0;
    }
    vBorder = vec4(borderWidth, noteBorder.yzw);

    // 그라데이션 투영 박스: 본체·테두리는 노트 폭, 글로우는 halo 확장 폭 -
    // 수평 성분 각도에서 여백이 가장자리 색으로 눌리지 않게 한다
    float boxW = max(halfSize.x * 2.0, 0.0001);
    float glowHalfW = halfSize.x + glowSize;
    float glowBoxW = max(glowHalfW * 2.0, 0.0001);

    float borderRow = noteBorderGradientInfo.x;
    vBorderInfo = vec4(
      sideMode,
      noteBorderOpacity,
      borderRow >= 0.0 ? (borderRow + 0.5) / LUT_ROWS : -1.0,
      glowHalfW
    );
    float bodyRow = noteBodyPaint.x;
    vBodyPaint = vec4(
      bodyRow >= 0.0 ? (bodyRow + 0.5) / LUT_ROWS : -1.0,
      noteBodyPaint.z,
      bodyRow >= 0.0
        ? gradientProjection(noteBodyPaint.y, boxW, trackHeight)
        : vec2(0.0)
    );
    float glowRow = noteGlowPaint.x;
    vGlowPaint = vec3(
      glowRow >= 0.0 ? (glowRow + 0.5) / LUT_ROWS : -1.0,
      noteGlowPaint.z,
      noteGlowPaint.w
    );
    vGradientProj = vec4(
      glowRow >= 0.0
        ? gradientProjection(noteGlowPaint.y, glowBoxW, trackHeight)
        : vec2(0.0),
      borderRow >= 0.0
        ? gradientProjection(noteBorderGradientInfo.y, boxW, trackHeight)
        : vec2(0.0)
    );
  }
`;

const fragmentBody = `
  uniform float uDomPerPx;
  uniform float uTrackHeight;
  uniform float uFadeTopPx;
  uniform float uFadeBottomPx;
  uniform sampler2D uGradientLUT;

  VARYING_IN vec3 vLocal;
  VARYING_IN vec4 vColorTop;
  VARYING_IN vec4 vColorBottom;
  VARYING_IN vec4 vShape;
  VARYING_IN vec4 vGlowTop;
  VARYING_IN vec4 vGlowBottom;
  VARYING_IN vec4 vBorder;
  VARYING_IN vec4 vBorderInfo;
  VARYING_IN vec4 vBodyPaint;
  VARYING_IN vec3 vGlowPaint;
  VARYING_IN vec4 vGradientProj;

  void main() {
    vec2 localPos = vLocal.xy;
    vec2 halfSize = vShape.xy;
    float glowSize = vShape.w;
    float trackHeight = max(uTrackHeight, 0.0001);
    // 흐름 비율: 0 = 먼쪽 끝, 1 = 키(히트라인)쪽. 버텍스 raw 보간 후 여기서 clamp
    float flowRatio = clamp(vLocal.z, 0.0, 1.0);
    // 그라데이션 투영의 흐름축 좌표 (트랙 rect 중심 기준)
    float projY = (flowRatio - 0.5) * trackHeight;

    float r = vShape.z;
    vec2 q = abs(localPos) - (halfSize - vec2(r));
    float dist = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
    // AA 폭은 물리 픽셀 1개(CSS px 단위) - backing 배율이 올라가면 경계 램프가 그만큼 좁아진다.
    // uDomPerPx = cssHeight / drawingBufferHeight, 비정수 DPR의 backing 반올림 반영. max()는 미설정/0 방어
    float aa = max(uDomPerPx, 0.0001);
    float outerMask = clamp(1.0 - dist / aa, 0.0, 1.0);

    // 신형 본체는 LUT 경로 (계약 §9-4) - direct 경로는 기존 그대로.
    // paint는 premultiplied 규약으로 정규화: contrib = premultRGB × mask × fade.
    // 본체 유효 알파는 글로우 강도에도 쓰여 halo에서도 구한다
    vec3 bodyPremultRGB;
    float bodyStraightAlpha;
    if (vBodyPaint.x >= 0.0) {
      float projX = clamp(localPos.x, -halfSize.x, halfSize.x);
      float t = clamp(0.5 + projX * vBodyPaint.z - projY * vBodyPaint.w, 0.0, 1.0);
      vec4 bodyTexel = SAMPLE_LUT(uGradientLUT, vec2(t, vBodyPaint.x));
      bodyPremultRGB = bodyTexel.rgb * vBodyPaint.y;
      bodyStraightAlpha = bodyTexel.a * vBodyPaint.y;
    } else {
      vec4 baseColor = mix(vColorTop, vColorBottom, flowRatio);
      bodyPremultRGB = baseColor.rgb * baseColor.a;
      bodyStraightAlpha = baseColor.a;
    }

    float fadeMask = 1.0;
    if (uFadeTopPx > 0.0) {
      float topFadeRatio = uFadeTopPx / trackHeight;
      fadeMask = min(fadeMask, clamp(flowRatio / topFadeRatio, 0.0, 1.0));
    }
    if (uFadeBottomPx > 0.0) {
      float bottomFadeRatio = uFadeBottomPx / trackHeight;
      fadeMask = min(fadeMask, clamp((1.0 - flowRatio) / bottomFadeRatio, 0.0, 1.0));
    }

    // 글로우 (§9-4): glowAlpha = 본체유효알파 × 글로우알파 × falloff²
    vec3 glowContrib = vec3(0.0);
    float glowAlpha = 0.0;
    if (glowSize > 0.0) {
      float outside = max(dist, 0.0);
      float glowFalloff = clamp(1.0 - outside / max(glowSize, 0.0001), 0.0, 1.0);
      float glowFactor = bodyStraightAlpha * (glowFalloff * glowFalloff) * fadeMask;
      if (glowFactor > 0.0) {
        float glowOpacity = mix(vGlowTop.a, vGlowBottom.a, flowRatio);
        // 글로우 paint: 신형은 G.a×배율, 본체 상속(color-only 행)·direct는 기존 프로파일
        vec3 glowPremultRGB;
        float glowPaintAlpha;
        if (vGlowPaint.x >= 0.0) {
          float glowHalfW = vBorderInfo.w;
          float projX = clamp(localPos.x, -glowHalfW, glowHalfW);
          float t = clamp(
            0.5 + projX * vGradientProj.x - projY * vGradientProj.y, 0.0, 1.0
          );
          vec4 glowTexel = SAMPLE_LUT(uGradientLUT, vec2(t, vGlowPaint.x));
          float glowScale = vGlowPaint.z > 0.5 ? vGlowPaint.y : glowOpacity;
          glowPremultRGB = glowTexel.rgb * glowScale;
          glowPaintAlpha = glowTexel.a * glowScale;
        } else {
          glowPremultRGB = mix(vGlowTop.rgb, vGlowBottom.rgb, flowRatio) * glowOpacity;
          glowPaintAlpha = glowOpacity;
        }
        glowContrib = glowPremultRGB * glowFactor;
        glowAlpha = glowPaintAlpha * glowFactor;
      }
    }

    // halo 구간 - 본체·테두리 기여가 없어 글로우만 출력
    if (outerMask <= 0.0) {
      FRAG_COLOR = vec4(glowContrib, clamp(glowAlpha, 0.0, 1.0));
      return;
    }

    float borderWidth = vBorder.x;
    float sideMode = vBorderInfo.x;
    float innerMask;
    if (borderWidth > 0.0) {
      if (sideMode == 0.0) {
        // 전체: 기존 SDF 기반 축소
        float innerDist = dist + borderWidth;
        innerMask = clamp(1.0 - innerDist / aa, 0.0, 1.0);
      } else {
        // 축별 테두리: 선택된 축의 edge distance 기반
        float edgeDist;
        if (sideMode == 1.0) {
          // 수직 (좌우 테두리)
          edgeDist = halfSize.x - abs(localPos.x);
        } else {
          // 수평 (상하 테두리)
          edgeDist = halfSize.y - abs(localPos.y);
        }
        float borderZone = clamp((borderWidth - edgeDist) / aa, 0.0, 1.0);
        innerMask = outerMask * (1.0 - borderZone);
      }
    } else {
      innerMask = outerMask;
    }
    float borderMask = outerMask - innerMask;
    float bodyFactor = innerMask * fadeMask;
    float bodyAlpha = bodyStraightAlpha * bodyFactor;

    // 테두리 투명도는 노트 배경과 독립
    float borderFactor = vBorderInfo.y * borderMask * fadeMask;
    vec3 borderContrib = vec3(0.0);
    float borderAlpha = 0.0;
    if (borderFactor > 0.0) {
      if (vBorderInfo.z >= 0.0) {
        // 그라데이션 테두리 - LUT 텍셀은 premultiplied라 paint에 텍셀 알파를 재곱하지 않는다
        float projX = clamp(localPos.x, -halfSize.x, halfSize.x);
        float t = clamp(
          0.5 + projX * vGradientProj.z - projY * vGradientProj.w, 0.0, 1.0
        );
        vec4 borderTexel = SAMPLE_LUT(uGradientLUT, vec2(t, vBorderInfo.z));
        borderContrib = borderTexel.rgb * borderFactor;
        borderAlpha = borderFactor * borderTexel.a;
      } else {
        borderContrib = vBorder.yzw * borderFactor;
        borderAlpha = borderFactor;
      }
    }

    float outAlpha = clamp(bodyAlpha + borderAlpha + glowAlpha, 0.0, 1.0);
    vec3 outColor = bodyPremultRGB * bodyFactor + borderContrib + glowContrib;
    FRAG_COLOR = vec4(outColor, outAlpha);
  }
`;

export interface NoteShaderOptions {
  // WebGL2 컨텍스트 여부 - false면 GLSL ES 1.00 (WebGL1 폴백)
  webgl2: boolean;
  // 그라데이션 LUT 텍스처의 행 수
  lutRows: number;
}

export interface NoteShaderSource {
  vertex: string;
  fragment: string;
}

export const buildNoteShaders = ({
  webgl2,
  lutRows,
}: NoteShaderOptions): NoteShaderSource => {
  const lutRowsDefine = `#define LUT_ROWS ${lutRows.toFixed(1)}\n`;
  if (webgl2) {
    return {
      vertex:
        '#version 300 es\n' +
        '#define ATTRIBUTE in\n' +
        '#define VARYING_OUT out\n' +
        lutRowsDefine +
        vertexBody,
      fragment:
        '#version 300 es\n' +
        'precision highp float;\n' +
        '#define VARYING_IN in\n' +
        '#define SAMPLE_LUT(lut, uv) textureLod(lut, uv, 0.0)\n' +
        'out vec4 noteFragColor;\n' +
        '#define FRAG_COLOR noteFragColor\n' +
        fragmentBody,
    };
  }
  return {
    vertex:
      '#define ATTRIBUTE attribute\n' +
      '#define VARYING_OUT varying\n' +
      lutRowsDefine +
      vertexBody,
    fragment:
      'precision highp float;\n' +
      '#define VARYING_IN varying\n' +
      '#define SAMPLE_LUT(lut, uv) texture2D(lut, uv)\n' +
      '#define FRAG_COLOR gl_FragColor\n' +
      fragmentBody,
  };
};
