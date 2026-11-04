import { PassThrough } from "node:stream";

import { red, underline } from "./colors";

const terminal = Object.assign(new PassThrough(), { isTTY: true });
const pipe = new PassThrough();

beforeEach(() => {
  vi.stubEnv("FORCE_COLOR", undefined);
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
});
