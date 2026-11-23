import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { getManifestFileName, main } from "./app";
import { helpMessage } from "./cli";
import { red } from "./colors";
import { getFailureFilePath } from "./persistence";
import * as persistence from "./persistence";
import { LOG_DIVIDER } from "./shared";
import { createIsolatedTestEnvironment } from "./test.utils";

const isolatedTestEnvPrefix = "rendezvous-test-app-";

describe("Command-line arguments handling", () => {
  const initialArgv = process.argv;

  const noManifestMessage = red(
    `\nNo path to Clarinet project provided. Supply it immediately or face the relentless scrutiny of your contract's vulnerabilities.`,
  );
  const noContractNameMessage = red(
    `\nNo target contract name provided. Please provide the contract name to be fuzzed.`,
  );
  const manifestDirPlaceholder = "isolated-example";

  it("returns cleanly when --help is specified", async () => {
    // Arrange
    process.argv = ["node", "app.js", "--help"];
    const consoleLogs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((message: string) => {
      consoleLogs.push(message);
    });

    // Act
    await main();

    // Assert
    expect(consoleLogs).toContain(helpMessage);

    // Teardown
    process.argv = initialArgv;
    vi.restoreAllMocks();
  });

  it.each([
    ["manifest path", ["node", "app.js"]],
    ["target contract name", ["node", "app.js", "./path/to/clarinet/project"]],
  ])(
    "exits with code 1 when %s is not provided",
    async (_testCase: string, argv: string[]) => {
      // Arrange
      process.argv = argv;
      const mockExit = vi.spyOn(process, "exit").mockImplementation(((
        _code?: number,
      ) => {
        throw new Error("process.exit");
      }) as () => never);

      // Act & Assert
      await expect(main()).rejects.toThrow("process.exit");
      expect(mockExit).toHaveBeenCalledWith(1);

      // Teardown
      process.argv = initialArgv;
      vi.restoreAllMocks();
    },
  );

  it.each([
    ["manifest path", ["node", "app.js"], noManifestMessage],
    [
      "target contract name",
      ["node", "app.js", "./path/to/clarinet/project"],
      noContractNameMessage,
    ],
  ])(
    "logs the error and help message when the %s is not provided",
    async (_testCase: string, argv: string[], expectedError: string) => {
      // Arrange
      process.argv = argv;
      const consoleLogs: string[] = [];
      const consoleErrors: string[] = [];
      vi.spyOn(console, "log").mockImplementation((message: string) => {
        consoleLogs.push(message);
      });
      vi.spyOn(console, "error").mockImplementation((message: string) => {
        consoleErrors.push(message);
      });
      vi.spyOn(process, "exit").mockImplementation(((_code?: number) => {
        throw new Error("process.exit");
      }) as () => never);

      // Act
      await expect(main()).rejects.toThrow("process.exit");

      // Assert
      expect(consoleErrors).toContain(expectedError);
      expect(consoleLogs).toContain(helpMessage);

      // Teardown
      process.argv = initialArgv;
      vi.restoreAllMocks();
    },
  );

  it.each([
    [
      ["no command-line arguments"],
      ["node", "app.js"],
      [noManifestMessage, helpMessage],
    ],
    [
      ["manifest path"],
      ["node", "app.js", manifestDirPlaceholder],
      [noContractNameMessage, helpMessage],
    ],
    [
      ["manifest path", "contract name"],
      ["node", "app.js", manifestDirPlaceholder, "counter"],
      [
        red(
          `\nInvalid type provided. Please provide the type of test to be executed. Possible values: test, invariant.`,
        ),
        helpMessage,
      ],
    ],
    [
      ["manifest path", "contract name", "seed", "bail"],
      ["node", "app.js", manifestDirPlaceholder, "counter", "--bail"],
      [
        red(
          `\nInvalid type provided. Please provide the type of test to be executed. Possible values: test, invariant.`,
        ),
        helpMessage,
      ],
    ],
    [
      ["manifest path", "contract name", "seed"],
      ["node", "app.js", manifestDirPlaceholder, "counter", "--seed=123"],
      [
        red(
          `\nInvalid type provided. Please provide the type of test to be executed. Possible values: test, invariant.`,
        ),
        helpMessage,
      ],
    ],
    [
      ["manifest path", "contract name", "runs"],
      ["node", "app.js", manifestDirPlaceholder, "counter", "--runs=10"],
      [
        red(
          `\nInvalid type provided. Please provide the type of test to be executed. Possible values: test, invariant.`,
        ),
        helpMessage,
      ],
    ],
    [
      ["manifest path", "contract name", "seed", "runs"],
      [
        "node",
        "app.js",
        manifestDirPlaceholder,
        "counter",
        "--seed=123",
        "--runs=10",
      ],
      [
        red(
          `\nInvalid type provided. Please provide the type of test to be executed. Possible values: test, invariant.`,
        ),
        helpMessage,
      ],
    ],
    [
      ["manifest path", "contract name", "type=invariant"],
      ["node", "app.js", manifestDirPlaceholder, "counter", "invariant"],
      [
        LOG_DIVIDER,
        `Using manifest path: ${manifestDirPlaceholder}/Clarinet.toml`,
        `Target contract: counter`,
        LOG_DIVIDER,
      ],
    ],

    [
      ["manifest path", "contract name", "type=InVaRiAnT (case-insensitive)"],
      ["node", "app.js", manifestDirPlaceholder, "counter", "InVaRiAnT"],
      [
        LOG_DIVIDER,
        `Using manifest path: ${manifestDirPlaceholder}/Clarinet.toml`,
        `Target contract: counter`,
        LOG_DIVIDER,
      ],
    ],
    [
      ["manifest path", "contract name", "type=invariant", "regr"],
      [
        "node",
        "app.js",
        manifestDirPlaceholder,
        "counter",
        "invariant",
        "--regr",
      ],
      [
        LOG_DIVIDER,
        `Using manifest path: ${manifestDirPlaceholder}/Clarinet.toml`,
        `Target contract: counter`,
        `Running regression tests.`,
        `Regressions loaded from: ${resolve(getFailureFilePath("ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.counter"))}`,
        LOG_DIVIDER,
      ],
    ],
    [
      ["manifest path", "contract name", "type=invariant", "bail"],
      [
        "node",
        "app.js",
        manifestDirPlaceholder,
        "counter",
        "invariant",
        "--bail",
      ],
      [
        LOG_DIVIDER,
        `Using manifest path: ${manifestDirPlaceholder}/Clarinet.toml`,
        `Target contract: counter`,
        `Bailing on first failure.`,
        LOG_DIVIDER,
      ],
    ],
    [
      ["manifest path", "contract name", "type=invariant", "dialers file path"],
      [
        "node",
        "app.js",
        manifestDirPlaceholder,
        "counter",
        "invariant",
        "--dial=example/sip010.cjs",
      ],
      [
        LOG_DIVIDER,
        `Using manifest path: ${manifestDirPlaceholder}/Clarinet.toml`,
        `Target contract: counter`,
        `Using dial path: example/sip010.cjs`,
        LOG_DIVIDER,
      ],
    ],
    [
      ["manifest path", "contract name", "type=test"],
      ["node", "app.js", manifestDirPlaceholder, "counter", "test"],
      [
        LOG_DIVIDER,
        `Using manifest path: ${manifestDirPlaceholder}/Clarinet.toml`,
        `Target contract: counter`,
        LOG_DIVIDER,
      ],
    ],
    [
      ["manifest path", "contract name", "type=tESt (case-insensitive)"],
      ["node", "app.js", manifestDirPlaceholder, "counter", "tESt"],
      [
        LOG_DIVIDER,
        `Using manifest path: ${manifestDirPlaceholder}/Clarinet.toml`,
        `Target contract: counter`,
        LOG_DIVIDER,
      ],
    ],
    [
      ["manifest path", "contract name", "type=test", "regr"],
      ["node", "app.js", manifestDirPlaceholder, "counter", "test", "--regr"],
      [
        LOG_DIVIDER,
        `Using manifest path: ${manifestDirPlaceholder}/Clarinet.toml`,
        `Target contract: counter`,
        `Running regression tests.`,
        `Regressions loaded from: ${resolve(getFailureFilePath("ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.counter"))}`,
        LOG_DIVIDER,
      ],
    ],
    [
      ["manifest path", "contract name", "type=test", "bail"],
      ["node", "app.js", manifestDirPlaceholder, "counter", "test", "--bail"],
      [
        LOG_DIVIDER,
        `Using manifest path: ${manifestDirPlaceholder}/Clarinet.toml`,
        `Target contract: counter`,
        `Bailing on first failure.`,
        LOG_DIVIDER,
      ],
    ],
    [
      ["manifest path", "contract name", "type=invariant", "seed"],
      [
        "node",
        "app.js",
        manifestDirPlaceholder,
        "counter",
        "invariant",
        "--seed=123",
      ],
      [
        LOG_DIVIDER,
        `Using manifest path: ${manifestDirPlaceholder}/Clarinet.toml`,
        `Target contract: counter`,
        `Using seed: 123`,
        LOG_DIVIDER,
      ],
    ],
    [
      [
        "manifest path",
        "contract name",
        "type=invARiaNT (case-insensitive)",
        "seed",
      ],
      [
        "node",
        "app.js",
        manifestDirPlaceholder,
        "counter",
        "invARiaNT",
        "--seed=123",
      ],
      [
        LOG_DIVIDER,
        `Using manifest path: ${manifestDirPlaceholder}/Clarinet.toml`,
        `Target contract: counter`,
        `Using seed: 123`,
        LOG_DIVIDER,
      ],
    ],
    [
      ["manifest path", "contract name", "type=test", "seed"],
      [
        "node",
        "app.js",
        manifestDirPlaceholder,
        "counter",
        "test",
        "--seed=123",
      ],
      [
        LOG_DIVIDER,
        `Using manifest path: ${manifestDirPlaceholder}/Clarinet.toml`,
        `Target contract: counter`,
        `Using seed: 123`,
        LOG_DIVIDER,
      ],
    ],
    [
      ["manifest path", "contract name = reverse", "type=test", "seed"],
      [
        "node",
        "app.js",
        manifestDirPlaceholder,
        "reverse",
        "test",
        "--seed=123",
      ],
      [
        LOG_DIVIDER,
        `Using manifest path: ${manifestDirPlaceholder}/Clarinet.toml`,
        `Target contract: reverse`,
        `Using seed: 123`,
        LOG_DIVIDER,
      ],
    ],
    [
      ["manifest path", "contract name = slice", "type=test", "seed"],
      ["node", "app.js", manifestDirPlaceholder, "slice", "test", "--seed=123"],
      [
        LOG_DIVIDER,
        `Using manifest path: ${manifestDirPlaceholder}/Clarinet.toml`,
        `Target contract: slice`,
        `Using seed: 123`,
        LOG_DIVIDER,
      ],
    ],
    [
      [
        "manifest path",
        "contract name",
        "type=teSt (case-insensitive)",
        "seed",
      ],
      [
        "node",
        "app.js",
        manifestDirPlaceholder,
        "counter",
        "teSt",
        "--seed=123",
      ],
      [
        LOG_DIVIDER,
        `Using manifest path: ${manifestDirPlaceholder}/Clarinet.toml`,
        `Target contract: counter`,
        `Using seed: 123`,
        LOG_DIVIDER,
      ],
    ],
    [
      ["manifest path", "contract name", "type=test", "seed", "runs", "bail"],
      [
        "node",
        "app.js",
        manifestDirPlaceholder,
        "counter",
        "test",
        "--seed=123",
        "--runs=10",
        "--bail",
      ],
      [
        LOG_DIVIDER,
        `Using manifest path: ${manifestDirPlaceholder}/Clarinet.toml`,
        `Target contract: counter`,
        `Using seed: 123`,
        `Using runs: 10`,
        `Bailing on first failure.`,
        LOG_DIVIDER,
      ],
    ],
    [
      [
        "manifest path",
        "contract name",
        "type=invariant",
        "seed",
        "runs",
        "bail",
      ],
      [
        "node",
        "app.js",
        manifestDirPlaceholder,
        "counter",
        "invariant",
        "--seed=123",
        "--runs=10",
        "--bail",
      ],
      [
        LOG_DIVIDER,
        `Using manifest path: ${manifestDirPlaceholder}/Clarinet.toml`,
        `Target contract: counter`,
        `Using seed: 123`,
        `Using runs: 10`,
        `Bailing on first failure.`,
        LOG_DIVIDER,
      ],
    ],
  ])(
    "prints the correct logs when arguments %p are provided",
    async (_testCase: string[], argv: string[], expectedLogs: string[]) => {
      // Setup
      const tempDir = createIsolatedTestEnvironment(
        resolve(__dirname, "example"),
        isolatedTestEnvPrefix,
      );

      // Update argv to use the isolated test environment.
      const updatedArgv = argv.map((arg) =>
        arg === manifestDirPlaceholder ? tempDir : arg,
      );
      process.argv = updatedArgv;

      const allLogs: string[] = [];
      vi.spyOn(console, "log").mockImplementation((message: string) => {
        allLogs.push(message);
      });
      vi.spyOn(console, "error").mockImplementation((message: string) => {
        allLogs.push(message);
      });
      vi.spyOn(process, "exit").mockImplementation(((_code?: number) => {
        throw new Error("process.exit");
      }) as () => never);

      // Exercise
      try {
        await main();
      } catch {
        // Do nothing.
      }

      // Verify
      expectedLogs.forEach((expectedLog) => {
        // Update expected log to use the isolated test environment path.
        const updatedExpectedLog = expectedLog.startsWith(
          "Using manifest path:",
        )
          ? expectedLog.replace(manifestDirPlaceholder, tempDir)
          : expectedLog;

        expect(allLogs).toContain(updatedExpectedLog);
      });

      // Teardown
      process.argv = initialArgv;
      vi.restoreAllMocks();
      rmSync(tempDir, { recursive: true, force: true });
    },
  );
});

