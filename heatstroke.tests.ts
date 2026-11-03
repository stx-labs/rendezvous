import { EventEmitter } from "node:events";
import { rmSync } from "node:fs";
import { join, resolve } from "node:path";

import { initSimnet } from "@stacks/clarinet-sdk";
import type { ContractInterfaceFunction } from "@stacks/clarinet-sdk-wasm";
import { Cl, cvToString, type ClarityValue } from "@stacks/transactions";
import fc from "fast-check";

import { reporter, trackFailureStatistics } from "./heatstroke";
import { FalsifiedInvariantError } from "./invariant";
import { PropertyTestError } from "./property";
import { getContractNameFromContractId } from "./shared";
import { createIsolatedTestEnvironment } from "./test.utils";

const isolatedTestEnvPrefix = "rendezvous-test-heatstroke-";

const asciiString = () =>
  fc.string({
    unit: fc.constantFrom(
      ..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_",
    ),
    minLength: 1,
  });

const clarityStringUintBoolArg = () =>
  fc.oneof(
    asciiString().map((s) => Cl.stringAscii(s)),
    fc.nat().map((n) => Cl.uint(n)),
    fc.boolean().map((b) => Cl.bool(b)),
  );

const runWithTeardown = (
  tempDir: string,
  originalExitCode: typeof process.exitCode,
  run: () => void,
) => {
  try {
    run();
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
    process.exitCode = originalExitCode;
  }
};

