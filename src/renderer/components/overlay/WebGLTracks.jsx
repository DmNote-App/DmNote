import React, { memo, useEffect, useRef } from "react";
import * as THREE from "three";
import { animationScheduler } from "../../utils/animationScheduler";

const MAX_NOTES = 2048; // 씬에서 동시에 렌더링할 수 있는 최대 노트 수

const MIN_NOTE_LENGTH_PX = 25.0; // 단노트의 고정 길이 (픽셀 단위)

// 버텍스 셰이더: 캔버스 로직과 동일한 (위▶아래 좌표계) 계산을 위해 DOM 기준(y 아래로 증가) 값을 받아
// 화면 변환 시 실제 WebGL 상(y 위로 증가)으로 변환 + 라운드 코너 처리를 위한 로컬 좌표 전달.
const vertexShader = `
  uniform float uTime;
  uniform float uFlowSpeed;
  uniform float uScreenHeight; // 전체 화면 높이 (캔버스 y -> WebGL y 변환용)
  uniform float uTrackHeight; // 트랙 높이 (px, runtime 설정)
  uniform float uReverse; // 0.0 = normal (bottom->up), 1.0 = reversed (top->down)
  uniform float uMinNoteLengthPx; // 단노트 고정 길이 (픽셀 단위)

  attribute vec3 noteInfo; // x: startTime, y: endTime, z: trackX (왼쪽 X px, DOM 기준)
  attribute vec2 noteSize; // x: width, y: trackBottomY (DOM 기준; 키 위치)
  attribute vec4 noteColor;
  attribute float noteRadius; // 픽셀 단위 라운드 반경
  attribute float trackIndex; // 키 순서 (첫 번째 키 = 0, 두 번째 키 = 1, ...)

  varying vec4 vColor;
  varying vec2 vLocalPos;     // 노트 중심 기준 로컬 좌표(px)
  varying vec2 vHalfSize;     // (width/2, height/2)
  varying float vRadius;      // 라운드 반경(px)
  varying float vTrackTopY;   // 트랙 상단 Y 좌표 (DOM 기준)
  varying float vTrackBottomY; // 트랙 하단 Y 좌표 (DOM 기준)
  varying float vReverse;     // 리버스 모드 플래그

  void main() {
    float startTime = noteInfo.x;
    float endTime = noteInfo.y;
    float trackX = noteInfo.z;
    float trackBottomY = noteSize.y;
    float noteWidth = noteSize.x;

    if (startTime == 0.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 0.0);
      vColor = vec4(0.0);
      return;
    }

    // [핵심 로직 1] 픽셀 길이를 기준으로 필요한 '유예 시간'을 역산
    // uFlowSpeed가 0이 되는 경우를 대비해 분모에 최소값 1.0 보장
    float uMinNoteDurationMs = (uMinNoteLengthPx / max(uFlowSpeed, 1.0)) * 1000.0;

    bool isActive = endTime == 0.0;
    float rawNoteLength = 0.0;

    // [핵심 로직 2] 노트 길이 계산
    if (isActive) {
      // 활성 노트: 현재 누른 시간을 기준으로 유예 시간까지 성장하고, 넘어서면 계속 성장
      float pressDuration = uTime - startTime;
      if (pressDuration <= uMinNoteDurationMs) {
        // 유예 시간 내: 고정 길이까지 성장
        rawNoteLength = (pressDuration / uMinNoteDurationMs) * uMinNoteLengthPx;
      } else {
        // 유예 시간 초과: 고정 길이 + 추가 성장
        float extraDuration = pressDuration - uMinNoteDurationMs;
        rawNoteLength = uMinNoteLengthPx + (extraDuration * uFlowSpeed / 1000.0);
      }
    } else {
      // 비활성 노트: 최종 누른 시간을 기준으로 길이를 확정
      float pressDuration = endTime - startTime;
      if (pressDuration <= uMinNoteDurationMs) {
        // 짧은 노트: 항상 고정 길이
        rawNoteLength = uMinNoteLengthPx;
      } else {
        // 긴 노트: 고정 길이 + 추가 길이
        float extraDuration = pressDuration - uMinNoteDurationMs;
        rawNoteLength = uMinNoteLengthPx + (extraDuration * uFlowSpeed / 1000.0);
      }
    }
    
    float noteLength = min(rawNoteLength, uTrackHeight);
    
    float noteTopY, noteBottomY;
    float trackTopY = trackBottomY - uTrackHeight;

    if (isActive) {
      // 활성 노트: 판정선에 고정되어 성장
      if (uReverse < 0.5) { // Normal
        noteBottomY = trackBottomY;
        noteTopY = noteBottomY - noteLength;
      } else { // Reverse
        noteTopY = trackTopY;
        noteBottomY = noteTopY + noteLength;
      }
    } else {
      // 비활성 노트: 이동
      // [핵심 로직 3] 이동 시작 시점 결정
      // 단노트 성장이 끝나는 시간과 실제 키 뗀 시간 중 더 나중 시간을 기준으로 이동 시작
      float pressDuration = endTime - startTime;
      float visualEndTime = startTime + min(pressDuration, uMinNoteDurationMs);
      float travelStartTime = max(endTime, visualEndTime);
      float travel = (uTime - travelStartTime) * uFlowSpeed / 1000.0;

      if (uReverse < 0.5) { // Normal
        noteBottomY = trackBottomY - travel;
        noteTopY = noteBottomY - noteLength;
      } else { // Reverse
        noteTopY = trackTopY + travel;
        noteBottomY = noteTopY + noteLength;
      }
    }
    
    // --- 이하 클리핑 및 좌표 변환 로직 (기존과 동일) ---
    noteTopY = max(noteTopY, trackTopY);
    noteBottomY = min(noteBottomY, trackBottomY);

    if (noteBottomY <= trackTopY || noteBottomY < 0.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 0.0);
      vColor = vec4(0.0);
      return;
    }

    noteLength = noteBottomY - noteTopY;
    if (noteLength <= 0.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 0.0);
      vColor = vec4(0.0);
      return;
    }
    float centerCanvasY = (noteTopY + noteBottomY) / 2.0;

    float centerWorldY = uScreenHeight - centerCanvasY;

    vec3 transformed = vec3(position.x, position.y, position.z);
    transformed.x *= noteWidth;
    transformed.y *= noteLength;

    transformed.x += trackX + noteWidth / 2.0;
    transformed.y += centerWorldY;
    
    transformed.z = 0.0;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);

    vColor = noteColor;
    vHalfSize = vec2(noteWidth, noteLength) * 0.5;
    vLocalPos = vec2(position.x * noteWidth, position.y * noteLength);
    vRadius = noteRadius;
    vTrackTopY = trackTopY;
    vTrackBottomY = trackBottomY;
    vReverse = uReverse;
  }
`;

