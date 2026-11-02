import type { EventEmitter } from "node:events";
import { resolve } from "node:path";

import type { Simnet } from "@stacks/clarinet-sdk";
import type { ContractInterfaceFunction } from "@stacks/clarinet-sdk-wasm";
import {
  Cl,
  cvToJSON,
  cvToString,
  type ClarityValue,
} from "@stacks/transactions";
import { dim, green, red, underline, yellow } from "ansicolor";
import fc from "fast-check";

import { DialerRegistry, PostDialerError, PreDialerError } from "./dialer";
import { reporter } from "./heatstroke";
import type { Statistics } from "./heatstroke.types";
import type {
  InvariantTestConfig,
  InvariantTestContext,
  LocalContext,
} from "./invariant.types";
import { strategyFor } from "./lib";
import {
  getFailureFilePath,
  loadFailures,
  persistFailure,
} from "./persistence";
import {
  getContractNameFromContractId,
  getFunctionsListForContract,
  LOG_DIVIDER,
} from "./shared";
import type { EnrichedContractInterfaceFunction } from "./shared.types";
import {
  buildTraitReferenceMap,
  enrichInterfaceWithTraitData,
  extractProjectTraitImplementations,
  getNonTestableTraitFunctions,
  isTraitReferenceFunction,
} from "./traits";

/**
 * Runs invariant testing on the target contract and logs the progress. Reports
 * the test results through a custom reporter.
 * @param simnet The Simnet instance.
 * @param resetSession Resets the simnet session to a clean state.
 * @param rendezvousList The list of contract IDs for each target contract.
 * @param rendezvousAllFunctions The map of all function interfaces for each
 * target contract.
 * @param seed The seed for reproducible invariant testing.
 * @param runs The number of test runs.
 * @param dial The path to the dialer file.
 * @param bail Stop execution after the first failure and prevent further
 * shrinking.
 * @param regr Whether to run regression tests only.
 * @param radio The custom logging event emitter.
 * @param eligibleAccounts The resolved eligible accounts map.
 * @param allAddresses All resolved addresses for principal type generation.
 * @returns void
 */