describe("Custom reporter logging", () => {
  it("handles cases with missing path on failure for invariant testing type", async () => {
    // Setup
    const tempDir = createIsolatedTestEnvironment(
      resolve(__dirname, "example"),
      isolatedTestEnvPrefix,
    );
    const manifestPath = join(tempDir, "Clarinet.toml");
    const simnet = await initSimnet(manifestPath);

    const originalExitCode = process.exitCode;

    runWithTeardown(tempDir, originalExitCode, () => {
      fc.assert(
        fc.property(
          fc.record({
            failed: fc.constant(true),
            numRuns: fc.nat(),
            seed: fc.nat(),
            contractName: asciiString(),
            selectedFunctions: fc.array(
              fc.record({
                name: asciiString(),
                access: asciiString(),
                outputs: fc.array(asciiString()),
                args: fc.anything(),
              }),
            ),
            selectedFunctionsArgsList: fc.tuple(
              fc.array(clarityStringUintBoolArg()),
            ),
            selectedInvariant: fc.record({
              name: asciiString(),
              access: asciiString(),
              outputs: fc.array(asciiString()),
              args: fc.anything(),
            }),
            invariantArgs: fc.array(clarityStringUintBoolArg()),
            errorMessage: asciiString(),
            clarityError: asciiString(),
            sutCallers: fc.array(
              fc.constantFrom(
                ...new Map(
                  [...simnet.getAccounts()].filter(([key]) => key !== "faucet"),
                ).entries(),
              ),
            ),
            invariantCaller: fc.constantFrom(
              ...new Map(
                [...simnet.getAccounts()].filter(([key]) => key !== "faucet"),
              ).entries(),
            ),
          }),
          (r: {
            failed: boolean;
            numRuns: number;
            seed: number;
            contractName: string;
            selectedFunctions: {
              name: string;
              access: string;
              outputs: string[];
              args: any;
            }[];
            selectedFunctionsArgsList: ClarityValue[][];
            selectedInvariant: {
              name: string;
              access: string;
              outputs: string[];
              args: any;
            };
            invariantArgs: ClarityValue[];
            errorMessage: string;
            clarityError: string;
            sutCallers: [string, string][];
            invariantCaller: [string, string];
          }) => {
            const emittedErrorLogs: string[] = [];
            const radio = new EventEmitter();
            const rendezvousContractId = `ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.${r.contractName}`;

            radio.on("logFailure", (message: string) => {
              emittedErrorLogs.push(message);
            });

            const runDetails = {
              failed: r.failed,
              numRuns: r.numRuns,
              seed: r.seed,
              counterexample: [
                {
                  rendezvousContractId,
                  selectedFunctions:
                    r.selectedFunctions as any as ContractInterfaceFunction[],
                  selectedFunctionsArgsList: r.selectedFunctionsArgsList,
                  selectedInvariant:
                    r.selectedInvariant as any as ContractInterfaceFunction,
                  invariantArgs: r.invariantArgs,
                  sutCallers: r.sutCallers,
                  invariantCaller: r.invariantCaller,
                },
              ],
              error: new FalsifiedInvariantError(
                r.errorMessage,
                r.clarityError,
              ),
            };

            // Exercise
            reporter(runDetails, radio, "invariant", {});

            // Verify
            const expectedMessages = [
              `\nError: Property failed after ${r.numRuns} tests.`,
              `Seed : ${r.seed}`,
              `\nCounterexample:`,
              `- Contract : ${getContractNameFromContractId(
                rendezvousContractId,
              )}`,
              `- Functions: ${r.selectedFunctions
                .map((selectedFunction) => selectedFunction.name)
                .join(", ")} (${r.selectedFunctions
                .map((selectedFunction) => selectedFunction.access)
                .join(", ")})`,
              `- Arguments: ${r.selectedFunctionsArgsList
                .map((selectedFunctionArgs) =>
                  selectedFunctionArgs.map((cv) => cvToString(cv)).join(" "),
                )
                .join(", ")}`,
              `- Callers  : ${r.sutCallers
                .map((sutCaller) => sutCaller[0])
                .join(", ")}`,
              `- Outputs  : ${r.selectedFunctions
                .map((selectedFunction) =>
                  JSON.stringify(selectedFunction.outputs),
                )
                .join(", ")}`,
              `- Invariant: ${r.selectedInvariant.name} (${r.selectedInvariant.access})`,
              `- Arguments: ${r.invariantArgs
                .map((cv) => cvToString(cv))
                .join(" ")}`,
              `- Caller   : ${r.invariantCaller[0]}`,
              `\nWhat happened? Rendezvous went on a rampage and found a weak spot:\n`,
              `The invariant "${
                r.selectedInvariant.name
              }" returned:\n\n${runDetails.error?.clarityError
                ?.toString()
                .split("\n")
                .map((line) => "    " + line)
                .join("\n")}\n`,
            ];

            expect(emittedErrorLogs).toEqual(expectedMessages);
          },
        ),
        { numRuns: 10 },
      );
    });
  });

  it("handles cases with a specified path on failure for invariant testing type", async () => {
    // Setup
    const tempDir = createIsolatedTestEnvironment(
      resolve(__dirname, "example"),
      isolatedTestEnvPrefix,
    );
    const manifestPath = join(tempDir, "Clarinet.toml");
    const simnet = await initSimnet(manifestPath);

    const originalExitCode = process.exitCode;

    runWithTeardown(tempDir, originalExitCode, () => {
      fc.assert(
        fc.property(
          fc.record({
            counterexamplePath: asciiString(),
            failed: fc.constant(true),
            numRuns: fc.nat(),
            seed: fc.nat(),
            contractName: asciiString(),
            selectedFunctions: fc.array(
              fc.record({
                name: asciiString(),
                access: asciiString(),
                outputs: fc.array(asciiString()),
                args: fc.anything(),
              }),
            ),
            selectedFunctionsArgsList: fc.tuple(
              fc.array(clarityStringUintBoolArg()),
            ),
            selectedInvariant: fc.record({
              name: asciiString(),
              access: asciiString(),
              outputs: fc.array(asciiString()),
              args: fc.anything(),
            }),
            invariantArgs: fc.array(clarityStringUintBoolArg()),
            errorMessage: asciiString(),
            clarityError: asciiString(),
            sutCallers: fc.array(
              fc.constantFrom(
                ...new Map(
                  [...simnet.getAccounts()].filter(([key]) => key !== "faucet"),
                ).entries(),
              ),
            ),
            invariantCaller: fc.constantFrom(
              ...new Map(
                [...simnet.getAccounts()].filter(([key]) => key !== "faucet"),
              ).entries(),
            ),
          }),
          (r: {
            counterexamplePath: string;
            failed: boolean;
            numRuns: number;
            seed: number;
            contractName: string;
            selectedFunctions: {
              name: string;
              access: string;
              outputs: string[];
              args: any;
            }[];
            selectedFunctionsArgsList: ClarityValue[][];
            selectedInvariant: {
              name: string;
              access: string;
              outputs: string[];
              args: any;
            };
            invariantArgs: ClarityValue[];
            errorMessage: string;
            clarityError: string;
            sutCallers: [string, string][];
            invariantCaller: [string, string];
          }) => {
            const emittedErrorLogs: string[] = [];
            const radio = new EventEmitter();
            const rendezvousContractId = `ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.${r.contractName}`;

            radio.on("logFailure", (message: string) => {
              emittedErrorLogs.push(message);
            });

            const runDetails = {
              counterexamplePath: r.counterexamplePath,
              failed: r.failed,
              numRuns: r.numRuns,
              seed: r.seed,
              counterexample: [
                {
                  rendezvousContractId,
                  selectedFunctions:
                    r.selectedFunctions as any as ContractInterfaceFunction[],
                  selectedFunctionsArgsList: r.selectedFunctionsArgsList,
                  selectedInvariant:
                    r.selectedInvariant as any as ContractInterfaceFunction,
                  invariantArgs: r.invariantArgs,
                  sutCallers: r.sutCallers,
                  invariantCaller: r.invariantCaller,
                },
              ],
              error: new FalsifiedInvariantError(
                r.errorMessage,
                r.clarityError,
              ),
            };

            // Exercise
            reporter(runDetails, radio, "invariant", {});

            // Verify
            const expectedMessages = [
              `\nError: Property failed after ${r.numRuns} tests.`,
              `Seed : ${r.seed}`,
              `Path : ${r.counterexamplePath}`,
              `\nCounterexample:`,
              `- Contract : ${getContractNameFromContractId(
                rendezvousContractId,
              )}`,
              `- Functions: ${r.selectedFunctions
                .map((selectedFunction) => selectedFunction.name)
                .join(", ")} (${r.selectedFunctions
                .map((selectedFunction) => selectedFunction.access)
                .join(", ")})`,
              `- Arguments: ${r.selectedFunctionsArgsList
                .map((selectedFunctionArgs) =>
                  selectedFunctionArgs.map((cv) => cvToString(cv)).join(" "),
                )
                .join(", ")}`,
              `- Callers  : ${r.sutCallers
                .map((sutCaller) => sutCaller[0])
                .join(", ")}`,
              `- Outputs  : ${r.selectedFunctions
                .map((selectedFunction) =>
                  JSON.stringify(selectedFunction.outputs),
                )
                .join(", ")}`,
              `- Invariant: ${r.selectedInvariant.name} (${r.selectedInvariant.access})`,
              `- Arguments: ${r.invariantArgs
                .map((cv) => cvToString(cv))
                .join(" ")}`,
              `- Caller   : ${r.invariantCaller[0]}`,
              `\nWhat happened? Rendezvous went on a rampage and found a weak spot:\n`,
              `The invariant "${
                r.selectedInvariant.name
              }" returned:\n\n${runDetails.error?.clarityError
                ?.toString()
                .split("\n")
                .map((line) => "    " + line)
                .join("\n")}\n`,
            ];

            expect(emittedErrorLogs).toEqual(expectedMessages);
            radio.removeAllListeners();
          },
        ),
        { numRuns: 10 },
      );
    });
  });

  it("does not log anything on success for invariant testing type", async () => {
    // Setup
    const tempDir = createIsolatedTestEnvironment(
      resolve(__dirname, "example"),
      isolatedTestEnvPrefix,
    );
    const manifestPath = join(tempDir, "Clarinet.toml");
    const simnet = await initSimnet(manifestPath);

    const originalExitCode = process.exitCode;

    runWithTeardown(tempDir, originalExitCode, () => {
      fc.assert(
        fc.property(
          fc.record({
            counterexamplePath: asciiString(),
            failed: fc.constant(false),
            numRuns: fc.nat(),
            seed: fc.nat(),
            contractName: asciiString(),
            selectedFunctions: fc.array(
              fc.record({
                name: asciiString(),
                access: asciiString(),
                outputs: fc.array(asciiString()),
                args: fc.anything(),
              }),
            ),
            selectedFunctionsArgsList: fc.tuple(
              fc.array(fc.oneof(asciiString(), fc.nat(), fc.boolean())),
            ),
            selectedInvariant: fc.record({
              name: asciiString(),
              access: asciiString(),
              outputs: fc.array(asciiString()),
              args: fc.anything(),
            }),
            invariantArgs: fc.array(
              fc.oneof(asciiString(), fc.nat(), fc.boolean()),
            ),
            errorMessage: asciiString(),
            sutCallers: fc.array(
              fc.constantFrom(
                ...new Map(
                  [...simnet.getAccounts()].filter(([key]) => key !== "faucet"),
                ).entries(),
              ),
            ),
            invariantCaller: fc.constantFrom(
              ...new Map(
                [...simnet.getAccounts()].filter(([key]) => key !== "faucet"),
              ).entries(),
            ),
          }),
          (r: {
            counterexamplePath: string;
            failed: boolean;
            numRuns: number;
            seed: number;
            contractName: string;
            selectedFunctions: {
              name: string;
              access: string;
              outputs: string[];
              args: any;
            }[];
            selectedFunctionsArgsList: (string | number | boolean)[][];
            selectedInvariant: {
              name: string;
              access: string;
              args: any;
              outputs: string[];
            };
            invariantArgs: (string | number | boolean)[];
            errorMessage: string;
            sutCallers: [string, string][];
            invariantCaller: [string, string];
          }) => {
            const emittedErrorLogs: string[] = [];
            const radio = new EventEmitter();
            const rendezvousContractId = `ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.${r.contractName}`;

            radio.on("logFailure", (message: string) => {
              emittedErrorLogs.push(message);
            });

            const runDetails = {
              counterexamplePath: r.counterexamplePath,
              failed: r.failed,
              numRuns: r.numRuns,
              seed: r.seed,
              counterexample: [
                {
                  rendezvousContractId,
                  selectedFunctions:
                    r.selectedFunctions as any as ContractInterfaceFunction[],
                  selectedFunctionsArgsList: r.selectedFunctionsArgsList,
                  selectedInvariant:
                    r.selectedInvariant as any as ContractInterfaceFunction,
                  invariantArgs: r.invariantArgs,
                  sutCallers: r.sutCallers,
                  invariantCaller: r.invariantCaller,
                },
              ],
              error: new Error(r.errorMessage),
            };

            // Exercise
            reporter(runDetails, radio, "invariant", {});

            // Verify
            expect(emittedErrorLogs).toEqual([]);
            radio.removeAllListeners();
          },
        ),
        { numRuns: 10 },
      );
    });
  });

  it("handles cases with missing path on failure for property testing type", async () => {
    // Setup
    const tempDir = createIsolatedTestEnvironment(
      resolve(__dirname, "example"),
      isolatedTestEnvPrefix,
    );
    const manifestPath = join(tempDir, "Clarinet.toml");
    const simnet = await initSimnet(manifestPath);

    const originalExitCode = process.exitCode;

    runWithTeardown(tempDir, originalExitCode, () => {
      fc.assert(
        fc.property(
          fc.record({
            failed: fc.constant(true),
            numRuns: fc.nat(),
            seed: fc.nat(),
            contractName: asciiString(),
            selectedTestFunction: fc.record({
              name: asciiString(),
              access: asciiString(),
              outputs: fc.array(asciiString()),
              args: fc.anything(),
            }),
            functionArgs: fc.array(clarityStringUintBoolArg()),
            errorMessage: asciiString(),
            clarityError: asciiString(),
            testCaller: fc.constantFrom(
              ...new Map(
                [...simnet.getAccounts()].filter(([key]) => key !== "faucet"),
              ).entries(),
            ),
          }),
          (r: {
            failed: boolean;
            numRuns: number;
            seed: number;
            contractName: string;
            selectedTestFunction: {
              name: string;
              access: string;
              outputs: string[];
              args: any;
            };
            functionArgs: ClarityValue[];
            errorMessage: string;
            clarityError: string;
            testCaller: [string, string];
          }) => {
            const emittedErrorLogs: string[] = [];
            const radio = new EventEmitter();
            const rendezvousContractId = `ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.${r.contractName}`;

            radio.on("logFailure", (message: string) => {
              emittedErrorLogs.push(message);
            });

            const runDetails = {
              failed: r.failed,
              numRuns: r.numRuns,
              seed: r.seed,
              counterexample: [
                {
                  rendezvousContractId,
                  selectedTestFunction:
                    r.selectedTestFunction as any as ContractInterfaceFunction,
                  functionArgs: r.functionArgs,
                  testCaller: r.testCaller,
                },
              ],
              error: new PropertyTestError(r.errorMessage, r.clarityError),
            };

            // Exercise
            reporter(runDetails, radio, "test", {});

            // Verify
            const expectedMessages = [
              `\nError: Property failed after ${r.numRuns} tests.`,
              `Seed : ${r.seed}`,
              `\nCounterexample:`,
              `- Contract : ${getContractNameFromContractId(
                rendezvousContractId,
              )}`,
              `- Test Function : ${r.selectedTestFunction.name} (${r.selectedTestFunction.access})`,
              `- Arguments     : ${r.functionArgs
                .map((cv) => cvToString(cv))
                .join(" ")}`,
              `- Caller        : ${r.testCaller[0]}`,
              `- Outputs       : ${JSON.stringify(
                r.selectedTestFunction.outputs,
              )}`,
              `\nWhat happened? Rendezvous went on a rampage and found a weak spot:\n`,
              `The test function "${
                r.selectedTestFunction.name
              }" returned:\n\n${runDetails.error?.clarityError
                ?.toString()
                .split("\n")
                .map((line) => "    " + line)
                .join("\n")}\n`,
            ];

            expect(emittedErrorLogs).toEqual(expectedMessages);
          },
        ),
        { numRuns: 10 },
      );
    });
  });

  it("handles cases with a specified path on failure for property testing type", async () => {
    // Setup
    const tempDir = createIsolatedTestEnvironment(
      resolve(__dirname, "example"),
      isolatedTestEnvPrefix,
    );
    const manifestPath = join(tempDir, "Clarinet.toml");
    const simnet = await initSimnet(manifestPath);

    const originalExitCode = process.exitCode;

    runWithTeardown(tempDir, originalExitCode, () => {
      fc.assert(
        fc.property(
          fc.record({
            counterexamplePath: asciiString(),
            failed: fc.constant(true),
            numRuns: fc.nat(),
            seed: fc.nat(),
            contractName: asciiString(),
            selectedTestFunction: fc.record({
              name: asciiString(),
              access: asciiString(),
              outputs: fc.array(asciiString()),
              args: fc.anything(),
            }),
            functionArgs: fc.array(clarityStringUintBoolArg()),
            errorMessage: asciiString(),
            clarityError: asciiString(),
            testCaller: fc.constantFrom(
              ...new Map(
                [...simnet.getAccounts()].filter(([key]) => key !== "faucet"),
              ).entries(),
            ),
          }),
          (r: {
            counterexamplePath: string;
            failed: boolean;
            numRuns: number;
            seed: number;
            contractName: string;
            selectedTestFunction: {
              name: string;
              access: string;
              outputs: string[];
              args: any;
            };
            functionArgs: ClarityValue[];
            errorMessage: string;
            clarityError: string;
            testCaller: [string, string];
          }) => {
            const emittedErrorLogs: string[] = [];
            const radio = new EventEmitter();
            const rendezvousContractId = `ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.${r.contractName}`;

            radio.on("logFailure", (message: string) => {
              emittedErrorLogs.push(message);
            });

            const runDetails = {
              counterexamplePath: r.counterexamplePath,
              failed: r.failed,
              numRuns: r.numRuns,
              seed: r.seed,
              counterexample: [
                {
                  rendezvousContractId,
                  selectedTestFunction:
                    r.selectedTestFunction as any as ContractInterfaceFunction,
                  functionArgs: r.functionArgs,
                  testCaller: r.testCaller,
                },
              ],
              error: new PropertyTestError(r.errorMessage, r.clarityError),
            };

            // Exercise
            reporter(runDetails, radio, "test", {});

            // Verify
            const expectedMessages = [
              `\nError: Property failed after ${r.numRuns} tests.`,
              `Seed : ${r.seed}`,
              `Path : ${r.counterexamplePath}`,
              `\nCounterexample:`,
              `- Contract : ${getContractNameFromContractId(
                rendezvousContractId,
              )}`,
              `- Test Function : ${r.selectedTestFunction.name} (${r.selectedTestFunction.access})`,
              `- Arguments     : ${r.functionArgs
                .map((cv) => cvToString(cv))
                .join(" ")}`,
              `- Caller        : ${r.testCaller[0]}`,
              `- Outputs       : ${JSON.stringify(
                r.selectedTestFunction.outputs,
              )}`,
              `\nWhat happened? Rendezvous went on a rampage and found a weak spot:\n`,
              `The test function "${
                r.selectedTestFunction.name
              }" returned:\n\n${runDetails.error?.clarityError
                ?.toString()
                .split("\n")
                .map((line) => "    " + line)
                .join("\n")}\n`,
            ];

            expect(emittedErrorLogs).toEqual(expectedMessages);
          },
        ),
        { numRuns: 10 },
      );
    });
  });

  it("does not log anything on success for property testing type", async () => {
    // Setup
    const tempDir = createIsolatedTestEnvironment(
      resolve(__dirname, "example"),
      isolatedTestEnvPrefix,
    );
    const manifestPath = join(tempDir, "Clarinet.toml");
    const simnet = await initSimnet(manifestPath);

    const originalExitCode = process.exitCode;

    runWithTeardown(tempDir, originalExitCode, () => {
      fc.assert(
        fc.property(
          fc.record({
            failed: fc.constant(false),
            numRuns: fc.nat(),
            seed: fc.nat(),
            contractName: asciiString(),
            selectedTestFunction: fc.record({
              name: asciiString(),
              access: asciiString(),
              outputs: fc.array(asciiString()),
              args: fc.anything(),
            }),
            functionArgs: fc.array(
              fc.oneof(asciiString(), fc.nat(), fc.boolean()),
            ),
            errorMessage: asciiString(),
            testCaller: fc.constantFrom(
              ...new Map(
                [...simnet.getAccounts()].filter(([key]) => key !== "faucet"),
              ).entries(),
            ),
          }),
          (r: {
            failed: boolean;
            numRuns: number;
            seed: number;
            contractName: string;
            selectedTestFunction: {
              name: string;
              access: string;
              outputs: string[];
              args: any;
            };
            functionArgs: (string | number | boolean)[];
            errorMessage: string;
            testCaller: [string, string];
          }) => {
            const emittedErrorLogs: string[] = [];
            const radio = new EventEmitter();
            const rendezvousContractId = `ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.${r.contractName}`;

            radio.on("logFailure", (message: string) => {
              emittedErrorLogs.push(message);
            });

            const runDetails = {
              failed: r.failed,
              numRuns: r.numRuns,
              seed: r.seed,
              counterexample: [
                {
                  rendezvousContractId,
                  selectedTestFunction:
                    r.selectedTestFunction as any as ContractInterfaceFunction,
                  functionArgs: r.functionArgs,
                  testCaller: r.testCaller,
                },
              ],
              error: new Error(r.errorMessage),
            };

            // Exercise
            reporter(runDetails, radio, "test", {});

            // Verify

            expect(emittedErrorLogs).toEqual([]);
          },
        ),
        { numRuns: 10 },
      );
    });
  });
});

