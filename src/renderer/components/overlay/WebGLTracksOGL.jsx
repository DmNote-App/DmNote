import React, { memo, useEffect, useRef } from "react";
import { Renderer, Camera, Transform, Program, Geometry, Mesh } from "ogl";
import { animationScheduler } from "../../utils/animationScheduler";
import { MAX_NOTES } from "@stores/noteBuffer";

const vertexShader = `
  attribute vec3 position;
  attribute vec3 noteInfo; // x: startTime, y: endTime, z: trackX
  attribute vec2 noteSize; // x: width, y: trackBottomY
  attribute vec4 noteColorTop;
  attribute vec4 noteColorBottom;
  attribute float noteRadius;
  attribute float trackIndex;

  uniform mat4 projectionMatrix;
  uniform mat4 modelViewMatrix;
  uniform float uTime;
  uniform float uFlowSpeed;
  uniform float uScreenHeight;
  uniform float uTrackHeight;
  uniform float uReverse;

  varying vec4 vColorTop;
  varying vec4 vColorBottom;
  varying vec2 vLocalPos;
  varying vec2 vHalfSize;
  varying float vRadius;
  varying float vTrackTopY;
  varying float vTrackBottomY;
  varying float vReverse;
  varying float vNoteTopY;
  varying float vNoteBottomY;

  void main() {
    float startTime = noteInfo.x;
    float endTime = noteInfo.y;
    float trackX = noteInfo.z;
    float trackBottomY = noteSize.y;
    float noteWidth = noteSize.x;

    if (startTime == 0.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 0.0);
      vColorTop = vec4(0.0);
      vColorBottom = vec4(0.0);
      return;
    }

    bool isActive = endTime == 0.0;
    float rawNoteLength = 0.0;

    if (isActive) {
      rawNoteLength = max(0.0, (uTime - startTime) * uFlowSpeed / 1000.0);
    } else {
      rawNoteLength = max(0.0, (endTime - startTime) * uFlowSpeed / 1000.0);
    }

    float noteLength = min(rawNoteLength, uTrackHeight);
    float noteTopY;
    float noteBottomY;

    if (isActive) {
      if (uReverse < 0.5) {
        noteBottomY = trackBottomY;
        noteTopY = trackBottomY - noteLength;
      } else {
        float trackTopY_local = trackBottomY - uTrackHeight;
        noteTopY = trackTopY_local;
        noteBottomY = trackTopY_local + noteLength;
      }
    } else {
      if (uReverse < 0.5) {
        float travel = (uTime - endTime) * uFlowSpeed / 1000.0;
        noteBottomY = trackBottomY - travel;
        noteTopY = noteBottomY - noteLength;
      } else {
        float travel = (uTime - endTime) * uFlowSpeed / 1000.0;
        float trackTopY_local = trackBottomY - uTrackHeight;
        noteTopY = trackTopY_local + travel;
        noteBottomY = noteTopY + noteLength;
      }
    }

    float trackTopY = trackBottomY - uTrackHeight;
    noteTopY = max(noteTopY, trackTopY);
    noteBottomY = min(noteBottomY, trackBottomY);

    if (noteBottomY <= trackTopY || noteBottomY < 0.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 0.0);
      vColorTop = vec4(0.0);
      vColorBottom = vec4(0.0);
      return;
    }

    noteLength = noteBottomY - noteTopY;
    float centerCanvasY = (noteTopY + noteBottomY) / 2.0;
    float centerWorldY = uScreenHeight - centerCanvasY;

    vec3 transformed = vec3(position.x, position.y, position.z);
    transformed.x *= noteWidth;
    transformed.y *= noteLength;
    transformed.x += trackX + noteWidth / 2.0;
    transformed.y += centerWorldY;
    transformed.z = 0.0;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);

    vColorTop = noteColorTop;
    vColorBottom = noteColorBottom;
    vHalfSize = vec2(noteWidth, noteLength) * 0.5;
    vLocalPos = vec2(position.x * noteWidth, position.y * noteLength);
    vRadius = noteRadius;
    vTrackTopY = trackTopY;
    vTrackBottomY = trackBottomY;
    vReverse = uReverse;
    vNoteTopY = noteTopY;
    vNoteBottomY = noteBottomY;
  }
`;

