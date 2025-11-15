import type { DisplayElementTemplateResult } from "@src/types/api";
import { TEMPLATE_RESULT_FLAG } from "@src/types/api";

export interface TemplateResult extends DisplayElementTemplateResult {
  readonly [TEMPLATE_RESULT_FLAG]: true;
}

class TemplateResultImpl implements TemplateResult {
  readonly [TEMPLATE_RESULT_FLAG] = true as const;
  constructor(
    public readonly strings: TemplateStringsArray,
    public readonly values: unknown[]
  ) {}
}

export function html(
  strings: TemplateStringsArray,
  ...values: unknown[]
): TemplateResult {
  return new TemplateResultImpl(strings, values);
}

export function isTemplateResult(value: unknown): value is TemplateResult {
  return Boolean(
    value && typeof value === "object" && (value as any)[TEMPLATE_RESULT_FLAG]
  );
}