export const checkInvariants = async (
  simnet: Simnet,
  resetSession: () => Promise<void>,
  rendezvousList: string[],
  rendezvousAllFunctions: Map<string, ContractInterfaceFunction[]>,
  seed: number | undefined,
  runs: number | undefined,
  dial: string | undefined,
  bail: boolean,
  regr: boolean,
  radio: EventEmitter,
  eligibleAccounts: Map<string, string>,
  allAddresses: string[],
) => {
  // The Rendezvous identifier is the first one in the list. Only one contract
  // can be fuzzed at a time.
  const rendezvousContractId = rendezvousList[0];

  // A map where the keys are the Rendezvous identifiers and the values are
  // arrays of their SUT (System Under Test) functions. This map will be used
  // to access the SUT functions for each Rendezvous contract afterwards.
  const rendezvousSutFunctions = filterSutFunctions(rendezvousAllFunctions);

  // A map where the keys are the Rendezvous identifiers and the values are
  // arrays of their invariant functions. This map will be used to access the
  // invariant functions for each Rendezvous contract afterwards.
  const rendezvousInvariantFunctions = filterInvariantFunctions(
    rendezvousAllFunctions,
  );

  const sutFunctions = rendezvousSutFunctions.get(rendezvousContractId)!;
  const traitReferenceSutFunctions = sutFunctions.filter(
    isTraitReferenceFunction,
  );
  const invariantFunctions =
    rendezvousInvariantFunctions.get(rendezvousContractId)!;
  const traitReferenceInvariantFunctions = invariantFunctions.filter(
    isTraitReferenceFunction,
  );

  const targetContractName =
    getContractNameFromContractId(rendezvousContractId);
  const sutTraitReferenceMap = buildTraitReferenceMap(sutFunctions);
  const invariantTraitReferenceMap = buildTraitReferenceMap(invariantFunctions);

  const enrichedSutFunctionsInterfaces =
    traitReferenceSutFunctions.length > 0
      ? enrichInterfaceWithTraitData(
          simnet.getContractAST(targetContractName),
          sutTraitReferenceMap,
          sutFunctions,
          rendezvousContractId,
        )
      : rendezvousSutFunctions;

  const enrichedInvariantFunctionsInterfaces =
    traitReferenceInvariantFunctions.length > 0
      ? enrichInterfaceWithTraitData(
          simnet.getContractAST(targetContractName),
          invariantTraitReferenceMap,
          invariantFunctions,
          rendezvousContractId,
        )
      : rendezvousInvariantFunctions;

  // Map all the project/requirement contracts to the traits they implement.
  const projectTraitImplementations =
    extractProjectTraitImplementations(simnet);

  // Extract SUT functions with missing trait implementations. These functions
  // will be skipped during invariant testing. Otherwise, the invariant testing
  // routine can fail during argument generation.
  const sutFunctionsWithMissingTraits = getNonTestableTraitFunctions(
    enrichedSutFunctionsInterfaces,
    sutTraitReferenceMap,
    projectTraitImplementations,
    rendezvousContractId,
  );

  // Extract invariant functions with missing trait implementations. These
  // functions will be skipped during invariant testing. Otherwise, the
  // invariant testing routine can fail during argument generation.
  const invariantFunctionsWithMissingTraits = getNonTestableTraitFunctions(
    enrichedInvariantFunctionsInterfaces,
    invariantTraitReferenceMap,
    projectTraitImplementations,
    rendezvousContractId,
  );

  // Emit warnings for functions with missing trait implementations
  emitMissingTraitWarnings(
    radio,
    sutFunctionsWithMissingTraits,
    invariantFunctionsWithMissingTraits,
  );

  // Filter out functions with missing trait implementations from the enriched
  // map.
  const executableSutFunctions = new Map([
    [
      rendezvousContractId,
      enrichedSutFunctionsInterfaces
        .get(rendezvousContractId)!
        .filter((f) => !sutFunctionsWithMissingTraits.includes(f.name)),
    ],
  ]);

  // Filter out functions with missing trait implementations from the enriched
  // map.
  const executableInvariantFunctions = new Map([
    [
      rendezvousContractId,
      enrichedInvariantFunctionsInterfaces
        .get(rendezvousContractId)!
        .filter((f) => !invariantFunctionsWithMissingTraits.includes(f.name)),
    ],
  ]);

  const functions = getFunctionsListForContract(
    executableSutFunctions,
    rendezvousContractId,
  );

  const invariants = getFunctionsListForContract(
    executableInvariantFunctions,
    rendezvousContractId,
  );

  if (functions?.length === 0) {
    radio.emit(
      "logMessage",
      red(
        `No public functions found for the "${targetContractName}" contract. Without public functions, no state transitions can happen inside the contract, and the invariant test is not meaningful.\n`,
      ),
    );
    return;
  }

  if (invariants?.length === 0) {
    radio.emit(
      "logMessage",
      red(
        `No invariant functions found for the "${targetContractName}" contract. Beware, for your contract may be exposed to unforeseen issues.\n`,
      ),
    );
    return;
  }

  if (regr) {
    // Run regression tests only.
    radio.emit(
      "logMessage",
      `Regressions loaded from: ${resolve(
        getFailureFilePath(rendezvousContractId),
      )}`,
    );
    radio.emit(
      "logMessage",
      `Loading ${targetContractName} contract regressions...\n`,
    );

    const regressions = loadFailures(rendezvousContractId, "invariant");

    radio.emit(
      "logMessage",
      `Found ${underline(
        `${regressions.length} regressions`,
      )} for the ${targetContractName} contract.\n`,
    );

    for (const regression of regressions) {
      emitInvariantRegressionTestHeader(
        radio,
        targetContractName,
        regression.seed,
        regression.numRuns,
        regression.dial,
        regression.timestamp,
      );

      await resetSession();

      await invariantTest({
        simnet,
        targetContractName,
        rendezvousContractId,
        runs: regression.numRuns < 100 ? 100 : regression.numRuns,
        seed: regression.seed,
        bail,
        dial: regression.dial,
        radio,
        eligibleAccounts,
        allAddresses,
        functions,
        invariants,
      });
    }
  } else {
    // Run fresh invariant tests using user-provided configuration.
    radio.emit(
      "logMessage",
      `Starting fresh round of invariant testing for the ${targetContractName} contract using user-provided configuration...\n`,
    );

    await invariantTest({
      simnet,
      targetContractName,
      rendezvousContractId,
      runs,
      seed,
      bail,
      dial,
      radio,
      eligibleAccounts,
      allAddresses,
      functions,
      invariants,
    });
  }
};