describe("Unchecked tests and invariants reporting", () => {
  const report = (type: "test" | "invariant", checks: [string, number][]) => {
    const logs: string[] = [];
    let unchecked = 0;
    const radio = new EventEmitter();
    radio.on("logMessage", (message: string) => logs.push(message));
    radio.on("logInfo", (message: string) => logs.push(message));
    radio.on("unchecked", () => unchecked++);
    const zero = new Map(checks.map(([name]) => [name, 0]));
    const counts = { successful: new Map(checks), failed: zero };
    const originalExitCode = process.exitCode;
    try {
      reporter(
        { failed: false, counterexample: [], numRuns: 5, seed: 1 },
        radio,
        type,
        type === "test"
          ? { test: { ...counts, discarded: zero } }
          : { invariant: counts, sut: { ...counts, thrown: 0 } },
      );
      return {
        logs: logs.join("\n"),
        unchecked,
        exitCodeChanged: process.exitCode !== originalExitCode,
      };
    } finally {
      process.exitCode = originalExitCode;
    }
  };

  it("warns instead of passing when a test has no passing checks", () => {
    const { logs, unchecked, exitCodeChanged } = report("test", [
      ["test-a", 5],
      ["test-b", 0],
    ]);
    expect(logs).toContain(
      "Warning: not checked after 5 runs: test-b.\n" +
        "They were never selected or all of their cases were discarded.",
    );
    expect(logs).not.toContain("OK, properties passed");
    expect(unchecked).toBe(1);
    expect(exitCodeChanged).toBe(false);
  });

  it("warns instead of passing when an invariant was never selected", () => {
    const { logs } = report("invariant", [
      ["invariant-a", 5],
      ["invariant-b", 0],
    ]);
    expect(logs).toContain(
      "Warning: not checked after 5 runs: invariant-b.\n" +
        "They were never selected.",
    );
    expect(logs).not.toContain("OK, invariants passed");
  });

  it("reports a pass when every test and invariant was checked", () => {
    const test = report("test", [["test-a", 5]]);
    expect(test.logs).toContain("OK, properties passed after 5 runs.");
    expect(test.unchecked).toBe(0);
    const invariant = report("invariant", [["invariant-a", 5]]);
    expect(invariant.logs).toContain("OK, invariants passed after 5 runs.");
    expect(invariant.unchecked).toBe(0);
  });
});

