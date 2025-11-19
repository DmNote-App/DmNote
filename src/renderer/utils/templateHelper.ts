import { DisplayElementTemplateResult } from "@src/types/api";

export function renderTemplate(
  result: DisplayElementTemplateResult | string
): string {
  if (typeof result === "string") return result;
  if (!result || !result.strings) return "";

  const { strings, values } = result;
  let html = "";
  strings.forEach((str, i) => {
    html += str;
    if (i < values.length) {
      const val = values[i];
      if (Array.isArray(val)) {
        html += val.map(renderTemplate).join("");
      } else if (typeof val === "object" && val && (val as any).strings) {
        html += renderTemplate(val as any);
      } else {
        html += String(val ?? "");
      }
    }
  });
  return html;
}
