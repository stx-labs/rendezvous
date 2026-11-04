import { PassThrough } from "node:stream";
import { WriteStream } from "node:tty";

import { red, underline } from "./colors";

/**
 * A stream that reports whether it is a terminal. Its color depth comes from
 * Node's TTY implementation, which reads `NO_COLOR`, `NODE_DISABLE_COLORS` and
 * `TERM`.
 */
const createStream = (isTTY: boolean) =>
  Object.assign(new PassThrough(), {
    isTTY,
    getColorDepth: WriteStream.prototype.getColorDepth,
  });

const terminal = createStream(true);
const pipe = createStream(false);

beforeEach(() => {
  vi.stubEnv("FORCE_COLOR", undefined);
  vi.stubEnv("NO_COLOR", undefined);
  vi.stubEnv("NODE_DISABLE_COLORS", undefined);
  vi.stubEnv("TERM", "xterm-256color");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Colors", () => {
  it("colors text written to a terminal", () => {
    expect(red("text", terminal)).toBe("\u001b[31mtext\u001b[39m");
  });

  it("leaves text written to a pipe plain", () => {
    expect(red("text", pipe)).toBe("text");
  });

  it("converts numbers to text", () => {
    expect(underline(42, terminal)).toBe("\u001b[4m42\u001b[24m");
  });

  it.each(["NO_COLOR", "NODE_DISABLE_COLORS"])(
    "leaves text plain on a terminal when %s is set",
    (name) => {
      vi.stubEnv(name, "1");

      expect(red("text", terminal)).toBe("text");
    },
  );

  it("leaves text plain on a dumb terminal", () => {
    vi.stubEnv("TERM", "dumb");

    expect(red("text", terminal)).toBe("text");
  });

  it("colors text written to a pipe when FORCE_COLOR is set, even with NO_COLOR", () => {
    vi.stubEnv("FORCE_COLOR", "1");
    vi.stubEnv("NO_COLOR", "1");

    expect(red("text", pipe)).toBe("\u001b[31mtext\u001b[39m");
  });

  it("leaves text plain on a terminal when FORCE_COLOR is 0", () => {
    vi.stubEnv("FORCE_COLOR", "0");

    expect(red("text", terminal)).toBe("text");
  });
});