/**
 * Runs an invariant test.
 * @param config The union of the configuration and context for the invariant
 * test.
 * @returns A promise that resolves when the invariant test is complete.
 */
const invariantTest = async (
  config: InvariantTestConfig & InvariantTestContext,
) => {
  const {
    simnet,
    targetContractName,
    rendezvousContractId,
    runs,
    seed,
    bail,
    dial,
    radio,
    eligibleAccounts,
    allAddresses,
    functions,
    invariants,
  } = config;

  // Pre-build one fast-check arbitrary per SUT and invariant function via
  // the public library API, so invariant runs exercise the same strategy
  // pipeline as library consumers. `allAddresses` is threaded through so
  // any upstream account filtering (e.g. user-restricted accounts) is
  // honored.
  const sutStrategies = new Map<string, fc.Arbitrary<ClarityValue[]>>(
    functions.map((fn) => [fn.name, strategyFor(simnet, fn, allAddresses)]),
  );
  const invariantStrategies = new Map<string, fc.Arbitrary<ClarityValue[]>>(
    invariants.map((fn) => [fn.name, strategyFor(simnet, fn, allAddresses)]),
  );

  /**
   * The dialer registry, which is used to keep track of all the custom dialers
   * registered by the user using the `--dial` flag.
   */
  const dialerRegistry =
    dial !== undefined ? new DialerRegistry(dial) : undefined;

  if (dialerRegistry !== undefined) {
    dialerRegistry.registerDialers();
  }

  const statistics: Statistics = {
    sut: {
      thrown: 0,
      successful: new Map<string, number>(),
      failed: new Map<string, number>(),
    },
    invariant: {
      successful: new Map<string, number>(),
      failed: new Map<string, number>(),
    },
  };

  // Initialize the statistics for the SUT functions.
  for (const functionInterface of functions) {
    statistics.sut!.successful.set(functionInterface.name, 0);
    statistics.sut!.failed.set(functionInterface.name, 0);
  }

  // Initialize the statistics for the invariant functions.
  for (const functionInterface of invariants) {
    statistics.invariant!.successful.set(functionInterface.name, 0);
    statistics.invariant!.failed.set(functionInterface.name, 0);
  }

  const radioReporter = async (runDetails: any) => {
    reporter(runDetails, radio, "invariant", statistics);

    // Persist failures for regression testing.
    if (runDetails.failed) {
      persistFailure(runDetails, "invariant", rendezvousContractId, dial);
    }
  };

  // Set up local context to track SUT function call counts.
  const localContext = initializeLocalContext(rendezvousContractId, functions);

  // Set up context in simnet by initializing state for SUT.
  initializeClarityContext(simnet, rendezvousContractId, functions);

  await fc.assert(
    fc.asyncProperty(
      fc
        .record({
          // The target contract identifier. It is a constant value equal
          // to the first contract in the list. The arbitrary is still needed,
          // being used for reporting purposes in `heatstroke.ts`.
          rendezvousContractId: fc.constant(rendezvousContractId),
          invariantCaller: fc.constantFrom(...eligibleAccounts.entries()),
          canMineBlocks: fc.boolean(),
        })
        .chain((r) =>
          fc
            .record({
              selectedFunctions: fc.array(fc.constantFrom(...functions), {
                minLength: 1, // At least one function must be selected.
              }),
              selectedInvariant: fc.constantFrom(...invariants),
            })
            .map((selectedFunctions) => ({ ...r, ...selectedFunctions })),
        )
        .chain((r) =>
          fc
            .record({
              sutCallers: fc.array(
                fc.constantFrom(...eligibleAccounts.entries()),
                {
                  minLength: r.selectedFunctions.length,
                  maxLength: r.selectedFunctions.length,
                },
              ),
              selectedFunctionsArgsList: fc.tuple(
                ...r.selectedFunctions.map(
                  (selectedFunction) =>
                    sutStrategies.get(selectedFunction.name)!,
                ),
              ),
              invariantArgs: invariantStrategies.get(r.selectedInvariant.name)!,
            })
            .map((args) => ({ ...r, ...args })),
        )
        .chain((r) =>
          fc
            .record({
              burnBlocks: r.canMineBlocks
                ? // This arbitrary produces integers with a maximum value
                  // inversely proportional to the number of runs:
                  // - Fewer runs result in a higher maximum burn blocks,
                  //   allowing more blocks to be mined.
                  // - More runs result in a lower maximum burn blocks, as more
                  //   blocks are mined overall.
                  fc.integer({
                    min: 1,
                    max: Math.ceil(100_000 / (runs || 100)),
                  })
                : fc.constant(0),
            })
            .map((burnBlocks) => ({ ...r, ...burnBlocks })),
        ),
      async (r) => {
        for (const [index, selectedFunction] of r.selectedFunctions.entries()) {
          const [sutCallerWallet, sutCallerAddress] = r.sutCallers[index];

          const printedFunctionArgs = r.selectedFunctionsArgsList[index]
            .map((cv) => cvToString(cv))
            .join(" ");

          try {
            if (dialerRegistry !== undefined) {
              await dialerRegistry.executePreDialers({
                selectedFunction: selectedFunction,
                functionCall: undefined,
                clarityValueArguments: r.selectedFunctionsArgsList[index],
              });
            }
          } catch (error: any) {
            throw new PreDialerError(error.message);
          }

          try {
            let functionCall = null;
            try {
              functionCall = simnet.callPublicFn(
                r.rendezvousContractId,
                selectedFunction.name,
                r.selectedFunctionsArgsList[index],
                sutCallerAddress,
              );
            } catch (error) {
              statistics.sut!.thrown++;
              throw error;
            }

            const functionCallResultJson = cvToJSON(functionCall.result);

            // Reaching this point means the function call went through, but it
            // may still have returned an error result. Get the result, convert
            // it to Clarity string format, and report it to improve the user
            // experiance by providing important information about the function
            // call during the run.
            const selectedFunctionClarityResult = cvToString(
              functionCall.result,
            );

            if (functionCallResultJson.success) {
              statistics.sut!.successful.set(
                selectedFunction.name,
                statistics.sut!.successful.get(selectedFunction.name)! + 1,
              );
              const calls = ++localContext[r.rendezvousContractId][
                selectedFunction.name
              ];

              try {
                simnet.callPrivateFn(
                  r.rendezvousContractId,
                  "update-context",
                  [Cl.stringAscii(selectedFunction.name), Cl.uint(calls)],
                  simnet.deployer,
                );
              } catch (error) {
                radio.emit(
                  "logInfo",
                  `Could not update context for ${selectedFunction.name}: ` +
                    String(error),
                );
              }

              // Function call passed.
              radio.emit(
                "logMessage",
                `₿ ${simnet.burnBlockHeight.toString().padStart(8)} ` +
                  `Ӿ ${simnet.blockHeight.toString().padStart(8)}   ` +
                  dim(`${sutCallerWallet}        `) +
                  `${targetContractName} ` +
                  `${underline(selectedFunction.name)} ` +
                  `${printedFunctionArgs} ` +
                  green(selectedFunctionClarityResult),
              );

              try {
                if (dialerRegistry !== undefined) {
                  await dialerRegistry.executePostDialers({
                    selectedFunction: selectedFunction,
                    functionCall: functionCall,
                    clarityValueArguments: r.selectedFunctionsArgsList[index],
                  });
                }
              } catch (error: any) {
                throw new PostDialerError(error.message);
              }
            } else {
              // Function call failed.
              statistics.sut!.failed.set(
                selectedFunction.name,
                statistics.sut!.failed.get(selectedFunction.name)! + 1,
              );
              radio.emit(
                "logMessage",
                dim(
                  `₿ ${simnet.burnBlockHeight.toString().padStart(8)} ` +
                    `Ӿ ${simnet.blockHeight.toString().padStart(8)}   ` +
                    `${sutCallerWallet}        ` +
                    `${targetContractName} ` +
                    `${underline(selectedFunction.name)} ` +
                    `${printedFunctionArgs} ` +
                    red(selectedFunctionClarityResult),
                ),
              );
            }
          } catch (error: any) {
            if (
              error instanceof PreDialerError ||
              error instanceof PostDialerError
            ) {
              throw error;
            } else {
              statistics.sut!.failed.set(
                selectedFunction.name,
                statistics.sut!.failed.get(selectedFunction.name)! + 1,
              );
              const displayedError =
                error &&
                typeof error === "string" &&
                error.toLowerCase().includes("runtime")
                  ? "(runtime)"
                  : "(unknown)";
              // If the function call fails with a runtime error, log a dimmed
              // message. Since the public function result is only logged and
              // does not affect the run, there's no need to throw an error.
              radio.emit(
                "logMessage",
                dim(
                  `₿ ${simnet.burnBlockHeight.toString().padStart(8)} ` +
                    `Ӿ ${simnet.blockHeight.toString().padStart(8)}   ` +
                    `${sutCallerWallet}        ` +
                    `${targetContractName} ` +
                    `${underline(selectedFunction.name)} ` +
                    `${printedFunctionArgs} ` +
                    red(displayedError),
                ),
              );
            }
          }
        }

        const printedInvariantArgs = r.invariantArgs
          .map((cv) => cvToString(cv))
          .join(" ");

        const [invariantCallerWallet, invariantCallerAddress] =
          r.invariantCaller;

        try {
          const { result: invariantCallResult } = simnet.callReadOnlyFn(
            r.rendezvousContractId,
            r.selectedInvariant.name,
            r.invariantArgs,
            invariantCallerAddress,
          );

          const invariantCallResultJson = cvToJSON(invariantCallResult);

          const invariantCallClarityResult = cvToString(invariantCallResult);

          if (invariantCallResultJson.value === true) {
            statistics.invariant!.successful.set(
              r.selectedInvariant.name,
              statistics.invariant!.successful.get(r.selectedInvariant.name)! +
                1,
            );
            radio.emit(
              "logMessage",
              `₿ ${simnet.burnBlockHeight.toString().padStart(8)} ` +
                `Ӿ ${simnet.blockHeight.toString().padStart(8)}   ` +
                `${dim(invariantCallerWallet)} ` +
                `${green("[PASS]")} ` +
                `${targetContractName} ` +
                `${underline(r.selectedInvariant.name)} ` +
                `${printedInvariantArgs} ` +
                green(invariantCallClarityResult),
            );
          } else {
            statistics.invariant!.failed.set(
              r.selectedInvariant.name,
              statistics.invariant!.failed.get(r.selectedInvariant.name)! + 1,
            );
            radio.emit(
              "logMessage",
              red(
                `₿ ${simnet.burnBlockHeight.toString().padStart(8)} ` +
                  `Ӿ ${simnet.blockHeight.toString().padStart(8)}   ` +
                  `${invariantCallerWallet} ` +
                  `[FAIL] ` +
                  `${targetContractName} ` +
                  `${underline(r.selectedInvariant.name)} ` +
                  `${printedInvariantArgs} ` +
                  red(invariantCallClarityResult),
              ),
            );

            // Invariant call went through, but returned something other than
            // `true`. Create a custom error to distinguish this case from
            // runtime errors.
            throw new FalsifiedInvariantError(
              `Invariant failed for ${targetContractName} contract: "${r.selectedInvariant.name}" returned ${invariantCallClarityResult}`,
              invariantCallClarityResult,
            );
          }
        } catch (error: any) {
          // Log errors that aren't already handled as falsified invariants.
          // This prevents duplicate error messages for the same failure.
          if (!(error instanceof FalsifiedInvariantError)) {
            statistics.invariant!.failed.set(
              r.selectedInvariant.name,
              statistics.invariant!.failed.get(r.selectedInvariant.name)! + 1,
            );
            radio.emit(
              "logMessage",
              red(
                `₿ ${simnet.burnBlockHeight.toString().padStart(8)} ` +
                  `Ӿ ${simnet.blockHeight.toString().padStart(8)}   ` +
                  `${invariantCallerWallet} ` +
                  `[FAIL] ` +
                  `${targetContractName} ` +
                  `${underline(r.selectedInvariant.name)} ` +
                  printedInvariantArgs,
              ),
            );
          }

          // Re-throw the error for fast-check to catch and process.
          throw error;
        }

        if (r.canMineBlocks) {
          simnet.mineEmptyBurnBlocks(r.burnBlocks);
        }
      },
    ),
    {
      endOnFailure: bail,
      numRuns: runs,
      reporter: radioReporter,
      seed: seed,
      verbose: true,
    },
  );
};

