import { EventEmitter } from "node:events";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { stripVTControlCharacters } from "node:util";

import type { Simnet } from "@stacks/clarinet-sdk";
import { Cl } from "@stacks/transactions";

import { main } from "./app";
import type { RunDetails } from "./heatstroke.types";
import { reportStateBeforeFailure, StateRecorder } from "./snapshot";

const isolatedTestEnvPrefix = "rendezvous-test-snapshot-";

const fakeSimnet = () =>
  ({
    blockHeight: 3,
    burnBlockHeight: 2,
    getContractsInterfaces: () =>
      new Map([
        [
          "ST1.contract",
          {
            variables: [
              { name: "counter", access: "variable" },
              { name: "limit", access: "constant" },
            ],
          },
        ],
      ]),
    getDataVar: vi.fn(() => Cl.uint(7)),
  }) as unknown as Simnet & { getDataVar: ReturnType<typeof vi.fn> };

const failedRun = (numRuns: number) =>
  ({ failed: true, numRuns, seed: 1, counterexample: [] }) as RunDetails;

describe("State recorder", () => {
  it("records the data variables of the target run only", () => {
    // Arrange
    const simnet = fakeSimnet();
    const recorder = new StateRecorder(2);

    // Act
    recorder.startRun();
    recorder.record(simnet, "ST1.contract", "test-a");
    recorder.startRun();
    recorder.record(simnet, "ST1.contract", "test-b");
    recorder.startRun();
    recorder.record(simnet, "ST1.contract", "test-c");

    // Assert
    expect(simnet.getDataVar).toHaveBeenCalledTimes(1);
    expect(recorder.snapshots).toEqual([
      {
        functionName: "test-b",
        burnBlockHeight: 2,
        blockHeight: 3,
        dataVariables: [["counter", "u7"]],
      },
    ]);
  });

  it("keeps a read error instead of throwing it", () => {
    // Arrange
    const simnet = fakeSimnet();
    simnet.getDataVar.mockImplementation(() => {
      throw new Error("read failed");
    });
    const recorder = new StateRecorder(1);
    recorder.startRun();

    // Act & Assert
    expect(() =>
      recorder.record(simnet, "ST1.contract", "test-a"),
    ).not.toThrow();
    expect(recorder.error).toEqual(new Error("read failed"));
  });
});

describe("Reporting the state before a failure", () => {
  const captureLogs = () => {
    const logs: string[] = [];
    const radio = new EventEmitter();
    radio.on("logMessage", (log) => logs.push(log));
    radio.on("logFailure", (log) => logs.push(log));
    return { logs, radio };
  };

  it("does not replay a passing run", async () => {
    // Arrange
    const { logs, radio } = captureLogs();
    const resetSession = vi.fn(async () => {});
    const replay = vi.fn();

    // Act
    await reportStateBeforeFailure(
      { ...failedRun(100), failed: false },
      "ST1.contract",
      resetSession,
      replay,
      radio,
    );

    // Assert
    expect(resetSession).not.toHaveBeenCalled();
    expect(replay).not.toHaveBeenCalled();
    expect(logs).toEqual([]);
  });

  it("reports no state when the replay fails at another run", async () => {
    // Arrange
    const { logs, radio } = captureLogs();

    // Act
    await reportStateBeforeFailure(
      failedRun(3),
      "ST1.contract",
      async () => {},
      async (_radio, recorder) => {
        recorder.startRun();
        recorder.record(fakeSimnet(), "ST1.contract", "test-a");
        return failedRun(1);
      },
      radio,
    );

    // Assert
    expect(logs).toContain(
      "The replay did not fail at the same run, so no state is reported.\n",
    );
    expect(logs.some((log) => log.includes("counter: u7"))).toBe(false);
  });

  it("reports a read error instead of the state", async () => {
    // Arrange
    const { logs, radio } = captureLogs();
    const simnet = fakeSimnet();
    simnet.getDataVar.mockImplementation(() => {
      throw new Error("read failed");
    });

    // Act
    await reportStateBeforeFailure(
      failedRun(1),
      "ST1.contract",
      async () => {},
      async (_radio, recorder) => {
        recorder.startRun();
        recorder.record(simnet, "ST1.contract", "test-a");
        return failedRun(1);
      },
      radio,
    );

    // Assert
    expect(logs).toContain(
      "Could not read the contract state: Error: read failed\n",
    );
  });
});

