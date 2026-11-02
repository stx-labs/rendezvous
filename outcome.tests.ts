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
 * without requirements and returns the logs, exit code and the number of
 * persisted failures. Without bailing, fast-check shrinks the failure.
 */
const run = async (
  source: string,
  type: "test" | "invariant" = "test",
  bail = true,
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
  const logs: string[] = [];
  const radio = new EventEmitter();
  for (const event of ["logMessage", "logFailure", "logInfo"]) {
    radio.on(event, (message: string) => logs.push(message));
  }
  let unchecked = 0;
  radio.on("unchecked", () => unchecked++);
  process.exitCode = 0;
  // Keep failing runs from writing regression files to the working directory.
  const persist = vi
    .spyOn(persistence, "persistFailure")
    .mockImplementation(() => {});
  persist.mockClear();
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
    if (type === "test") {
      await checkProperties(
        simnet,
        resetSession,
        [contractId],
        functions,
        17,
        20,
        bail,
        false,
        radio,
        accounts,
        [simnet.deployer],
      );
    } else {
      await checkInvariants(
        simnet,
        resetSession,
        [contractId],
        functions,
        17,
        20,
        undefined,
        bail,
        false,
        radio,
        accounts,
        [simnet.deployer],
      );
    }
    return {
      logs: stripVTControlCharacters(logs.join("\n")),
      exitCode: process.exitCode,
      persisted: persist.mock.calls.length,
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
      expect(result.persisted).toBe(0);
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
    expect(result.logs).toMatch(/FAILED[\s│└─]*test-fail: x1/);
    expect(result.persisted).toBe(1);
  });
});

const context = `(define-map context (string-ascii 100) uint)
(define-private (update-context (name (string-ascii 100)) (calls uint))
  (ok (map-set context name calls)))`;

describe("Invariant testing outcomes", () => {
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
      expect(result.logs).toMatch(/FAILED[\s│└─]*invariant-fail: x1/);
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
  ])("stops the run when updating the context %s", async (_, body, reason) => {
    const result = await run(
      `(define-map context (string-ascii 100) uint)
(define-private (update-context (name (string-ascii 100)) (calls uint))
  ${body})
(define-public (touch) (ok true))
(define-read-only (invariant-pass) true)`,
      "invariant",
    );
    expect(result.logs).toContain("Could not update the context for touch:");
    expect(result.logs).toContain(reason);
    expect(result.logs).not.toContain("OK, invariants passed");
    expect(result.exitCode).toBe(1);
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
    expect(result.persisted).toBe(0);
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
    expect(result.persisted).toBe(0);
  });
});
