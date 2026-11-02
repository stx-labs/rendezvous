import type { EventEmitter } from "node:events";
import { resolve } from "node:path";

import type { Simnet } from "@stacks/clarinet-sdk";
import type { ContractInterfaceFunction } from "@stacks/clarinet-sdk-wasm";
import { cvToJSON, cvToString, type ClarityValue } from "@stacks/transactions";
import { dim, green, red, underline, yellow } from "ansicolor";
import fc from "fast-check";

import { reporter } from "./heatstroke";
import type { Statistics } from "./heatstroke.types";
import { strategyFor } from "./lib";
import {
  getFailureFilePath,
  loadFailures,
  persistFailure,
} from "./persistence";
import type { PropertyTestConfig, PropertyTestContext } from "./property.types";
import {
  getContractNameFromContractId,
  getFunctionsListForContract,
  LOG_DIVIDER,
} from "./shared";
import {
  buildTraitReferenceMap,
  enrichInterfaceWithTraitData,
  extractProjectTraitImplementations,
  getNonTestableTraitFunctions,
  isTraitReferenceFunction,
} from "./traits";

/**
 * Runs property-based tests on the target contract and logs the progress.
 * Reports the test results through a custom reporter.
 * @param simnet The simnet instance.
 * @param resetSession Resets the simnet session to a clean state.
 * @param rendezvousList The list of contract IDs for each target contract.
 * @param rendezvousAllFunctions A map of all target contract IDs to their
 * function interfaces.
 * @param seed The seed for reproducible property-based tests.
 * @param runs The number of test runs.
 * @param bail Stop execution after the first failure and prevent further
 * shrinking.
 * @param regr Whether to run regression tests only.
 * @param radio The custom logging event emitter.
 * @param eligibleAccounts The resolved eligible accounts map (name to address).
 * @param allAddresses All resolved addresses for principal type generation.
 * @returns void
 */
