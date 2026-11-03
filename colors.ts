import { styleText } from "node:util";

/**
 * Styles text for stdout. Colors are applied only when stdout is a terminal,
 * and follow `NO_COLOR`, `NODE_DISABLE_COLORS` and `FORCE_COLOR`.
 */
const style =
  (format: Parameters<typeof styleText>[0]) => (text: string | number) =>
    styleText(format, String(text));

export const dim = style("dim");
export const green = style("green");
export const red = style("red");
export const underline = style("underline");
export const yellow = style("yellow");