/**
 * Emits warnings for functions that reference traits without eligible
 * implementations.
 */
const emitMissingTraitWarnings = (
  radio: EventEmitter,
  sutFunctions: string[],
  invariantFunctions: string[],
): void => {
  if (sutFunctions.length === 0 && invariantFunctions.length === 0) {
    return;
  }

  if (sutFunctions.length > 0) {
    const functionList = sutFunctions.map((fn) => `  - ${fn}`).join("\n");
    radio.emit(
      "logMessage",
      yellow(
        `\nWarning: The following SUT functions reference traits without eligible implementations and will be skipped:\n\n${functionList}\n`,
      ),
    );
  }

  if (invariantFunctions.length > 0) {
    const functionList = invariantFunctions.map((fn) => `  - ${fn}`).join("\n");
    radio.emit(
      "logMessage",
      yellow(
        `\nWarning: The following invariant functions reference traits without eligible implementations and will be skipped:\n\n${functionList}\n`,
      ),
    );
  }

  radio.emit(
    "logMessage",
    yellow(
      `Note: You can add contracts implementing traits either as project contracts or as Clarinet requirements.\n`,
    ),
  );
};

/**
 * Initializes the local context, setting the number of times each function
 * has been called to zero.
 * @param contractId The contract identifier.
 * @param functions The SUT functions for the contract.
 * @returns The initialized local context.
 */
