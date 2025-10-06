import { DEFAULT_NOTE_SETTINGS } from "@constants/overlayConfig";

const MAX_NOTES = 2048;

const SRGB_TO_LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i += 1) {
  const c = i / 255;
  SRGB_TO_LINEAR[i] =
    c < 0.04045
      ? c * 0.0773993808
      : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4);
}

const linearToSRGB = (c: number) => {
  if (c <= 0.0031308) {
    return c * 12.92;
  }
  return 1.055 * Math.pow(c, 1.0 / 2.4) - 0.055;
};

const parseColor = (hex: string) => {
  const color = hex.replace("#", "");
  const r = parseInt(color.substring(0, 2), 16);
  const g = parseInt(color.substring(2, 4), 16);
  const b = parseInt(color.substring(4, 6), 16);
  return [SRGB_TO_LINEAR[r], SRGB_TO_LINEAR[g], SRGB_TO_LINEAR[b]] as const;
};

const convertLinearToSRGB = (rgb: readonly number[]) =>
  [linearToSRGB(rgb[0]), linearToSRGB(rgb[1]), linearToSRGB(rgb[2])] as const;

const extractColorStops = (color: any, fallback = "#FFFFFF") => {
  if (!color) {
    const c = parseColor(fallback);
    return {
      top: c,
      bottom: [...c] as readonly number[],
    };
  }
  if (typeof color === "string") {
    const solid = parseColor(color);
    return { top: solid, bottom: [...solid] as readonly number[] };
  }
  if (typeof color === "object" && color.type === "gradient") {
    return {
      top: parseColor(color.top ?? fallback),
      bottom: parseColor(color.bottom ?? fallback),
    };
  }
  const parsed = parseColor(fallback);
  return { top: parsed, bottom: [...parsed] as readonly number[] };
};

export type TrackLayoutInput = {
  trackKey: string;
  trackIndex: number;
  position: { dx: number; dy: number };
  width: number;
  height: number;
  noteColor?: string | { type: string; top?: string; bottom?: string };
  noteOpacity?: number;
  borderRadius?: number;
};

export type NoteBufferEventType = "add" | "finalize" | "cleanup" | "clear";

export class NoteBuffer {
  readonly noteInfo: Float32Array;
  readonly noteSize: Float32Array;
  readonly noteColorTop: Float32Array;
  readonly noteColorBottom: Float32Array;
  readonly noteRadius: Float32Array;
  readonly trackIndex: Float32Array;

  private readonly noteIdByIndex: (string | null)[];
  private readonly indexByNoteId: Map<string, number>;
  private trackLayouts: Map<string, TrackLayoutInput>;

  activeCount: number;
  version: number;

  constructor() {
    this.noteInfo = new Float32Array(MAX_NOTES * 3);
    this.noteSize = new Float32Array(MAX_NOTES * 2);
    this.noteColorTop = new Float32Array(MAX_NOTES * 4);
    this.noteColorBottom = new Float32Array(MAX_NOTES * 4);
    this.noteRadius = new Float32Array(MAX_NOTES);
    this.trackIndex = new Float32Array(MAX_NOTES);

    this.noteIdByIndex = new Array<string | null>(MAX_NOTES).fill(null);
    this.indexByNoteId = new Map();
    this.trackLayouts = new Map();

    this.activeCount = 0;
    this.version = 0;
  }

  updateTrackLayouts(tracks: TrackLayoutInput[]) {
    const nextLayouts = new Map<string, TrackLayoutInput>();
    tracks.forEach((track) => {
      nextLayouts.set(track.trackKey, track);
    });
    this.trackLayouts = nextLayouts;
  }

