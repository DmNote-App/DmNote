import { z } from "zod";

export const keyCounterPlacementSchema = z.union([
  z.literal("inside"),
  z.literal("outside"),
]);

export const keyCounterAlignSchema = z.union([
  z.literal("top"),
  z.literal("bottom"),
  z.literal("left"),
  z.literal("right"),
]);

export const keyCounterColorSchema = z.object({
  idle: z.string(),
  active: z.string(),
});

const keyCounterSettingsInputSchema = z
  .object({
    placement: keyCounterPlacementSchema.optional(),
    align: keyCounterAlignSchema.optional(),
    fill: keyCounterColorSchema.partial().optional(),
    stroke: keyCounterColorSchema.partial().optional(),
    gap: z.number().int().min(0).optional(),
  })
  .partial();

export type KeyCounterPlacement = z.infer<typeof keyCounterPlacementSchema>;
export type KeyCounterAlign = z.infer<typeof keyCounterAlignSchema>;
export type KeyCounterColor = z.infer<typeof keyCounterColorSchema>;

export interface KeyCounterSettings {
  placement: KeyCounterPlacement;
  align: KeyCounterAlign;
  fill: KeyCounterColor;
  stroke: KeyCounterColor;
  gap: number; // px 단위 간격
}

const COUNTER_DEFAULTS: KeyCounterSettings = Object.freeze({
  placement: "outside" as KeyCounterPlacement,
  align: "top" as KeyCounterAlign,
  // fill: idle white, active black
  fill: Object.freeze({ idle: "#FFFFFF", active: "#000000" }),
  // stroke: idle black, active white
  stroke: Object.freeze({ idle: "#000000", active: "#FFFFFF" }),
  gap: 6,
});

export function createDefaultCounterSettings(): KeyCounterSettings {
  return {
    placement: COUNTER_DEFAULTS.placement,
    align: COUNTER_DEFAULTS.align,
    fill: {
      idle: COUNTER_DEFAULTS.fill.idle,
      active: COUNTER_DEFAULTS.fill.active,
    },
    stroke: {
      idle: COUNTER_DEFAULTS.stroke.idle,
      active: COUNTER_DEFAULTS.stroke.active,
    },
    gap: COUNTER_DEFAULTS.gap,
  };
}

export function normalizeCounterSettings(raw: unknown): KeyCounterSettings {
  const fallback = createDefaultCounterSettings();
  const parsed = keyCounterSettingsInputSchema.safeParse(raw);
  if (!parsed.success) {
    return fallback;
  }

  const { placement, align, fill, stroke, gap } = parsed.data;
  return {
    placement: placement ?? fallback.placement,
    align: align ?? fallback.align,
    fill: {
      idle: fill?.idle ?? fallback.fill.idle,
      active: fill?.active ?? fallback.fill.active,
    },
    stroke: {
      idle: stroke?.idle ?? fallback.stroke.idle,
      active: stroke?.active ?? fallback.stroke.active,
    },
    gap:
      typeof gap === "number" && Number.isFinite(gap) && gap >= 0
        ? gap
        : fallback.gap,
  };
}

export const keySchema = z.string();

export const keyModeSchema = z.union([
  z.literal("4key"),
  z.literal("5key"),
  z.literal("6key"),
  z.literal("8key"),
]);

export type KeyMode = z.infer<typeof keyModeSchema> | string;

export const keyMappingSchema = z.record(z.string(), z.array(keySchema));
export type KeyMappings = Record<string, string[]>;

const gradientNoteColorSchema = z.object({
  type: z.literal("gradient"),
  top: z.string(),
  bottom: z.string(),
});

export const noteColorSchema = z.union([z.string(), gradientNoteColorSchema]);
export type GradientNoteColor = z.infer<typeof gradientNoteColorSchema>;
export type NoteColor = z.infer<typeof noteColorSchema>;

export const keyPositionSchema = z.object({
  dx: z.number(),
  dy: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  activeImage: z.string().optional().or(z.literal("")),
  inactiveImage: z.string().optional().or(z.literal("")),
  activeTransparent: z.boolean().optional(),
  idleTransparent: z.boolean().optional(),
  count: z.number().int().nonnegative(),
  noteColor: noteColorSchema,
  noteOpacity: z.number().int().min(0).max(100),
  noteGlowEnabled: z.boolean().optional().default(false),
  noteGlowSize: z.number().int().min(0).max(50).optional().default(20),
  noteGlowOpacity: z.number().int().min(0).max(100).optional().default(70),
  noteGlowColor: noteColorSchema.optional(),
  className: z.string().optional().or(z.literal("")),
  counter: z
    .any()
    .transform((value) => normalizeCounterSettings(value))
    .default(createDefaultCounterSettings()),
});

export type KeyPosition = z.infer<typeof keyPositionSchema>;

export const keyPositionsSchema = z.record(
  z.string(),
  z.array(keyPositionSchema)
);
export type KeyPositions = Record<string, KeyPosition[]>;

export type KeyCounters = Record<string, Record<string, number>>;

export const customTabSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
});
export type CustomTab = z.infer<typeof customTabSchema>;

export const customTabsSchema = z.array(customTabSchema);