export const initializeLocalContext = (
  contractId: string,
  functions: EnrichedContractInterfaceFunction[],
): LocalContext => ({
  [contractId]: Object.fromEntries(functions.map((f) => [f.name, 0])),
});

/**
 * Initializes the Clarity context by calling update-context for each SUT
 * function.
 * @param simnet The Simnet instance.
 * @param contractId The contract identifier.
 * @param functions The SUT functions for the contract.
 */
export const initializeClarityContext = (
  simnet: Simnet,
  contractId: string,
  functions: EnrichedContractInterfaceFunction[],
) => {
  functions.forEach((fn) => {
    const { result: initialize } = simnet.callPrivateFn(
      contractId,
      "update-context",
      [Cl.stringAscii(fn.name), Cl.uint(0)],
      simnet.deployer,
    );
    const jsonResult = cvToJSON(initialize);
    if (!jsonResult.value || !jsonResult.success) {
      throw new Error(
        `Failed to initialize the context for function: ${fn.name}.`,
      );
    }
  });
};

/**
 * Filter the System Under Test (`SUT`) functions from the map of all contract
 * functions.
 *
 * The SUT functions are the ones that have `public` access since they are
 * capable of changing the contract state.
 * @param allFunctionsMap The map containing all the functions for each
 * Rendezvous contract.
 * @returns A map containing the filtered SUT functions for each Rendezvous
 * contract.
 */