const fragmentShader = `
  precision highp float;

  uniform float uScreenHeight;
  uniform float uFadePosition;

  varying vec4 vColorTop;
  varying vec4 vColorBottom;
  varying vec2 vLocalPos;
  varying vec2 vHalfSize;
  varying float vRadius;
  varying float vTrackTopY;
  varying float vTrackBottomY;
  varying float vReverse;
  varying float vNoteTopY;
  varying float vNoteBottomY;

  void main() {
    float currentDOMY = uScreenHeight - gl_FragCoord.y;
    float trackHeight = max(vTrackBottomY - vTrackTopY, 0.0001);
    float gradientRatio = clamp((currentDOMY - vTrackTopY) / trackHeight, 0.0, 1.0);
    float trackRelativeY = gradientRatio;

    float fadePosFlag = uFadePosition;
    bool invertForFade = false;
    if (fadePosFlag < 0.5) {
      invertForFade = (vReverse > 0.5);
    } else if (abs(fadePosFlag - 1.0) < 0.1) {
      invertForFade = false;
    } else {
      invertForFade = true;
    }
    if (invertForFade) {
      trackRelativeY = 1.0 - trackRelativeY;
    }

    vec4 baseColor = mix(vColorTop, vColorBottom, gradientRatio);
    float fadeZone = 50.0;
    float fadeRatio = fadeZone / trackHeight;
    float alpha = baseColor.a;

    float r = clamp(vRadius, 0.0, min(vHalfSize.x, vHalfSize.y));
    if (r > 0.0) {
      vec2 q = abs(vLocalPos) - (vHalfSize - vec2(r));
      float dist = length(max(q, 0.0)) - r;
      float aa = 1.0;
      float smoothAlpha = clamp(0.5 - dist / aa, 0.0, 1.0);
      if (dist > 0.5) discard;
      alpha *= smoothAlpha;
    }

    if (trackRelativeY < fadeRatio) {
      alpha *= clamp(trackRelativeY / fadeRatio, 0.0, 1.0);
    }

    gl_FragColor = vec4(baseColor.rgb * alpha, alpha);
  }
`;

const buildPlaneGeometry = (gl) =>
  new Geometry(gl, {
    position: {
      size: 3,
      data: new Float32Array([
        -0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0,
        -0.5, 0.5, 0,
      ]),
    },
  });

const markAttributesDirty = (geometry, keys) => {
  if (!geometry) return;
  const attributes = geometry.attributes;
  if (!attributes) return;
  const targetKeys = keys ?? Object.keys(attributes);
  targetKeys.forEach((key) => {
    const attr = attributes[key];
    if (attr) {
      attr.needsUpdate = true;
    }
  });
};

const markAllAttributesDirty = (geometry, activeCount) => {
  if (!geometry) return;
  geometry.instancedCount = Math.min(activeCount, MAX_NOTES);
  markAttributesDirty(geometry);
};

