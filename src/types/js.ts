import { z } from "zod";

export const customJsSchema = z.object({
  path: z.string().nullable(),
  content: z.string(),
});

export type CustomJs = z.infer<typeof customJsSchema>;