// 프래그먼트 셰이더: 개별 노트 페이딩 제거, 상단 50px 전역 마스크 + 라운드 코너 SDF로 픽셀 discard
// gl_FragCoord.y 는 하단=0, 상단=screenHeight 이므로 distanceFromTop = uScreenHeight - gl_FragCoord.y
const fragmentShader = `
  uniform float uScreenHeight;
  uniform float uFadePosition; // 0 = auto, 1 = top, 2 = bottom
  varying vec4 vColor;
  varying vec2 vLocalPos;
  varying vec2 vHalfSize;
  varying float vRadius;
  varying float vTrackTopY;
  varying float vTrackBottomY;
  varying float vReverse;

  void main() {
    // 현재 픽셀의 DOM Y 좌표 계산
    float currentDOMY = uScreenHeight - gl_FragCoord.y;
    
    // 트랙 내에서의 상대적 위치 계산 (0.0 = 트랙 상단, 1.0 = 트랙 하단)
    float trackRelativeY = (currentDOMY - vTrackTopY) / (vTrackBottomY - vTrackTopY);
    
    // fadePosition: 0 = auto (기존 동작: reverse에 따라 반전), 1 = top, 2 = bottom
    // vReverse: 0 = normal, 1 = reversed
    float fadePosFlag = uFadePosition;
    bool invertForFade = false;
    if (fadePosFlag < 0.5) {
      // auto
      invertForFade = (vReverse > 0.5);
    } else if (abs(fadePosFlag - 1.0) < 0.1) {
      // top
      invertForFade = false;
    } else {
      // bottom
      invertForFade = true;
    }
    if (invertForFade) {
      trackRelativeY = 1.0 - trackRelativeY;
    }
    
    float fadeZone = 50.0; // 페이드 영역 50px
    float trackHeight = vTrackBottomY - vTrackTopY;
    float fadeRatio = fadeZone / trackHeight; // 트랙 높이 대비 페이드 영역 비율
    
    float alpha = vColor.a;
    
    // 라운드 코너: vLocalPos 범위는 -vHalfSize ~ +vHalfSize
    float r = clamp(vRadius, 0.0, min(vHalfSize.x, vHalfSize.y));
    if (r > 0.0) {
      // 사각 SDF with rounding
      vec2 q = abs(vLocalPos) - (vHalfSize - vec2(r));
      float dist = length(max(q, 0.0)) - r;
      // 부드러운 에지 (1px 범위)
      float aa = 1.0; // 안티앨리어싱 폭(px)
      float smoothAlpha = clamp(0.5 - dist / aa, 0.0, 1.0);
      if (dist > 0.5) discard; // 경계 밖
      alpha *= smoothAlpha;
    }
    
    // 트랙 페이드 영역 적용 (상단 또는 하단)
    if (trackRelativeY < fadeRatio) {
      alpha *= clamp(trackRelativeY / fadeRatio, 0.0, 1.0);
    }

    gl_FragColor = vec4(vColor.rgb, alpha);
  }
`;