describe("Failure statistics tracking", () => {
  it("keeps counting after a skipped precondition", async () => {
    const statistics = {
      test: {
        successful: new Map([["test-a", 0]]),
        discarded: new Map([["test-a", 0]]),
        failed: new Map([["test-a", 0]]),
      },
    };
    const tracked = trackFailureStatistics(statistics);
    let calls = 0;
    await fc.assert(
      fc.asyncProperty(
        fc.constant(0),
        tracked.track(async () => {
          fc.pre(calls++ > 0);
          statistics.test.successful.set(
            "test-a",
            statistics.test.successful.get("test-a")! + 1,
          );
        }),
      ),
      { numRuns: 3 },
    );
    expect(tracked.get().test!.successful.get("test-a")).toBe(3);
  });

  it("keeps the statistics from the first failure", async () => {
    const statistics = {
      test: {
        successful: new Map([["test-a", 0]]),
        discarded: new Map([["test-a", 0]]),
        failed: new Map([["test-a", 0]]),
      },
    };
    const tracked = trackFailureStatistics(statistics);
    await expect(
      fc.assert(
        fc.asyncProperty(
          fc.nat(),
          tracked.track(async () => {
            statistics.test.failed.set(
              "test-a",
              statistics.test.failed.get("test-a")! + 1,
            );
            throw new Error("fail");
          }),
        ),
        { numRuns: 3, seed: 1 },
      ),
    ).rejects.toThrow();
    expect(statistics.test.failed.get("test-a")).toBeGreaterThan(1);
    expect(tracked.get().test!.failed.get("test-a")).toBe(1);
  });
});