const filterSutFunctions = (
  allFunctionsMap: Map<string, ContractInterfaceFunction[]>,
) =>
  new Map(
    Array.from(allFunctionsMap, ([contractId, functions]) => [
      contractId,
      functions.filter((f) => f.access === "public"),
    ]),
  );

const filterInvariantFunctions = (
  allFunctionsMap: Map<string, ContractInterfaceFunction[]>,
) =>
  new Map(
    Array.from(allFunctionsMap, ([contractId, functions]) => [
      contractId,
      functions.filter(
        ({ access, name }) =>
          access === "read_only" && name.startsWith("invariant-"),
      ),
    ]),
  );

export class FalsifiedInvariantError extends Error {
  readonly clarityError: string;
  constructor(message: string, clarityError: string) {
    super(message);
    this.clarityError = clarityError;
  }
}

const emitInvariantRegressionTestHeader = (
  radio: EventEmitter,
  targetContractName: string,
  seed: number,
  numRuns: number,
  dial: string | undefined,
  timestamp: number,
) => {
  radio.emit("logMessage", LOG_DIVIDER);
  radio.emit(
    "logMessage",
    `
Running ${underline(
      timestamp,
    )} regression test for the ${targetContractName} contract with:

- Seed: ${seed}
- Runs: ${numRuns}
- Dial: ${dial ?? "none (default)"}
`,
  );
};