export const WebGLTracks = memo(
  ({ tracks, notesRef, subscribe, noteSettings }) => {
    const canvasRef = useRef();
    const rendererRef = useRef();
    const sceneRef = useRef();
    const cameraRef = useRef();
    const geometryRef = useRef();
    const materialRef = useRef();
    const meshMapRef = useRef(new Map()); // 트랙별 InstancedMesh
    const trackMapRef = useRef(new Map());
    const attributesMapRef = useRef(new Map()); // 트랙별 속성 캐싱용
    const colorCacheRef = useRef(new Map()); // 색상 변환 캐싱
    const isAnimating = useRef(false); // 애니메이션 루프 상태
    const noteTrackMapRef = useRef(new Map()); // noteId -> trackKey 매핑

    // 1. WebGL 씬 초기 설정 (단 한번만 실행)
    useEffect(() => {
      const canvas = canvasRef.current;
      const renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.sortObjects = true; // 투명 객체 정렬 활성화

      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(window.devicePixelRatio);
      rendererRef.current = renderer;

      const scene = new THREE.Scene();
      sceneRef.current = scene;

      const camera = new THREE.OrthographicCamera(
        0,
        window.innerWidth,
        window.innerHeight,
        0,
        1,
        1000
      );
      camera.position.z = 5;
      cameraRef.current = camera;

      // 공유 지오메트리/머티리얼
      const geometry = new THREE.PlaneGeometry(1, 1).toNonIndexed();
      geometryRef.current = geometry;

      const material = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uFlowSpeed: { value: noteSettings.speed || 180 },
          uScreenHeight: { value: window.innerHeight },
          uTrackHeight: { value: noteSettings.trackHeight || 150 },
          uReverse: { value: noteSettings.reverse ? 1.0 : 0.0 },
          // fadePosition: 'auto' | 'top' | 'bottom' -> 0 | 1 | 2
          uFadePosition: {
            value:
              noteSettings.fadePosition === "top"
                ? 1.0
                : noteSettings.fadePosition === "bottom"
                ? 2.0
                : 0.0,
          },
          // [수정] ms 대신 px 값을 uniform으로 전달
          uMinNoteLengthPx: { value: MIN_NOTE_LENGTH_PX },
        },
        vertexShader,
        fragmentShader,
        transparent: true,
        blending: THREE.NormalBlending,
        depthTest: false, // 투명 객체는 페인터스 알고리즘 사용
        depthWrite: false,
      });
      materialRef.current = material;

      // 트랙 엔트리 생성기
      const createTrackEntry = (track) => {
        const geo = geometryRef.current.clone();
        const mesh = new THREE.InstancedMesh(
          geo,
          materialRef.current,
          MAX_NOTES
        );
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        // 키 순서 고정 레이어링: 첫 번째 키가 가장 뒤 (작은 renderOrder가 먼저 그려짐)
        mesh.renderOrder = track.trackIndex ?? 0;
        sceneRef.current.add(mesh);

        // 트랙별 버퍼
        const noteInfoArray = new Float32Array(MAX_NOTES * 3);
        const noteSizeArray = new Float32Array(MAX_NOTES * 2);
        const noteColorArray = new Float32Array(MAX_NOTES * 4);
        const noteRadiusArray = new Float32Array(MAX_NOTES);
        const trackIndexArray = new Float32Array(MAX_NOTES);

        const noteInfoAttr = new THREE.InstancedBufferAttribute(
          noteInfoArray,
          3
        );
        const noteSizeAttr = new THREE.InstancedBufferAttribute(
          noteSizeArray,
          2
        );
        const noteColorAttr = new THREE.InstancedBufferAttribute(
          noteColorArray,
          4
        );
        const noteRadiusAttr = new THREE.InstancedBufferAttribute(
          noteRadiusArray,
          1
        );
        const trackIndexAttr = new THREE.InstancedBufferAttribute(
          trackIndexArray,
          1
        );

        mesh.geometry.setAttribute("noteInfo", noteInfoAttr);
        mesh.geometry.setAttribute("noteSize", noteSizeAttr);
        mesh.geometry.setAttribute("noteColor", noteColorAttr);
        mesh.geometry.setAttribute("noteRadius", noteRadiusAttr);
        mesh.geometry.setAttribute("trackIndex", trackIndexAttr);

        attributesMapRef.current.set(track.trackKey, {
          noteInfoArray,
          noteSizeArray,
          noteColorArray,
          noteInfoAttr,
          noteSizeAttr,
          noteColorAttr,
          noteRadiusArray,
          noteRadiusAttr,
          trackIndexArray,
          trackIndexAttr,
        });

        meshMapRef.current.set(track.trackKey, {
          mesh,
          noteIndexMap: new Map(),
          freeIndices: [],
          nextIndex: 0,
        });
      };

      const ensureTrackEntry = (trackKey) => {
        if (meshMapRef.current.has(trackKey))
          return meshMapRef.current.get(trackKey);
        const track = trackMapRef.current.get(trackKey);
        if (
          !track ||
          !geometryRef.current ||
          !materialRef.current ||
          !sceneRef.current
        )
          return null;
        createTrackEntry(track);
        return meshMapRef.current.get(trackKey);
      };

      // 애니메이션 루프: GPU에 시간만 전달하고 렌더링
      const animate = (currentTime) => {
        if (
          !rendererRef.current ||
          !sceneRef.current ||
          !cameraRef.current ||
          !materialRef.current
        )
          return;

        // 조기 종료: 노트가 전혀 없으면 렌더링하지 않음
        const totalNotes = Object.values(notesRef.current).reduce((sum, notes) => sum + notes.length, 0);
        if (totalNotes === 0) {
          if (meshRef.current.count > 0) {
            meshRef.current.count = 0;
            rendererRef.current.render(sceneRef.current, cameraRef.current);
          }
          return;
        }

        materialRef.current.uniforms.uTime.value = currentTime;
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      };

      // 데이터 업데이트 로직을 이벤트 기반으로 변경
      const handleNoteEvent = (event) => {
        if (!event) return;

        const { type, note } = event;

        if (type === "clear") {
          // 모든 노트 클리어
          for (const [, entry] of meshMapRef.current) {
            entry.noteIndexMap.clear();
            entry.freeIndices.length = 0;
            entry.nextIndex = 0;
            entry.mesh.count = 0;
          }
          noteTrackMapRef.current.clear();
          if (isAnimating.current) {
            animationScheduler.remove(animate);
            isAnimating.current = false;
            // 캔버스 클리어
            requestAnimationFrame(() => {
              if (!rendererRef.current) return;
              const { width, height } = rendererRef.current.getSize(
                new THREE.Vector2()
              );
              rendererRef.current.setScissor(0, 0, width, height);
              rendererRef.current.clear();
            });
          }
          return;
        }

        if (!note) return;

        if (type === "add") {
          const track = trackMapRef.current.get(note.keyName);
          if (!track) return;

          const entry = ensureTrackEntry(note.keyName);
          if (!entry) return;

          if (!isAnimating.current) {
            animationScheduler.add(animate);
            isAnimating.current = true;
          }

          const { mesh, noteIndexMap, freeIndices, nextIndex } = entry;

          const attrs = attributesMapRef.current.get(note.keyName);
          if (!attrs) return;

          // 색상 데이터 가져오기
          let colorData = colorCacheRef.current.get(track.noteColor);
          if (!colorData) {
            const color = track.noteColor;
            if (
              typeof color === "string" &&
              color.startsWith("#") &&
              color.length >= 7
            ) {
              const r = parseInt(color.slice(1, 3), 16) / 255;
              const g = parseInt(color.slice(3, 5), 16) / 255;
              const b = parseInt(color.slice(5, 7), 16) / 255;
              colorData = { r, g, b };
            } else {
              colorData = { r: 1, g: 1, b: 1 };
            }
            colorCacheRef.current.set(track.noteColor, colorData);
          }

          // 인덱스 할당
          const index = freeIndices.pop() ?? entry.nextIndex++;
          if (index >= MAX_NOTES) {
            entry.nextIndex--;
            return; // 버퍼 꽉 참
          }
          noteIndexMap.set(note.id, index);
          noteTrackMapRef.current.set(note.id, note.keyName);

          // 해당 인덱스에 데이터 쓰기
          const base3 = index * 3;
          const base2 = index * 2;
          const base4 = index * 4;

          attrs.noteInfoArray.set(
            [note.startTime, 0, track.position.dx],
            base3
          );
          attrs.noteSizeArray.set([track.width, track.position.dy], base2);
          attrs.noteColorArray.set(
            [colorData.r, colorData.g, colorData.b, track.noteOpacity / 100],
            base4
          );
          attrs.noteRadiusArray.set([track.borderRadius || 0], index);
          attrs.trackIndexArray.set([track.trackIndex], index); // 키 순서 설정

          attrs.noteInfoAttr.needsUpdate = true;
          attrs.noteSizeAttr.needsUpdate = true;
          attrs.noteColorAttr.needsUpdate = true;
          attrs.noteRadiusAttr.needsUpdate = true;
          attrs.trackIndexAttr.needsUpdate = true;

          mesh.count = Math.max(mesh.count, index + 1);
        } else if (type === "finalize") {
          const trackKey = noteTrackMapRef.current.get(note.id);
          if (!trackKey) return;

          const entry = meshMapRef.current.get(trackKey);
          if (!entry) return;

          const index = entry.noteIndexMap.get(note.id);
          if (index === undefined) return;

          const attrs = attributesMapRef.current.get(trackKey);
          if (!attrs) return;

          const base3 = index * 3;
          // endTime만 업데이트
          attrs.noteInfoArray.set([note.endTime], base3 + 1);
          attrs.noteInfoAttr.needsUpdate = true;
        } else if (type === "cleanup") {
          // useNoteSystem에서 전달된 제거할 노트들 처리
          for (const noteId of note.ids) {
            const trackKey = noteTrackMapRef.current.get(noteId);
            if (!trackKey) continue;

            const entry = meshMapRef.current.get(trackKey);
            if (!entry) {
              noteTrackMapRef.current.delete(noteId);
              continue;
            }

            const index = entry.noteIndexMap.get(noteId);
            if (index !== undefined) {
              const attrs = attributesMapRef.current.get(trackKey);
              if (!attrs) continue;

              const base3 = index * 3;
              // 해당 인덱스를 0으로 만들어 셰이더에서 그리지 않도록 함
              attrs.noteInfoArray.set([0, 0], base3); // startTime, endTime을 0으로

              entry.noteIndexMap.delete(noteId);
              entry.freeIndices.push(index); // 인덱스 재사용
              noteTrackMapRef.current.delete(noteId);
            }
          }
          // cleanup은 여러 데이터를 변경하므로 needsUpdate를 한번만 설정
          for (const attrs of attributesMapRef.current.values()) {
            attrs.noteInfoAttr.needsUpdate = true;
          }

          // 활성 노트가 없으면 애니메이션 중지
          if (noteTrackMapRef.current.size === 0 && isAnimating.current) {
            animationScheduler.remove(animate);
            isAnimating.current = false;
            // 캔버스 클리어
            requestAnimationFrame(() => {
              if (!rendererRef.current) return;
              const { width, height } = rendererRef.current.getSize(
                new THREE.Vector2()
              );
              rendererRef.current.setScissor(0, 0, width, height);
              rendererRef.current.clear();
            });
          }
        }

        // needsUpdate 플래그는 각 이벤트 핸들러에서 개별적으로 설정됨
      };

      const unsubscribe = subscribe(handleNoteEvent);

      return () => {
        unsubscribe();
        if (isAnimating.current) {
          animationScheduler.remove(animate);
        }
        // 트랙 메쉬 정리
        for (const [, entry] of meshMapRef.current) {
          sceneRef.current?.remove(entry.mesh);
          try {
            entry.mesh.geometry.deleteAttribute?.("noteInfo");
            entry.mesh.geometry.deleteAttribute?.("noteSize");
            entry.mesh.geometry.deleteAttribute?.("noteColor");
            entry.mesh.geometry.deleteAttribute?.("noteRadius");
            entry.mesh.geometry.deleteAttribute?.("trackIndex");
          } catch {}
          entry.mesh.dispose();
        }
        meshMapRef.current.clear();
        attributesMapRef.current.clear();

        geometryRef.current?.dispose();
        materialRef.current?.dispose();
        renderer.dispose();
      };
    }, []); // 의존성 배열 비워서 마운트 시 한 번만 실행

    // 2. 트랙 정보 업데이트
    useEffect(() => {
      const newTrackMap = new Map();
      tracks.forEach((track) => {
        newTrackMap.set(track.trackKey, track);
      });
      trackMapRef.current = newTrackMap;

      // 기존 트랙 메쉬의 renderOrder 갱신 (키 순서 변화 반영)
      tracks.forEach((track) => {
        const entry = meshMapRef.current.get(track.trackKey);
        if (entry?.mesh) {
          entry.mesh.renderOrder = track.trackIndex ?? 0;
        }
      });
    }, [tracks]);

    // 3. 노트 설정(속도) 업데이트
    useEffect(() => {
      if (materialRef.current) {
        materialRef.current.uniforms.uFlowSpeed.value =
          noteSettings.speed || 180;
        materialRef.current.uniforms.uTrackHeight.value =
          noteSettings.trackHeight || 150;
        materialRef.current.uniforms.uReverse.value = noteSettings.reverse
          ? 1.0
          : 0.0;
        materialRef.current.uniforms.uFadePosition.value =
          noteSettings.fadePosition === "top"
            ? 1.0
            : noteSettings.fadePosition === "bottom"
            ? 2.0
            : 0.0;
      }
    }, [
      noteSettings.speed,
      noteSettings.trackHeight,
      noteSettings.reverse,
      noteSettings.fadePosition,
    ]);

    // 4. 윈도우 리사이즈 처리
    useEffect(() => {
      const handleResize = () => {
        const width = window.innerWidth;
        const height = window.innerHeight;
        if (rendererRef.current) {
          rendererRef.current.setSize(width, height);
        }
        if (cameraRef.current) {
          cameraRef.current.left = 0;
          cameraRef.current.right = width;
          cameraRef.current.top = height;
          cameraRef.current.bottom = 0;
          cameraRef.current.updateProjectionMatrix();
        }
        if (materialRef.current) {
          materialRef.current.uniforms.uScreenHeight.value = height;
        }
      };
      window.addEventListener("resize", handleResize);
      handleResize();
      return () => window.removeEventListener("resize", handleResize);
    }, []);

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