describe("Fail on unchecked", () => {
  const cases = {
    test: {
      source: "(define-private (test-discard) (ok false))",
      warning: "Warning: not checked after 20 runs: test-discard.",
    },
    invariant: {
      source: `(define-private (update-context (name (string-ascii 100))
                                       (calls uint)) (ok true))
(define-public (explode) (ok (/ u1 u0)))
(define-read-only (invariant-pass) true)`,
      warning: "Warning: inconclusive after 20 runs: every public call threw.",
    },
  };

  it.each([
    ["test", false],
    ["test", true],
    ["invariant", false],
    ["invariant", true],
  ] as const)(
    "fails a %s run without checks only on request (%j)",
    async (type, strict) => {
      const { source, warning } = cases[type];
      const tempDir = createIsolatedTestEnvironment(
        resolve(__dirname, "example"),
        isolatedTestEnvPrefix,
      );
      const initialArgv = process.argv;
      const initialExitCode = process.exitCode;
      try {
        writeFileSync(join(tempDir, "contracts/counter.clar"), source);
        process.argv = [
          "node",
          "app.js",
          tempDir,
          "counter",
          type,
          "--seed=17",
          "--runs=20",
          ...(strict ? ["--fail-on-unchecked"] : []),
        ];
        const logs: string[] = [];
        for (const method of ["log", "info", "error"] as const) {
          vi.spyOn(console, method).mockImplementation((message: string) => {
            logs.push(message);
          });
        }
        process.exitCode = undefined;

        await main();

        const output = logs.join("\n");
        expect(output).toContain(warning);
        expect(output).not.toContain("passed after");
        expect(
          output.split("Failing the run because of --fail-on-unchecked."),
        ).toHaveLength(strict ? 2 : 1);
        expect(process.exitCode).toBe(strict ? 1 : undefined);
      } finally {
        process.exitCode = initialExitCode;
        process.argv = initialArgv;
        vi.restoreAllMocks();
        rmSync(tempDir, { recursive: true, force: true });
      }
    },
  );
});

