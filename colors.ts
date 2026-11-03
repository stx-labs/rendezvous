import { styleText } from "node:util";

/**
 * Wraps text in the ANSI escape codes for the given style. Codes are always
 * emitted, whether or not the output stream is a terminal.
 */
const style =
  (format: Parameters<typeof styleText>[0]) => (text: string | number) =>
    styleText(format, String(text), { validateStream: false });

export const dim = style("dim");
export const green = style("green");
export const red = style("red");
export const underline = style("underline");
export const yellow = style("yellow");
