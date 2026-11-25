import { styleText } from "node:util";

/**
 * Styles text for the given stream (stdout by default). Node colors it only if
 * the stream is a terminal, unless `NO_COLOR` or `FORCE_COLOR` says otherwise.
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