export const checkProperties = async (
  simnet: Simnet,
  resetSession: () => Promise<void>,
  rendezvousList: string[],
  rendezvousAllFunctions: Map<string, ContractInterfaceFunction[]>,
  seed: number | undefined,
  runs: number | undefined,
  bail: boolean,
  regr: boolean,
  radio: EventEmitter,
  eligibleAccounts: Map<string, string>,
  allAddresses: string[],
) => {
  // A map where the keys are the test contract identifiers and the values are
  // arrays of their test functions. This map will be used to access the test
  // functions for each test contract in the property-based testing routine.
  const testContractsTestFunctions = filterTestFunctions(
    rendezvousAllFunctions,
  );

  const rendezvousContractId = rendezvousList[0];

  const allTestFunctions =
    testContractsTestFunctions.get(rendezvousContractId)!;

  const traitReferenceFunctionsCount = allTestFunctions.filter(
    isTraitReferenceFunction,
  ).length;

  const targetContractName =
    getContractNameFromContractId(rendezvousContractId);

  const traitReferenceMap = buildTraitReferenceMap(allTestFunctions);
  const enrichedTestFunctionsInterfaces =
    traitReferenceFunctionsCount > 0
      ? enrichInterfaceWithTraitData(
          simnet.getContractAST(targetContractName),
          traitReferenceMap,
          allTestFunctions,
          rendezvousContractId,
        )
      : testContractsTestFunctions;

  const projectTraitImplementations =
    extractProjectTraitImplementations(simnet);

  // If the tests contain trait reference functions, extract the functions with
  // missing trait implementations. These functions need to be skipped during
  // property-based testing. Otherwise, the property-based testing routine will
  // eventually fail during argument generation.
  const functionsMissingTraitImplementations =
    traitReferenceFunctionsCount > 0
      ? getNonTestableTraitFunctions(
          enrichedTestFunctionsInterfaces,
          traitReferenceMap,
          projectTraitImplementations,
          rendezvousContractId,
        )
      : [];

  // If the tests contain trait reference functions without eligible trait
  // implementations, log a warning and filter out the functions.
  emitMissingTraitWarning(radio, functionsMissingTraitImplementations);

  // Filter out test functions with missing trait implementations from the
  // enriched map.
  const executableTestContractsTestFunctions = new Map([
    [
      rendezvousContractId,
      enrichedTestFunctionsInterfaces
        .get(rendezvousContractId)!
        .filter(
          (functionInterface) =>
            !functionsMissingTraitImplementations.includes(
              functionInterface.name,
            ),
        ),
    ],
  ]);

  // Search for discard functions, for each test function. This map will
  // be used to pair the test functions with their corresponding discard
  // functions.
  const testContractsDiscardFunctions = new Map(
    Array.from(rendezvousAllFunctions, ([contractId, functions]) => [
      contractId,
      functions.filter(
        ({ access, name }) => access === "read_only" && name.startsWith("can-"),
      ),
    ]),
  );

  // Pair each test function with its corresponding discard function. When a
  // test function is selected, Rendezvous will first call its discard
  // function, to allow or prevent the property test from running.
  const testContractsPairedFunctions = new Map(
    Array.from(
      executableTestContractsTestFunctions,
      ([contractId, functions]) => [
        contractId,
        new Map(
          functions.map((f) => {
            const discardFunction = testContractsDiscardFunctions
              .get(contractId)
              ?.find((pf) => pf.name === `can-${f.name}`);

            return [f.name, discardFunction?.name];
          }),
        ),
      ],
    ),
  );

  const hasDiscardFunctionErrors = [...testContractsPairedFunctions].some(
    ([contractId, pairedMap]) =>
      [...pairedMap].some(([testFunctionName, discardFunctionName]) =>
        discardFunctionName
          ? !validateDiscardFunction(
              contractId,
              discardFunctionName,
              testFunctionName,
              testContractsDiscardFunctions,
              testContractsTestFunctions,
              radio,
            )
          : false,
      ),
  );

  if (hasDiscardFunctionErrors) {
    return;
  }

  const testFunctions = getFunctionsListForContract(
    executableTestContractsTestFunctions,
    rendezvousContractId,
  );

  if (testFunctions?.length === 0) {
    radio.emit(
      "logMessage",
      red(
        `No test functions found for the "${targetContractName}" contract.\n`,
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

    const regressions = loadFailures(rendezvousContractId, "test");

    radio.emit(
      "logMessage",
      `Found ${underline(
        `${regressions.length} regressions`,
      )} for the ${targetContractName} contract.\n`,
    );

    for (const regression of regressions) {
      emitPropertyRegressionTestHeader(
        radio,
        targetContractName,
        regression.seed,
        regression.numRuns,
        regression.timestamp,
      );

      await resetSession();

      await propertyTest({
        simnet,
        targetContractName,
        rendezvousContractId,
        // If the number of runs that failed is less than 100, set it to the
        // default value of 100. If more runs were needed to reproduce the
        // failure, use the number of runs that failed.
        runs: regression.numRuns < 100 ? 100 : regression.numRuns,
        seed: regression.seed,
        bail,
        radio,
        eligibleAccounts,
        allAddresses,
        testFunctions,
        testContractsPairedFunctions,
      });
    }
  } else {
    // Run fresh tests using user-provided configuration.
    radio.emit(
      "logMessage",
      `Starting fresh round of property testing for the ${targetContractName} contract using user-provided configuration...\n`,
    );

    await propertyTest({
      simnet,
      targetContractName,
      rendezvousContractId,
      runs,
      seed,
      bail,
      radio,
      eligibleAccounts,
      allAddresses,
      testFunctions,
      testContractsPairedFunctions,
    });
  }
};

/**
 * Runs a property test.
 * @param config The union of the configuration and context for the property
 * test.
 * @returns A promise that resolves when the property test is complete.
 */
const propertyTest = async (
  config: PropertyTestConfig & PropertyTestContext,
) => {
  const {
    simnet,
    targetContractName,
    rendezvousContractId,
    runs,
    seed,
    bail,
    radio,
    eligibleAccounts,
    allAddresses,
    testFunctions,
    testContractsPairedFunctions,
  } = config;

  // Pre-build one fast-check arbitrary per test function via the public
  // library API, so property runs exercise the same strategy pipeline as
  // library consumers. `allAddresses` is threaded through so any upstream
  // account filtering (e.g. user-restricted accounts) is honored.
  const strategies = new Map<string, fc.Arbitrary<ClarityValue[]>>(
    testFunctions.map((fn) => [fn.name, strategyFor(simnet, fn, allAddresses)]),
  );

  const statistics: Statistics = {
    test: {
      successful: new Map<string, number>(),
      discarded: new Map<string, number>(),
      failed: new Map<string, number>(),
    },
  };

  for (const functionInterface of testFunctions) {
    statistics.test!.successful.set(functionInterface.name, 0);
    statistics.test!.discarded.set(functionInterface.name, 0);
    statistics.test!.failed.set(functionInterface.name, 0);
  }

  const radioReporter = async (runDetails: any) => {
    reporter(runDetails, radio, "test", statistics);

    // Persist failures for regression testing.
    if (runDetails.failed) {
      persistFailure(
        runDetails,
        "test",
        rendezvousContractId,
        // No dialers in property-based testing.
        undefined,
      );
    }
  };

  await fc.assert(
    fc.asyncProperty(
      fc
        .record({
          rendezvousContractId: fc.constant(rendezvousContractId),
          testCaller: fc.constantFrom(...eligibleAccounts.entries()),
          canMineBlocks: fc.boolean(),
        })
        .chain((r) =>
          fc
            .record({
              selectedTestFunction: fc.constantFrom(...testFunctions),
            })
            .map((selectedTestFunction) => ({
              ...r,
              ...selectedTestFunction,
            })),
        )
        .chain((r) =>
          fc
            .record({
              functionArgs: strategies.get(r.selectedTestFunction.name)!,
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
        const printedTestFunctionArgs = r.functionArgs
          .map((cv) => cvToString(cv))
          .join(" ");

        const [testCallerWallet, testCallerAddress] = r.testCaller;

        const discardFunctionName = testContractsPairedFunctions
          .get(r.rendezvousContractId)!
          .get(r.selectedTestFunction.name);

        try {
          const discarded = isTestDiscarded(
            discardFunctionName,
            r.functionArgs,
            r.rendezvousContractId,
            simnet,
            testCallerAddress,
          );

          if (discarded) {
            statistics.test!.discarded.set(
              r.selectedTestFunction.name,
              statistics.test!.discarded.get(r.selectedTestFunction.name)! + 1,
            );
            radio.emit(
              "logMessage",
              `₿ ${simnet.burnBlockHeight.toString().padStart(8)} ` +
                `Ӿ ${simnet.blockHeight.toString().padStart(8)}   ` +
                `${dim(testCallerWallet)} ` +
                `${yellow("[WARN]")} ` +
                `${targetContractName} ` +
                `${underline(r.selectedTestFunction.name)} ` +
                dim(printedTestFunctionArgs),
            );
          } else {
            // If the function call results in a runtime error, the error will
            // be caught and logged as a test failure in the catch block.
            const { result: testFunctionCallResult } = simnet.callPrivateFn(
              r.rendezvousContractId,
              r.selectedTestFunction.name,
              r.functionArgs,
              testCallerAddress,
            );

            const testFunctionCallResultJson = cvToJSON(testFunctionCallResult);

            const discardedInPlace = isTestDiscardedInPlace(
              testFunctionCallResultJson,
            );

            const testFunctionCallClarityResult = cvToString(
              testFunctionCallResult,
            );

            if (discardedInPlace) {
              statistics.test!.discarded.set(
                r.selectedTestFunction.name,
                statistics.test!.discarded.get(r.selectedTestFunction.name)! +
                  1,
              );
              radio.emit(
                "logMessage",
                `₿ ${simnet.burnBlockHeight.toString().padStart(8)} ` +
                  `Ӿ ${simnet.blockHeight.toString().padStart(8)}   ` +
                  `${dim(testCallerWallet)} ` +
                  `${yellow("[WARN]")} ` +
                  `${targetContractName} ` +
                  `${underline(r.selectedTestFunction.name)} ` +
                  `${dim(printedTestFunctionArgs)} ` +
                  yellow(testFunctionCallClarityResult),
              );
            } else if (
              !discardedInPlace &&
              testFunctionCallResultJson.success &&
              testFunctionCallResultJson.value.value === true
            ) {
              statistics.test!.successful.set(
                r.selectedTestFunction.name,
                statistics.test!.successful.get(r.selectedTestFunction.name)! +
                  1,
              );
              radio.emit(
                "logMessage",
                `₿ ${simnet.burnBlockHeight.toString().padStart(8)} ` +
                  `Ӿ ${simnet.blockHeight.toString().padStart(8)}   ` +
                  `${dim(testCallerWallet)} ` +
                  `${green("[PASS]")} ` +
                  `${targetContractName} ` +
                  `${underline(r.selectedTestFunction.name)} ` +
                  `${printedTestFunctionArgs} ` +
                  green(testFunctionCallClarityResult),
              );

              if (r.canMineBlocks) {
                simnet.mineEmptyBurnBlocks(r.burnBlocks);
              }
            } else {
              statistics.test!.failed.set(
                r.selectedTestFunction.name,
                statistics.test!.failed.get(r.selectedTestFunction.name)! + 1,
              );
              // The function call did not result in (ok true) or (ok false).
              // Either the test failed or the test function returned an
              // unexpected value i.e. `(ok 1)`.
              throw new PropertyTestError(
                `Test failed for ${targetContractName} contract: "${r.selectedTestFunction.name}" returned ${testFunctionCallClarityResult}`,
                testFunctionCallClarityResult,
              );
            }
          }
        } catch (error: any) {
          // Failures returned by the test are counted before the throw.
          // Count runtime errors from the test or its discard function here.
          if (!(error instanceof PropertyTestError)) {
            statistics.test!.failed.set(
              r.selectedTestFunction.name,
              statistics.test!.failed.get(r.selectedTestFunction.name)! + 1,
            );
          }
          const displayedError =
            error instanceof PropertyTestError
              ? error.clarityError
              : error &&
                  typeof error === "string" &&
                  error.toLowerCase().includes("runtime")
                ? "(runtime)"
                : "(unknown)";

          // Capture the error and log the test failure.
          radio.emit(
            "logMessage",
            red(
              `₿ ${simnet.burnBlockHeight.toString().padStart(8)} ` +
                `Ӿ ${simnet.blockHeight.toString().padStart(8)}   ` +
                `${testCallerWallet} ` +
                `[FAIL] ` +
                `${targetContractName} ` +
                `${underline(r.selectedTestFunction.name)} ` +
                `${printedTestFunctionArgs} ` +
                displayedError,
            ),
          );

          // Re-throw the error for fast-check to catch and process.
          throw error;
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
 * Emits a warning for test functions that reference traits without eligible
 * implementations.
 */
const emitMissingTraitWarning = (
  radio: EventEmitter,
  functionNames: string[],
) => {
  if (functionNames.length === 0) {
    return;
  }

  const functionList = functionNames.map((fn) => `  - ${fn}`).join("\n");
  radio.emit(
    "logMessage",
    yellow(
      `\nWarning: The following test functions reference traits without eligible implementations and will be skipped:\n\n${functionList}\n`,
    ),
  );
  radio.emit(
    "logMessage",
    yellow(
      `Note: You can add contracts implementing traits either as project contracts or as requirements.\n`,
    ),
  );
};

/**
 * Emits a header for a regression test run with seed and run count information.
 */
const emitPropertyRegressionTestHeader = (
  radio: EventEmitter,
  targetContractName: string,
  seed: number,
  numRuns: number,
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
`,
  );
};

const filterTestFunctions = (
  allFunctionsMap: Map<string, ContractInterfaceFunction[]>,
) =>
  new Map(
    Array.from(allFunctionsMap, ([contractId, functions]) => [
      contractId,
      functions.filter(
        (f) => f.access === "private" && f.name.startsWith("test-"),
      ),
    ]),
  );

export const isTestDiscardedInPlace = (testFunctionCallResultJson: any) =>
  testFunctionCallResultJson.success === true &&
  testFunctionCallResultJson.value.value === false;

/**
 * Checks if the test function has to be discarded.
 * @param discardFunctionName The discard function name.
 * @param selectedTestFunctionArgs The generated test function arguments.
 * @param contractId The contract identifier.
 * @param simnet The simnet instance.
 * @param selectedCaller The selected caller address.
 * @returns A boolean indicating if the test function has to be discarded.
 */
const isTestDiscarded = (
  discardFunctionName: string | undefined,
  selectedTestFunctionArgs: any[],
  contractId: string,
  simnet: Simnet,
  selectedCaller: string,
) => {
  if (!discardFunctionName) {
    return false;
  }

  const { result: discardFunctionCallResult } = simnet.callReadOnlyFn(
    contractId,
    discardFunctionName,
    selectedTestFunctionArgs,
    selectedCaller,
  );
  const jsonDiscardFunctionCallResult = cvToJSON(discardFunctionCallResult);
  return jsonDiscardFunctionCallResult.value === false;
};

/**
 * Validates a discard function, ensuring that its parameters match the test
 * function's parameters and that its return type is boolean.
 * @param contractId The contract identifier.
 * @param discardFunctionName The discard function name.
 * @param testFunctionName The test function name.
 * @param testContractsDiscardFunctions The discard functions map.
 * @param testContractsTestFunctions The test functions map.
 * @param radio The radio event emitter.
 * @returns A boolean indicating if the discard function passes the checks.
 */
const validateDiscardFunction = (
  contractId: string,
  discardFunctionName: string,
  testFunctionName: string,
  testContractsDiscardFunctions: Map<string, ContractInterfaceFunction[]>,
  testContractsTestFunctions: Map<string, ContractInterfaceFunction[]>,
  radio: EventEmitter,
) => {
  const testFunction = testContractsTestFunctions
    .get(contractId)
    ?.find((f) => f.name === testFunctionName);
  const discardFunction = testContractsDiscardFunctions
    .get(contractId)
    ?.find((f) => f.name === discardFunctionName);

  if (!testFunction || !discardFunction) {
    return false;
  }

  if (!isParamsMatch(testFunction, discardFunction)) {
    radio.emit(
      "logMessage",
      red(
        `\nError: Parameter mismatch for discard function "${discardFunctionName}" in contract "${getContractNameFromContractId(
          contractId,
        )}".\n`,
      ),
    );
    return false;
  }

  if (!isReturnTypeBoolean(discardFunction)) {
    radio.emit(
      "logMessage",
      red(
        `\nError: Return type must be boolean for discard function "${discardFunctionName}" in contract "${getContractNameFromContractId(
          contractId,
        )}".\n`,
      ),
    );
    return false;
  }

  return true;
};

/**
 * Checks if the test function parameters match the discard function
 * parameters.
 * @param testFunctionInterface The test function's interface.
 * @param discardFunctionInterface The discard function's interface.
 * @returns A boolean indicating if the parameters match.
 */
export const isParamsMatch = (
  testFunctionInterface: ContractInterfaceFunction,
  discardFunctionInterface: ContractInterfaceFunction,
) => {
  const sortedTestFunctionArgs = [...testFunctionInterface.args].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const sortedDiscardFunctionArgs = [...discardFunctionInterface.args].sort(
    (a, b) => a.name.localeCompare(b.name),
  );
  return (
    JSON.stringify(sortedTestFunctionArgs) ===
    JSON.stringify(sortedDiscardFunctionArgs)
  );
};

/**
 * Checks if the discard function's return type is boolean.
 * @param discardFunctionInterface The discard function's interface.
 * @returns A boolean indicating if the return type is boolean.
 */
export const isReturnTypeBoolean = (
  discardFunctionInterface: ContractInterfaceFunction,
) => discardFunctionInterface.outputs.type === "bool";

export class PropertyTestError extends Error {
  readonly clarityError: string;
  constructor(message: string, clarityError: string) {
    super(message);
    this.clarityError = clarityError;
  }
}
