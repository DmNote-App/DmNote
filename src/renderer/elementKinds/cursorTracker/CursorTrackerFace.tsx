import React, { useEffect, useRef } from 'react';

import ElementSurface from '../runtime/ElementSurface';
import { loadPointerMonitors } from '../runtime/pointerInput';
import type { ElementRenderProps } from '../runtime/renderTypes';
import {
  advanceCursorTracker,
  applyPointerSample,
  initialCursorTrackerState,
  isCursorTrackerSettled,
  resolveMonitor,
  type CursorTrackerOptions,
  type CursorTrackerState,
  type MonitorRect,
} from './cursorTrackerMotion';

export interface CursorTrackerValues {
  mode: 'motion' | 'position';
  sensitivity: number;
  returnMs: number;
  aspect: 'locked' | 'free';
  monitor: string | null;
  trailMs: number;
  dotSize: number;
  dotColor: string;
  trailColor: string;
  trailWidth: number;
}

const draw = (
  canvas: HTMLCanvasElement,
  state: CursorTrackerState,
  values: CursorTrackerValues,
  at: number,
) => {
  const context = canvas.getContext('2d');
  if (!context) return;
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== Math.round(width * ratio)) {
    canvas.width = Math.round(width * ratio);
  }
  if (canvas.height !== Math.round(height * ratio)) {
    canvas.height = Math.round(height * ratio);
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  if (values.trailWidth > 0 && values.trailMs > 0) {
    context.strokeStyle = values.trailColor;
    context.lineWidth = values.trailWidth;
    for (let index = 1; index < state.trail.length; index += 1) {
      const point = state.trail[index];
      if (point.broken) continue;
      const previous = state.trail[index - 1];
      context.globalAlpha = Math.max(0, 1 - (at - point.at) / values.trailMs);
      context.beginPath();
      context.moveTo(previous.x, previous.y);
      context.lineTo(point.x, point.y);
      context.stroke();
    }
  }
  context.globalAlpha = 1;
  if (state.dot) {
    context.fillStyle = values.dotColor;
    context.beginPath();
    context.arc(state.dot.x, state.dot.y, values.dotSize / 2, 0, Math.PI * 2);
    context.fill();
  }
};

// 편집 화면 미리보기 - 중앙의 점과 짧은 궤적
const previewState = (width: number, height: number): CursorTrackerState => {
  const center = { x: width / 2, y: height / 2 };
  const reach = Math.min(width, height) / 4;
  return {
    ...initialCursorTrackerState(width, height),
    trail: [0, 1, 2, 3].map((step) => ({
      x: center.x - reach + (reach * step) / 3,
      y: center.y + (reach / 2) * Math.sin(step),
      at: -150 + step * 50,
    })),
  };
};

const CursorTrackerFace = ({
  element,
  values,
  bundles,
  live,
  inputs,
}: ElementRenderProps<CursorTrackerValues>) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { width, height } = element.frame;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    if (!live || !inputs.pointer) {
      draw(canvas, previewState(width, height), values, 0);
      return undefined;
    }
    let monitor: MonitorRect | null = null;
    let cancelled = false;
    if (values.mode === 'position') {
      void loadPointerMonitors().then((monitors) => {
        if (!cancelled) monitor = resolveMonitor(monitors, values.monitor);
      });
    }
    const options = (): CursorTrackerOptions => ({
      mode: values.mode,
      width,
      height,
      sensitivity: values.sensitivity,
      returnMs: values.returnMs,
      trailMs: values.trailMs,
      monitor,
    });
    let state = initialCursorTrackerState(width, height, performance.now());
    let frame: number | null = null;
    const tick = () => {
      frame = null;
      const at = performance.now();
      state = advanceCursorTracker(state, options(), at);
      draw(canvas, state, values, at);
      if (!isCursorTrackerSettled(state, options())) {
        frame = requestAnimationFrame(tick);
      }
    };
    draw(canvas, state, values, state.lastAt);
    const unsubscribe = inputs.pointer.subscribe((sample) => {
      state = applyPointerSample(state, sample, options(), performance.now());
      frame ??= requestAnimationFrame(tick);
    });
    return () => {
      cancelled = true;
      unsubscribe();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [live, inputs.pointer, width, height, values]);

  return (
    <ElementSurface surface={bundles.surface}>
      <canvas
        ref={canvasRef}
        data-cursor-tracker-canvas="true"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      />
    </ElementSurface>
  );
};

export default CursorTrackerFace;