describe("Contract selection", () => {
  const initialArgv = process.argv;

  it("logs an error when the contract is not found among project contracts", async () => {
    // Setup
    const tempDir = createIsolatedTestEnvironment(
      resolve(__dirname, "example"),
      isolatedTestEnvPrefix,
    );
    process.argv = ["node", "app.js", tempDir, "nonexistent", "test"];
    const initialExitCode = process.exitCode;

    const consoleErrors: string[] = [];
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation((message: string) => {
      consoleErrors.push(message);
    });

    // Exercise
    await main();

    // Verify
    expect(consoleErrors).toContain(
      red(`\nContract "nonexistent" not found among project contracts.\n`),
    );
    expect(process.exitCode).toBe(1);

    // Teardown
    process.exitCode = initialExitCode;
    process.argv = initialArgv;
    vi.restoreAllMocks();
    rmSync(tempDir, { recursive: true, force: true });
  });
});

describe("Function name patterns", () => {
  const source = `(define-private (update-context (name (string-ascii 100))
                                                (calls uint)) (ok true))
(define-public (increment) (ok true))
(define-private (test-passes) (ok true))
(define-private (test-fails) (err u1))
(define-read-only (invariant-passes) true)
(define-read-only (invariant-fails) false)
(define-trait missing ((read () (response uint uint))))
(define-private (test-missing (target <missing>)) (ok true))
(define-read-only (invariant-missing (target <missing>)) true)`;

  const run = async (type: string, pattern?: string) => {
    const tempDir = createIsolatedTestEnvironment(
      resolve(__dirname, "example"),
      `${isolatedTestEnvPrefix}pattern-`,
    );
    const initialArgv = process.argv;
    const initialExitCode = process.exitCode;
    const logs: string[] = [];
    const persist = vi
      .spyOn(persistence, "persistFailure")
      .mockImplementation(() => {});
    try {
      writeFileSync(join(tempDir, "contracts/counter.clar"), source);
      process.argv = [
        "node",
        "app.js",
        tempDir,
        "counter",
        type,
        ...(pattern === undefined ? [] : [pattern]),
        "--seed=17",
        "--runs=10",
        "--bail",
      ];
      for (const method of ["log", "info", "error"] as const) {
        vi.spyOn(console, method).mockImplementation((message: string) => {
          logs.push(String(message));
        });
      }
      process.exitCode = undefined;
      await main();
      return {
        output: logs.join("\n"),
        exitCode: process.exitCode,
        saved: persist.mock.calls.length,
      };
    } finally {
      process.argv = initialArgv;
      process.exitCode = initialExitCode;
      vi.restoreAllMocks();
      rmSync(tempDir, { recursive: true, force: true });
    }
  };

  it.each([
    ["test", "absent"],
    ["test", "missing"],
    ["invariant", "absent"],
    ["invariant", "missing"],
  ])("fails when %s-%s has no executable matches", async (type, name) => {
    const result = await run(type, `${type}-${name}`);
    expect(result.exitCode).toBe(1);
    expect(result.output).toMatch(/no executable .*match/i);
    expect(result.output).toContain(`${type}-${name}`);
    expect(result.saved).toBe(0);
  });

  it.each(["test", "invariant"])(
    "selects only matching %s functions",
    async (type) => {
      const result = await run(type, `${type}-passes`);
      expect(result.output).toMatch(/\[PASS\].*passes/);
      expect(result.output).not.toMatch(/\[FAIL\]/);
      expect(result.exitCode).toBeUndefined();
      expect(result.saved).toBe(0);
    },
  );

  it.each(["test", "invariant"])(
    "does not save a filtered %s failure",
    async (type) => {
      const filtered = await run(type, `${type}-fails`);
      expect(filtered.exitCode).toBe(1);
      expect(filtered.output).toMatch(/\[FAIL\].*fails/);
      expect(filtered.output).toMatch(
        /regression.*not saved|not sav.*regression/i,
      );
      expect(filtered.output).toContain("--seed=17");
      expect(filtered.saved).toBe(0);

      const unpatterned = await run(type);
      expect(unpatterned.exitCode).toBe(1);
      expect(unpatterned.saved).toBe(1);
      expect(unpatterned.output).not.toMatch(
        /regression.*not saved|not sav.*regression/i,
      );
    },
  );
});

describe("Custom manifest detection", () => {
  it("returns the default manifest file name for the example project", () => {
    // Arrange
    const manifestDir = "example";
    const targetContractName = "counter";

    // Act
    const actual = getManifestFileName(manifestDir, targetContractName);

    // Assert
    expect(actual).toBe("Clarinet.toml");
  });

  it("returns the custom manifest file name when it exists", () => {
    // Setup
    const manifestDir = mkdtempSync(join(tmpdir(), isolatedTestEnvPrefix));
    const targetContractName = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
    const expected = `Clarinet-${targetContractName}.toml`;
    writeFileSync(join(manifestDir, expected), "");

    // Exercise
    const actual = getManifestFileName(manifestDir, targetContractName);

    // Verify
    expect(actual).toBe(expected);

    // Teardown
    rmSync(manifestDir, { recursive: true, force: true });
  });
});