export const WebGLTracksOGL = memo(
  ({
    tracks: _tracks,
    notesRef: _notesRef,
    subscribe,
    noteSettings,
    laboratoryEnabled,
    noteBuffer,
  }) => {
    const canvasRef = useRef();
    const rendererRef = useRef();
    const sceneRef = useRef();
    const cameraRef = useRef();
    const programRef = useRef();
    const geometryRef = useRef();
    const isAnimating = useRef(false);
    const lastVersionRef = useRef(noteBuffer?.version ?? 0);
    const pendingUpdateRef = useRef({ dirty: false, dirtySinceFrame: false });

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || !noteBuffer) return;

      const renderer = new Renderer({
        canvas,
        alpha: true,
        antialias: true,
        dpr: window.devicePixelRatio,
        premultipliedAlpha: true,
      });
      renderer.setSize(window.innerWidth, window.innerHeight);
      rendererRef.current = renderer;

      const { gl } = renderer;
      gl.clearColor(0, 0, 0, 0);

      const scene = new Transform();
      sceneRef.current = scene;

      const camera = new Camera(gl, {
        left: 0,
        right: window.innerWidth,
        top: window.innerHeight,
        bottom: 0,
        near: 1,
        far: 1000,
      });
      camera.position.z = 5;
      cameraRef.current = camera;

      const geometry = buildPlaneGeometry(gl);
      geometry.addAttribute("noteInfo", {
        instanced: 1,
        size: 3,
        data: noteBuffer.noteInfo,
      });
      geometry.addAttribute("noteSize", {
        instanced: 1,
        size: 2,
        data: noteBuffer.noteSize,
      });
      geometry.addAttribute("noteColorTop", {
        instanced: 1,
        size: 4,
        data: noteBuffer.noteColorTop,
      });
      geometry.addAttribute("noteColorBottom", {
        instanced: 1,
        size: 4,
        data: noteBuffer.noteColorBottom,
      });
      geometry.addAttribute("noteRadius", {
        instanced: 1,
        size: 1,
        data: noteBuffer.noteRadius,
      });
      geometry.addAttribute("trackIndex", {
        instanced: 1,
        size: 1,
        data: noteBuffer.trackIndex,
      });
      markAllAttributesDirty(geometry, noteBuffer.activeCount);
      geometryRef.current = geometry;

      const program = new Program(gl, {
        vertex: vertexShader,
        fragment: fragmentShader,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uFlowSpeed: { value: noteSettings.speed || 180 },
          uScreenHeight: { value: window.innerHeight },
          uTrackHeight: { value: noteSettings.trackHeight || 150 },
          uReverse: { value: noteSettings.reverse ? 1.0 : 0.0 },
          uFadePosition: {
            value:
              noteSettings.fadePosition === "top"
                ? 1.0
                : noteSettings.fadePosition === "bottom"
                ? 2.0
                : 0.0,
          },
        },
      });
      programRef.current = program;

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.blendEquation(gl.FUNC_ADD);

      const mesh = new Mesh(gl, { geometry, program });
      mesh.setParent(scene);

      const animate = (currentTime) => {
        if (
          !rendererRef.current ||
          !sceneRef.current ||
          !cameraRef.current ||
          !programRef.current
        ) {
          return;
        }

        if (noteBuffer.activeCount === 0) {
          if (isAnimating.current) {
            animationScheduler.remove(animate);
            isAnimating.current = false;
          }
          return;
        }

        // 프레임 시작 시 배치 업데이트 적용
        if (pendingUpdateRef.current.dirtySinceFrame) {
          const geometryTarget = geometryRef.current;
          if (geometryTarget) {
            markAllAttributesDirty(geometryTarget, noteBuffer.activeCount);
          }
          pendingUpdateRef.current.dirtySinceFrame = false;
          pendingUpdateRef.current.dirty = false;
        }

        programRef.current.uniforms.uTime.value = currentTime;
        rendererRef.current.render({
          scene: sceneRef.current,
          camera: cameraRef.current,
        });
      };

      const handleNoteEvent = (event) => {
        if (!event) return;
        const geometryTarget = geometryRef.current;
        if (!geometryTarget) return;

        if (event.activeCount !== undefined) {
          geometryTarget.instancedCount = Math.min(
            event.activeCount,
            MAX_NOTES
          );
        }

        // Version 체크는 clear 이벤트만 적용 (전체 리셋 시)
        if (event.type === "clear") {
          lastVersionRef.current = event.version ?? lastVersionRef.current;
        }

        switch (event.type) {
          case "add":
          case "finalize":
            // 즉시 GPU 업로드하지 않고 다음 프레임에 배치 처리
            if (!pendingUpdateRef.current.dirty) {
              pendingUpdateRef.current.dirty = true;
              pendingUpdateRef.current.dirtySinceFrame = true;
            }
            if (!isAnimating.current && noteBuffer.activeCount > 0) {
              animationScheduler.add(animate);
              isAnimating.current = true;
            }
            break;
          case "cleanup":
          case "clear":
            // cleanup/clear는 즉시 처리 (빈도가 낮음)
            markAllAttributesDirty(geometryTarget, noteBuffer.activeCount);
            pendingUpdateRef.current.dirty = false;
            pendingUpdateRef.current.dirtySinceFrame = false;
            if (noteBuffer.activeCount === 0 && isAnimating.current) {
              animationScheduler.remove(animate);
              isAnimating.current = false;
              requestAnimationFrame(() => {
                if (!rendererRef.current) return;
                const { gl: context } = rendererRef.current;
                context.clear(
                  context.COLOR_BUFFER_BIT | context.DEPTH_BUFFER_BIT
                );
              });
            }
            break;
          default:
            break;
        }
      };

      const unsubscribe = subscribe(handleNoteEvent);

      const handleResize = () => {
        const width = window.innerWidth;
        const height = window.innerHeight;
        renderer.setSize(width, height);
        if (cameraRef.current) {
          cameraRef.current.left = 0;
          cameraRef.current.right = width;
          cameraRef.current.top = height;
          cameraRef.current.bottom = 0;
          cameraRef.current.updateProjectionMatrix();
        }
        if (programRef.current) {
          programRef.current.uniforms.uScreenHeight.value = height;
        }
      };

      window.addEventListener("resize", handleResize);
      handleResize();

      if (noteBuffer.activeCount > 0 && !isAnimating.current) {
        animationScheduler.add(animate);
        isAnimating.current = true;
      }

      return () => {
        unsubscribe();
        window.removeEventListener("resize", handleResize);
        if (isAnimating.current) {
          animationScheduler.remove(animate);
        }
        geometryRef.current?.remove();
        rendererRef.current?.gl
          ?.getExtension("WEBGL_lose_context")
          ?.loseContext?.();
        rendererRef.current = null;
        programRef.current = null;
        geometryRef.current = null;
        cameraRef.current = null;
        sceneRef.current = null;
      };
    }, [noteBuffer, subscribe]);

    useEffect(() => {
      if (!programRef.current) return;
      const uniforms = programRef.current.uniforms;
      uniforms.uFlowSpeed.value = noteSettings.speed || 180;
      uniforms.uTrackHeight.value = noteSettings.trackHeight || 150;
      uniforms.uReverse.value = noteSettings.reverse ? 1.0 : 0.0;
      uniforms.uFadePosition.value =
        noteSettings.fadePosition === "top"
          ? 1.0
          : noteSettings.fadePosition === "bottom"
          ? 2.0
          : 0.0;
    }, [noteSettings]);

    return (
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      />
    );
  }
);
