import { styleText } from "node:util";

/**
 * Styles text for the given stream (stdout by default). Colors are applied only
 * when that stream is a terminal, and follow `NO_COLOR`, `NODE_DISABLE_COLORS`
 * and `FORCE_COLOR`.
 */
const style =
  (format: Parameters<typeof styleText>[0]) =>
  (text: string | number, stream: NodeJS.WritableStream = process.stdout) =>
    styleText(format, String(text), { stream });

export const dim = style("dim");
export const green = style("green");
export const red = style("red");
export const underline = style("underline");
export const yellow = style("yellow");
