import { z } from "zod";

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
  count: z.number().int().nonnegative(),
  noteColor: noteColorSchema,
  noteOpacity: z.number().int().min(0).max(100),
  className: z.string().optional().or(z.literal("")),
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
