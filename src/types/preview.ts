// 편집 프리뷰 채널 wire 계약 (Rust preview_broker와 공유)

import type { EditorElementTypeV1 } from '@src/types/editor';

// 2: 대상이 옛 배열 순번에서 요소 id로
export const PREVIEW_SCHEMA_VERSION = 2;

export type PreviewDomain = `${EditorElementTypeV1}Position`;

export const PREVIEW_DOMAIN_BY_ELEMENT_TYPE = {
  key: 'keyPosition',
  stat: 'statPosition',
  graph: 'graphPosition',
  knob: 'knobPosition',
  sprite: 'spritePosition',
} as const satisfies Record<EditorElementTypeV1, PreviewDomain>;

export const ELEMENT_TYPE_BY_PREVIEW_DOMAIN = {
  keyPosition: 'key',
  statPosition: 'stat',
  graphPosition: 'graph',
  knobPosition: 'knob',
  spritePosition: 'sprite',
} as const satisfies Record<PreviewDomain, EditorElementTypeV1>;

export type PreviewEnvelopeKind = 'patch' | 'cancel';

export interface PreviewEnvelope {
  schemaVersion: typeof PREVIEW_SCHEMA_VERSION;
  sessionId: string;
  seq: number;
  kind: PreviewEnvelopeKind;
  // Rust가 호출 webview label로 주입, 수신측 echo 방지용
  sourceLabel: string;
  domain: PreviewDomain;
  mode: string;
  // 요소 id
  targets: string[];
  patch: Record<string, unknown>;
}

export interface PreviewPublishRequest {
  schemaVersion: typeof PREVIEW_SCHEMA_VERSION;
  sessionId: string;
  seq: number;
  domain: PreviewDomain;
  mode: string;
  // 요소 id
  targets: string[];
  patch: Record<string, unknown>;
}