describe("--snapshot in the CLI", () => {
  const initialArgv = process.argv;
  const initialCwd = process.cwd();
  const initialExitCode = process.exitCode;
  let project = "";
  let logs: string[] = [];

  const run = async (args: string[]) => {
    logs = [];
    for (const method of ["log", "error"] as const) {
      vi.spyOn(console, method).mockImplementation((message: string) => {
        logs.push(stripVTControlCharacters(String(message)));
      });
    }
    process.argv = ["node", "app.js", project, "counter", ...args];
    await main();
    vi.restoreAllMocks();
    return logs.join("\n");
  };

  beforeEach(() => {
    project = mkdtempSync(join(tmpdir(), isolatedTestEnvPrefix));
    mkdirSync(join(project, "contracts"));
    cpSync(
      resolve(__dirname, "example", "settings"),
      join(project, "settings"),
      { recursive: true },
    );
    writeFileSync(
      join(project, "Clarinet.toml"),
      `[project]
name = "snapshot"
telemetry = false

[contracts.counter]
path = "contracts/counter.clar"
clarity_version = 3
epoch = 3.0
`,
    );
    // The property and the invariant both fail once the counter reaches 5.
    writeFileSync(
      join(project, "contracts", "counter.clar"),
      `(define-data-var counter uint u0)
(define-data-var flag bool false)
(define-constant LIMIT u5)

(define-map context (string-ascii 100) { called: uint })

(define-private (update-context (function-name (string-ascii 100))
    (called uint))
  (ok (map-set context function-name { called: called })))

(define-public (increment)
  (ok (var-set counter (+ (var-get counter) u1))))

(define-read-only (invariant-below-limit) (< (var-get counter) LIMIT))

(define-private (test-below-limit)
  (begin
    (var-set counter (+ (var-get counter) u1))
    (asserts! (< (var-get counter) LIMIT) (err u1))
    (ok true)))
`,
    );
    // Keep saved regressions inside the temporary project.
    process.chdir(project);
  });

  afterEach(() => {
    process.chdir(initialCwd);
    process.argv = initialArgv;
    process.exitCode = initialExitCode;
    vi.restoreAllMocks();
    rmSync(project, { recursive: true, force: true });
  });

  it("reports the state before the failing property call", async () => {
    // Act
    const output = await run(["test", "--seed=1", "--snapshot"]);

    // Assert: the fifth call fails, after four passing ones.
    expect(output).toContain("Error: Property failed after 5 tests.");
    expect(output).toContain(
      "Replaying seed 1 up to run 5 to report the state before the first " +
        "failure...",
    );
    expect(output).toContain(
      "Contract state before each call of run 5, the first failing run " +
        "(counter data variables only):",
    );
    expect(output).toMatch(
      /before test-below-limit\n {2}counter: u4\n {2}flag: false/,
    );
    expect(output).not.toContain("LIMIT");
    expect(process.exitCode).toBe(1);
    // The replay does not save the failure again.
    const regressions = JSON.parse(
      readFileSync(
        join(
          project,
          ".rendezvous-regressions",
          "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.counter.json",
        ),
        "utf8",
      ),
    );
    expect(regressions.test).toHaveLength(1);
  });

  it("reports the state before each call of the failing invariant run", async () => {
    // Act
    const output = await run(["invariant", "--seed=1", "--snapshot"]);

    // Assert
    const states = [
      ...output.matchAll(/before (\S+)\n {2}counter: u(\d+)/g),
    ].map(([, functionName, counter]) => ({
      functionName,
      counter: Number(counter),
    }));
    expect(states.length).toBeGreaterThan(1);
    // The run starts below the limit and each increment adds one.
    expect(states[0].counter).toBeLessThan(5);
    states.forEach(({ functionName, counter }, index) => {
      expect(functionName).toBe(
        index < states.length - 1 ? "increment" : "invariant-below-limit",
      );
      expect(counter).toBe(states[0].counter + index);
    });
    expect(states[states.length - 1].counter).toBeGreaterThanOrEqual(5);
    expect(process.exitCode).toBe(1);
  });

  it("does not replay or report state for a passing run", async () => {
    // Arrange
    writeFileSync(
      join(project, "contracts", "counter.clar"),
      `(define-data-var counter uint u0)

(define-private (test-passes) (ok true))
`,
    );

    // Act
    const output = await run(["test", "--seed=1", "--runs=10", "--snapshot"]);

    // Assert
    expect(output).toContain("OK, properties passed after 10 runs.");
    expect(output).not.toContain("Replaying");
    expect(output).not.toContain("Contract state");
  });

  it("does not report state without --snapshot", async () => {
    // Act
    const output = await run(["test", "--seed=1"]);

    // Assert
    expect(output).toContain("Error: Property failed after 5 tests.");
    expect(output).not.toContain("Replaying");
    expect(output).not.toContain("Contract state");
  });
});
