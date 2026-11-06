import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";

import { initSimnet } from "@stacks/clarinet-sdk";

import { checkInvariants } from "./invariant";
import * as persistence from "./persistence";
import { checkProperties } from "./property";
import { getFunctionsFromContractInterfaces } from "./shared";

const originalExitCode = process.exitCode;
afterEach(() => {
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
});

/**
 * Runs Rendezvous against a single contract in a temporary Clarinet project
 * without requirements and returns the logs, exit code and the counterexample
 * paths of the persisted failures. Without bailing, fast-check shrinks the
 * failure.
 */
const run = async (
  source: string,
  type: "test" | "invariant" = "test",
  bail = true,
  regr = false,
  dialSource?: string,
) => {
  const directory = mkdtempSync(join(tmpdir(), "rendezvous-test-outcome-"));
  mkdirSync(join(directory, "settings"));
  writeFileSync(
    join(directory, "Clarinet.toml"),
    `[project]
name = 'outcome'
telemetry = false
[contracts.fixture]
path = 'fixture.clar'
clarity_version = 3
epoch = 3.0
`,
  );
  writeFileSync(join(directory, "fixture.clar"), source);
  writeFileSync(
    join(directory, "settings/Devnet.toml"),
    `[network]
name = "devnet"
[accounts.deployer]
mnemonic = "${
      "abandon abandon abandon abandon abandon abandon " +
      "abandon abandon abandon abandon abandon about"
    }"
balance = 100000000000000
`,
  );
  const dialPath = dialSource && join(directory, "dialer.mjs");
  if (dialPath) {
    writeFileSync(dialPath, dialSource);
  }
  const logs: string[] = [];
  const radio = new EventEmitter();
  for (const event of ["logMessage", "logFailure", "logInfo"]) {
    radio.on(event, (message: string) => logs.push(message));
  }
  let unchecked = 0;
  radio.on("unchecked", () => unchecked++);
  process.exitCode = 0;
  // Keep failing runs from writing regression files to the working directory.
  const saveFailure = persistence.persistFailure;
  const readFailures = persistence.loadFailures;
  const persist = vi
    .spyOn(persistence, "persistFailure")
    .mockImplementation(() => {});
  persist.mockClear();
  if (dialPath) {
    persist.mockImplementation((details, kind, id, dial) =>
      saveFailure(details, kind, id, dial, { baseDir: directory }),
    );
    vi.spyOn(persistence, "loadFailures").mockImplementation((id, kind) =>
      readFailures(id, kind, { baseDir: directory }),
    );
  }
  const manifestPath = join(directory, "Clarinet.toml");
  try {
    const simnet = await initSimnet(manifestPath);
    const contractId = `${simnet.deployer}.fixture`;
    const contractInterface = simnet.getContractsInterfaces().get(contractId)!;
    const functions = getFunctionsFromContractInterfaces(
      new Map([[contractId, contractInterface]]),
    );
    const accounts = new Map([["deployer", simnet.deployer]]);
    const resetSession = async () => {
      await initSimnet(manifestPath);
    };
    const runInvariant = (regression: boolean) =>
      checkInvariants(
        simnet,
        resetSession,
        [contractId],
        functions,
        17,
        20,
        dialPath,
        bail,
        regression,
        radio,
        accounts,
        [simnet.deployer],
      );
    if (type === "test") {
      await checkProperties(
        simnet,
        resetSession,
        [contractId],
        functions,
        17,
        20,
        bail,
        regr,
        radio,
        accounts,
        [simnet.deployer],
      );
    } else {
      await runInvariant(regr);
    }
    const firstLogs = stripVTControlCharacters(logs.join("\n"));
    const firstExit = process.exitCode;
    const records = dialPath
      ? persistence.loadFailures(contractId, "invariant")
      : [];
    let replayLogs = "";
    let replayExit: unknown = undefined;
    if (records.length) {
      logs.length = 0;
      process.exitCode = 0;
      await runInvariant(true);
      replayLogs = stripVTControlCharacters(logs.join("\n"));
      replayExit = process.exitCode;
    }
    return {
      records,
      replayLogs,
      replayExit,
      logs: firstLogs,
      exitCode: firstExit,
      paths: persist.mock.calls.map(([details]) => details.counterexamplePath),
      unchecked,
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

/** Runs each case with and without bailing, which skips shrinking. */
const withAndWithoutBail = (cases: [string, string][]) =>
  cases.flatMap(([name, source]) =>
    [true, false].map((bail): [string, string, boolean] => [
      name,
      source,
      bail,
    ]),
  );

describe("Property testing outcomes", () => {
  it.each([
    ["in-place discards", "(define-private (test-discard) (ok false))"],
    [
      "a discard function",
      "(define-read-only (can-test-discard) false) " +
        "(define-private (test-discard) (err u1))",
    ],
  ])(
    "does not report a test as passed when %s skip every case",
    async (_, source) => {
      const result = await run(source);
      expect(result.exitCode).toBe(0);
      expect(result.logs).toContain(
        "Warning: not checked after 20 runs: test-discard.",
      );
      expect(result.logs).not.toContain("properties passed");
      expect(result.paths).toHaveLength(0);
    },
  );

  it("does not let a passing test hide an unchecked test", async () => {
    const result = await run(
      "(define-private (test-pass) (ok true)) " +
        "(define-private (test-discard) (ok false))",
    );
    expect(result.exitCode).toBe(0);
    expect(result.logs).toContain(
      "Warning: not checked after 20 runs: test-discard.",
    );
    expect(result.logs).not.toContain("properties passed");
  });

  it("flags a run without test functions as unchecked", async () => {
    const result = await run("(define-read-only (get-one) u1)");
    expect(result.logs).toContain("No test functions found");
    expect(result.unchecked).toBe(1);
    expect(result.exitCode).toBe(0);
  });

  it("fails the run when a discard function is invalid", async () => {
    const result = await run(
      "(define-read-only (can-test-pass (x uint)) true) " +
        "(define-private (test-pass) (ok true))",
    );
    expect(result.logs).toContain("Parameter mismatch");
    expect(result.logs).not.toContain("properties passed");
    expect(result.exitCode).toBe(1);
  });

  it("flags a regression run without regressions as unchecked", async () => {
    vi.spyOn(persistence, "loadFailures").mockReturnValue([]);
    const result = await run(
      "(define-private (test-pass) (ok true))",
      "test",
      true,
      true,
    );
    expect(result.logs).toContain("0 regressions");
    expect(result.unchecked).toBe(1);
    expect(result.exitCode).toBe(0);
  });

  it("reports passing tests as passed", async () => {
    const result = await run("(define-private (test-pass) (ok true))");
    expect(result.exitCode).toBe(0);
    expect(result.logs).toContain("OK, properties passed after 20 runs.");
    expect(result.logs).not.toContain("Warning: not checked");
  });

  it.each(
    withAndWithoutBail([
      ["an error result", "(define-private (test-fail) (err u1))"],
      [
        "a runtime error in the test",
        "(define-private (test-fail) (ok (/ u1 u0)))",
      ],
      [
        "a runtime error in the discard function",
        "(define-read-only (can-test-fail) (is-eq (/ u1 u0) u0)) " +
          "(define-private (test-fail) (ok true))",
      ],
    ]),
  )("counts %s as a single failure (bail: %j)", async (_, source, bail) => {
    const result = await run(source, "test", bail);
    expect(result.exitCode).toBe(1);
    expect(result.logs).toMatch(/FAILED[\s│└─]*test-fail: x1\b/);
    expect(result.paths).toEqual([expect.stringMatching(/^\d+(:\d+)*$/)]);
    expect(result.logs.split("\n")).toContain(
      `Counterexample path : ${result.paths[0]}`,
    );
  });
});

const context = `(define-map context (string-ascii 100) uint)
(define-private (update-context (name (string-ascii 100)) (calls uint))
  (ok (map-set context name calls)))`;

describe("Invariant testing outcomes", () => {
  it("reports and replays an outside-in failure", async () => {
    const result = await run(
      `${context}
(define-data-var total uint u0)
(define-public (touch (n uint)) (begin (var-set total (+ (var-get total) u1)) (ok n)))
(define-read-only (invariant-pass) true)`,
      "invariant",
      false,
      false,
      `export const postCheck = ({ simnet, contractId, functionCall }) => {
        if (!functionCall || !contractId.endsWith(".fixture")) throw Error("bad context");
        const value = simnet.getDataVar(contractId, "total");
        if (value.value >= 1n) throw Error("outside balance failure");
      };`,
    );
    expect(result.exitCode).toBe(1);
    expect(result.logs).toContain("Post-dialer failed");
    expect(result.logs).toContain("outside balance failure");
    expect(result.logs).not.toContain("- Invariant: invariant-pass");
    expect(result.logs).toMatch(/- Functions: touch \(public\)/);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      seed: 17,
      dial: expect.stringContaining("dialer.mjs"),
      counterexamplePath: expect.any(String),
    });
    expect(result.replayExit).toBe(1);
    expect(result.replayLogs).toContain("outside balance failure");
    const sequence = (logs: string) =>
      logs.match(/- Functions:.*\n- Arguments:.*\n- Callers  :.*/)?.[0];
    expect(sequence(result.replayLogs)).toEqual(sequence(result.logs));
  });

  it.each([
    ["null", "null"],
    ["undefined", "undefined"],
    ['"bad balance"', "bad balance"],
    ['({ message: "balance mismatch" })', "balance mismatch"],
    [
      '({ get message() { throw Error("nested"); } })',
      "Unprintable thrown value",
    ],
    ['({ toString() { throw Error("nested"); } })', "Unprintable thrown value"],
  ])("reports and saves a post-dialer throwing %s", async (thrown, message) => {
    const result = await run(
      `${context} (define-public (touch) (ok true)) (define-read-only (invariant-pass) true)`,
      "invariant",
      true,
      false,
      `export const postCheck = () => { throw ${thrown}; };`,
    );
    expect(result.exitCode).toBe(1);
    expect(result.logs).toContain("Post-dialer failed");
    expect(result.logs).toContain(message);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      seed: 17,
      dial: expect.stringContaining("dialer.mjs"),
    });
    expect(result.replayExit).toBe(1);
    expect(result.replayLogs).toContain(message);
  });

  it("preserves passing outcomes with a post-dialer", async () => {
    const source = `${context} (define-data-var total uint u0) (define-public (touch) (begin (var-set total (+ u1 (var-get total))) (ok true))) (define-read-only (invariant-pass) true)`;
    const plain = await run(source, "invariant");
    const withDial = await run(
      source,
      "invariant",
      true,
      false,
      `let previous = 0n;
export const preCheck = ({ simnet, contractId, functionCall }) => { if (!contractId.endsWith(".fixture") || functionCall !== undefined || simnet.getDataVar(contractId, "total").value !== previous) throw Error("bad pre context or reset state"); };
export const postCheck = ({ simnet, contractId, functionCall }) => { if (!functionCall) throw Error("bad post context"); previous = simnet.getDataVar(contractId, "total").value; };`,
    );
    expect(withDial.exitCode).toBe(plain.exitCode);
    expect(withDial.logs).toContain("OK, invariants passed after 20 runs.");
    expect(withDial.records).toHaveLength(0);
  });

  it.each(
    withAndWithoutBail([
      ["a false result", "(define-read-only (invariant-fail) false)"],
      [
        "a runtime error",
        "(define-read-only (invariant-fail) (is-eq (/ u1 u0) u0))",
      ],
    ]),
  )(
    "counts %s as a single invariant failure (bail: %j)",
    async (_, invariant, bail) => {
      const result = await run(
        `${context} (define-public (touch) (ok true)) ${invariant}`,
        "invariant",
        bail,
      );
      expect(result.exitCode).toBe(1);
      expect(result.logs).toMatch(/FAILED[\s│└─]*invariant-fail: x1\b/);
      expect(result.paths).toEqual([expect.stringMatching(/^\d+(:\d+)*$/)]);
      expect(result.logs.split("\n")).toContain(
        `Counterexample path : ${result.paths[0]}`,
      );
    },
  );

  it.each([
    [
      "throws",
      "(ok (map-set context name (/ u1 (if (> calls u0) u0 u1))))",
      "DivisionByZero",
    ],
    [
      "returns an error",
      "(if (> calls u0) (err u7) (ok (map-set context name calls)))",
      "returned (err u7)",
    ],
    [
      "returns (ok false)",
      "(if (> calls u0) (ok false) (ok (map-set context name calls)))",
      "returned (ok false)",
    ],
  ])("stops the run when updating the context %s", async (_, body, reason) => {
    for (const bail of [true, false]) {
      const result = await run(
        `(define-map context (string-ascii 100) uint)
(define-private (update-context (name (string-ascii 100)) (calls uint))
  ${body})
(define-public (touch) (ok true))
(define-read-only (invariant-pass) true)`,
        "invariant",
        bail,
      );
      expect(result.logs).toContain(
        "Stopped the run: Could not update the context for touch:",
      );
      expect(result.logs).toContain(reason);
      // It is not an invariant failure, so it is neither blamed on an
      // invariant nor persisted as a regression.
      expect(result.logs).not.toContain("Counterexample");
      expect(result.logs).not.toContain("invariant-pass: x");
      expect(result.logs).not.toContain("OK, invariants passed");
      expect(result.paths).toHaveLength(0);
      expect(result.exitCode).toBe(1);
    }
  });

  it("flags a regression run without regressions as unchecked", async () => {
    vi.spyOn(persistence, "loadFailures").mockReturnValue([]);
    const result = await run(
      `${context} (define-public (touch) (ok true))
(define-read-only (invariant-pass) true)`,
      "invariant",
      true,
      true,
    );
    expect(result.logs).toContain("0 regressions");
    expect(result.unchecked).toBe(1);
    expect(result.exitCode).toBe(0);
  });

  it("flags a run without invariants as unchecked", async () => {
    const result = await run(
      `${context} (define-public (touch) (ok true))`,
      "invariant",
    );
    expect(result.logs).toContain("No invariant functions found");
    expect(result.unchecked).toBe(1);
    expect(result.exitCode).toBe(0);
  });

  it("reports all-thrown public calls as inconclusive", async () => {
    const result = await run(
      `${context}
(define-public (touch) (ok (/ u1 u0)))
(define-read-only (invariant-pass) true)`,
      "invariant",
    );
    expect(result.exitCode).toBe(0);
    expect(result.logs).toMatch(/IGNORED[\s│└─]*touch: x[1-9]/);
    expect(result.logs).toContain(
      "Warning: inconclusive after 20 runs: every public call threw.",
    );
    expect(result.logs).not.toContain("OK, invariants passed");
    expect(result.paths).toHaveLength(0);
  });

  it.each([
    ["returned errors", "(define-public (reject) (err u1))"],
    [
      "returned errors and throws",
      `(define-public (reject) (err u1))
(define-public (explode) (ok (/ u1 u0)))`,
    ],
    [
      "successes and throws",
      `(define-public (touch) (ok true))
(define-public (explode) (ok (/ u1 u0)))`,
    ],
  ])("keeps %s distinct from an all-thrown campaign", async (_, calls) => {
    const result = await run(
      `${context} ${calls} (define-read-only (invariant-pass) true)`,
      "invariant",
    );
    expect(result.exitCode).toBe(0);
    expect(result.logs).toContain("OK, invariants passed after 20 runs.");
    expect(result.logs).not.toContain("Warning:");
    expect(result.paths).toHaveLength(0);
  });
});
