import { execFileSync, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { initSimnet } from "@stacks/clarinet-sdk";

import { main } from "./app";
import {
  interruptBoundary,
  isInterrupted,
  listenForInterrupt,
  markInterruptFatal,
} from "./interrupt";
import { checkProperties } from "./property";
import { getFunctionsFromContractInterfaces } from "./shared";

// Use the normal build output for the child.
// Hook the application's case event directly, so signal delivery does not depend
// on when or how the operating system splits stdout into chunks.
const loader = `
  const { EventEmitter } = require('events');
  const emit = EventEmitter.prototype.emit;
  let count = 0;
  EventEmitter.prototype.emit = function(event, ...args) {
    const result = emit.call(this, event, ...args);
    if (event === 'logMessage' && typeof args[0] === 'string' && args[0].includes(process.env.CASE_MARKER)) {
      count++;
      if (count === Number(process.env.SIGNAL_AT)) process.kill(process.pid, 'SIGINT');
    }
    return result;
  };
  const app = require(process.argv[1]);
  process.argv = [process.execPath, process.argv[1], ...process.argv.slice(2)];
  app.main();
`;

const runChild = (
  cwd: string,
  type: "test" | "invariant",
  marker: string,
  signalAt: number,
  bail = false,
  regr = false,
) =>
  new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "-e",
        loader,
        join(process.cwd(), "dist/app.js"),
        join(cwd, "example"),
        "counter",
        type,
        "--runs=1",
        "--seed=12345",
        ...(bail ? ["--bail"] : []),
        ...(regr ? ["--regr"] : []),
      ],
      {
        cwd,
        env: {
          ...process.env,
          FORCE_COLOR: "0",
          NODE_PATH: join(process.cwd(), "node_modules"),
          CASE_MARKER: marker,
          SIGNAL_AT: String(signalAt),
        },
      },
    );
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    let error: Error | undefined = undefined;
    const timer = setTimeout(() => {
      error = new Error("interrupt child timed out");
      child.kill("SIGKILL");
    }, 30_000);
    child.once("error", (err) => {
      error = err;
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      const output =
        Buffer.concat(stdout).toString("utf8") +
        Buffer.concat(stderr).toString("utf8");
      if (error) {
        reject(new Error(`${error.message}\n${output}`));
      } else {
        resolve({ code, output });
      }
    });
  });