  allocate(trackKey: string, noteId: string, startTime: number) {
    const layout = this.trackLayouts.get(trackKey);
    if (!layout) {
      return -1;
    }
    if (this.activeCount >= MAX_NOTES) {
      return -1;
    }
    const opacity =
      layout.noteOpacity != null
        ? Math.min(Math.max(layout.noteOpacity / 100, 0), 1)
        : 0.8;

    const { top, bottom } = extractColorStops(
      layout.noteColor,
      DEFAULT_NOTE_SETTINGS.noteColor
    );
    const srgbTop = convertLinearToSRGB(top);
    const srgbBottom = convertLinearToSRGB(bottom);

    const index = this.activeCount;
    this.activeCount += 1;

    const infoOffset = index * 3;
    this.noteInfo[infoOffset] = startTime;
    this.noteInfo[infoOffset + 1] = 0;
    this.noteInfo[infoOffset + 2] = layout.position.dx;

    const sizeOffset = index * 2;
    this.noteSize[sizeOffset] = layout.width;
    this.noteSize[sizeOffset + 1] = layout.position.dy;

    const colorOffset = index * 4;
    this.noteColorTop[colorOffset] = srgbTop[0];
    this.noteColorTop[colorOffset + 1] = srgbTop[1];
    this.noteColorTop[colorOffset + 2] = srgbTop[2];
    this.noteColorTop[colorOffset + 3] = opacity;

    this.noteColorBottom[colorOffset] = srgbBottom[0];
    this.noteColorBottom[colorOffset + 1] = srgbBottom[1];
    this.noteColorBottom[colorOffset + 2] = srgbBottom[2];
    this.noteColorBottom[colorOffset + 3] = opacity;

    this.noteRadius[index] =
      layout.borderRadius ?? DEFAULT_NOTE_SETTINGS.borderRadius;
    this.trackIndex[index] = layout.trackIndex;

    this.noteIdByIndex[index] = noteId;
    this.indexByNoteId.set(noteId, index);
    this.version += 1;
    return index;
  }

  finalize(noteId: string, endTime: number) {
    const index = this.indexByNoteId.get(noteId);
    if (index === undefined) {
      return -1;
    }
    this.noteInfo[index * 3 + 1] = endTime;
    this.version += 1;
    return index;
  }

  release(noteId: string) {
    const index = this.indexByNoteId.get(noteId);
    if (index === undefined) {
      return -1;
    }
    const last = this.activeCount - 1;
    if (last < 0) {
      return -1;
    }

    if (index !== last) {
      this.copySlot(last, index);
      const movedId = this.noteIdByIndex[last];
      if (movedId) {
        this.indexByNoteId.set(movedId, index);
        this.noteIdByIndex[index] = movedId;
      } else {
        this.noteIdByIndex[index] = null;
      }
    }

    this.noteIdByIndex[last] = null;
    this.indexByNoteId.delete(noteId);
    this.activeCount = Math.max(last, 0);

    const infoOffset = last * 3;
    this.noteInfo[infoOffset] = 0;
    this.noteInfo[infoOffset + 1] = 0;
    this.noteInfo[infoOffset + 2] = 0;

    const sizeOffset = last * 2;
    this.noteSize[sizeOffset] = 0;
    this.noteSize[sizeOffset + 1] = 0;

    const colorOffset = last * 4;
    this.noteColorTop.fill(0, colorOffset, colorOffset + 4);
    this.noteColorBottom.fill(0, colorOffset, colorOffset + 4);
    this.noteRadius[last] = 0;
    this.trackIndex[last] = 0;

    this.version += 1;
    return index;
  }

  clear() {
    this.activeCount = 0;
    this.version += 1;
    this.indexByNoteId.clear();
    this.noteIdByIndex.fill(null);
    this.noteInfo.fill(0);
    this.noteSize.fill(0);
    this.noteColorTop.fill(0);
    this.noteColorBottom.fill(0);
    this.noteRadius.fill(0);
    this.trackIndex.fill(0);
  }

  private copySlot(from: number, to: number) {
    const fromInfo = from * 3;
    const toInfo = to * 3;
    this.noteInfo[toInfo] = this.noteInfo[fromInfo];
    this.noteInfo[toInfo + 1] = this.noteInfo[fromInfo + 1];
    this.noteInfo[toInfo + 2] = this.noteInfo[fromInfo + 2];

    const fromSize = from * 2;
    const toSize = to * 2;
    this.noteSize[toSize] = this.noteSize[fromSize];
    this.noteSize[toSize + 1] = this.noteSize[fromSize + 1];

    const fromColor = from * 4;
    const toColor = to * 4;
    this.noteColorTop[toColor] = this.noteColorTop[fromColor];
    this.noteColorTop[toColor + 1] = this.noteColorTop[fromColor + 1];
    this.noteColorTop[toColor + 2] = this.noteColorTop[fromColor + 2];
    this.noteColorTop[toColor + 3] = this.noteColorTop[fromColor + 3];

    this.noteColorBottom[toColor] = this.noteColorBottom[fromColor];
    this.noteColorBottom[toColor + 1] = this.noteColorBottom[fromColor + 1];
    this.noteColorBottom[toColor + 2] = this.noteColorBottom[fromColor + 2];
    this.noteColorBottom[toColor + 3] = this.noteColorBottom[fromColor + 3];

    this.noteRadius[to] = this.noteRadius[from];
    this.trackIndex[to] = this.trackIndex[from];
  }
}

export const createNoteBuffer = () => new NoteBuffer();
export { MAX_NOTES };