const withFixture = async (
  failing: boolean,
  test: (cwd: string) => Promise<void>,
) => {
  const cwd = fs.mkdtempSync(join(tmpdir(), "rv-interrupt-"));
  try {
    fs.cpSync(join(process.cwd(), "example"), join(cwd, "example"), {
      recursive: true,
      filter: (path) => !path.includes("node_modules"),
    });
    if (failing) {
      const contract = join(cwd, "example/contracts/counter.clar");
      fs.writeFileSync(
        contract,
        fs
          .readFileSync(contract, "utf8")
          .replace(
            "(asserts! (is-eq (get-counter) (+ counter-before n)) (err u403))",
            "(asserts! false (err u403))",
          ),
      );
    }
    await test(cwd);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
};

describe("SIGINT run control", () => {
  beforeAll(() => {
    execFileSync("pnpm", ["build"], { timeout: 120_000 });
  }, 120_000);
  it.each([
    { name: "last successful property case", type: "test", scenario: "pass" },
    {
      name: "last successful invariant case",
      type: "invariant",
      scenario: "pass",
    },
    { name: "last shrink attempt", type: "test", scenario: "failure" },
    { name: "failure with --bail", type: "test", scenario: "bail" },
    { name: "setup", type: "test", scenario: "setup" },
    { name: "regression replay", type: "test", scenario: "replay" },
  ] as const)(
    "handles a real SIGINT during $name",
    async ({ type, scenario }) => {
      await withFixture(
        ["failure", "bail", "replay"].includes(scenario),
        async (cwd) => {
          const directory = join(cwd, ".rendezvous-regressions");
          const bail = scenario === "bail" || scenario === "replay";
          let signalAt = 1;
          if (scenario === "failure" || bail) {
            // The fixed-seed control identifies the terminal shrink attempt.
            const control = await runChild(cwd, type, "[FAIL]", 0, bail);
            expect(control.code, control.output).toBe(1);
            const failures = control.output.match(/\[FAIL\]/g)?.length ?? 0;
            expect(failures).toBeGreaterThan(bail ? 0 : 1);
            if (scenario === "replay") {
              const file = join(directory, fs.readdirSync(directory)[0]);
              const store = JSON.parse(fs.readFileSync(file, "utf8"));
              store.test.push({ ...store.test[0], seed: 12346 });
              fs.writeFileSync(file, JSON.stringify(store));
            } else {
              signalAt = failures;
              fs.rmSync(directory, { recursive: true, force: true });
            }
          }
          const marker =
            scenario === "setup"
              ? "Using manifest path"
              : scenario === "pass"
                ? "[PASS]"
                : "[FAIL]";
          const result = await runChild(
            cwd,
            type,
            marker,
            signalAt,
            bail,
            scenario === "replay",
          );
          expect(result.code, result.output).toBe(130);
          expect(result.output).toContain("Run interrupted");
          if (scenario === "pass") {
            expect(result.output).toContain("EXECUTION STATISTICS");
            expect(result.output).not.toMatch(
              /OK, (invariants|properties) passed/,
            );
            expect(fs.existsSync(directory)).toBe(false);
          } else if (scenario === "setup") {
            expect(result.output).not.toContain("[PASS]");
          } else if (scenario === "replay") {
            expect(result.output.match(/\[FAIL\]/g)).toHaveLength(1);
            expect(result.output.match(/regression test for/g)).toHaveLength(1);
          } else {
            expect(result.output).toContain("Error: Property failed");
            expect(fs.readdirSync(directory)).toHaveLength(1);
          }
        },
      );
    },
    70_000,
  );

  it("gives discard validation errors precedence over interrupts", async () => {
    await withFixture(false, async (cwd) => {
      fs.appendFileSync(
        join(cwd, "example/contracts/counter.clar"),
        "\n(define-read-only (can-test-add (n int)) true)\n",
      );
      const result = await runChild(cwd, "test", "Using manifest path", 1);
      expect(result.output).toContain("Parameter mismatch");
      expect(result.output).toContain("Run interrupted");
      expect(result.code, result.output).toBe(1);
    });
  }, 70_000);

  it("handles first and second interrupts, fatal precedence, and normal cleanup", () => {
    const before = process.listenerCount("SIGINT");
    const previous = process.exitCode;
    const normal = listenForInterrupt(new EventEmitter());
    normal.close();
    expect(process.listenerCount("SIGINT")).toBe(before);
    const radio = new EventEmitter();
    const handle = listenForInterrupt(radio);
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("second SIGINT");
    }) as never);
    try {
      process.emit("SIGINT");
      expect(isInterrupted(radio)).toBe(true);
      expect(process.listenerCount("SIGINT")).toBe(before + 1);
      expect(() => process.emit("SIGINT")).toThrow("second SIGINT");
      expect(exit).toHaveBeenCalledWith(130);
      markInterruptFatal(radio);
      handle.close();
      expect(process.exitCode).toBe(1);
      expect(process.listenerCount("SIGINT")).toBe(before);
    } finally {
      handle.close();
      exit.mockRestore();
      process.exitCode = previous;
    }
  });

  it("removes the handler when setup throws", async () => {
    const before = process.listenerCount("SIGINT");
    const argv = process.argv;
    const previous = process.exitCode;
    try {
      process.argv = [
        process.execPath,
        ..."app /nonexistent-rendezvous-project counter test --seed=12345 --runs=1".split(
          " ",
        ),
      ];
      await expect(main()).rejects.toBeDefined();
      expect(process.listenerCount("SIGINT")).toBe(before);
    } finally {
      process.argv = argv;
      process.exitCode = previous;
    }
  });

  it("delivers a real signal at a timed boundary", async () => {
    const radio = new EventEmitter();
    const previous = process.exitCode;
    const handle = listenForInterrupt(radio);
    const clock = vi.spyOn(performance, "now").mockReturnValue(0);
    const started = process.hrtime.bigint();
    try {
      process.kill(process.pid, "SIGINT");
      while (
        !isInterrupted(radio) &&
        process.hrtime.bigint() - started < BigInt(2_000_000_000)
      ) {
        try {
          await interruptBoundary(radio);
        } catch {
          break;
        }
      }
      expect(isInterrupted(radio)).toBe(true);
      expect(process.hrtime.bigint() - started).toBeLessThan(
        BigInt(2_000_000_000),
      );
    } finally {
      clock.mockRestore();
      handle.close();
      process.exitCode = previous;
    }
  });

  it("runs the library without installing a signal handler", async () => {
    const before = process.listenerCount("SIGINT");
    await withFixture(false, async (cwd) => {
      const manifest = join(cwd, "example/Clarinet.toml");
      const simnet = await initSimnet(manifest);
      const id = `${simnet.deployer}.counter`;
      const functions = getFunctionsFromContractInterfaces(
        new Map([[id, simnet.getContractsInterfaces().get(id)!]]),
      );
      await checkProperties(
        simnet,
        async () => {
          await initSimnet(manifest);
        },
        [id],
        functions,
        12345,
        1,
        true,
        false,
        new EventEmitter(),
        new Map([["deployer", simnet.deployer]]),
        [simnet.deployer],
      );
      expect(process.listenerCount("SIGINT")).toBe(before);
    });
  }, 40_000);
});
