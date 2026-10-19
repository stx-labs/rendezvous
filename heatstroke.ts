import type { EventEmitter } from "node:events";

import type { ContractInterfaceFunction } from "@stacks/clarinet-sdk-wasm";
import { cvToString, type ClarityValue } from "@stacks/transactions";
import { green } from "ansicolor";

import type {
  InvariantCounterExample,
  RunDetails,
  Statistics,
  StatisticsTreeOptions,
  TestCounterExample,
} from "./heatstroke.types";
import type { FalsifiedInvariantError } from "./invariant";
import type { PropertyTestError } from "./property";
import { getContractNameFromContractId } from "./shared";

/**
 * Heatstrokes Reporter
 *
 * Provides a detailed report when a test run test ends. In case of failure,
 * includes the contract, functions, arguments, outputs, and the specific
 * invariant or property test that failed.
 * @param runDetails The details of the test run provided by fast-check.
 * @property `runDetails.failed`: Indicates if the test run failed.
 * @property `runDetails.counterexample`: The input that caused the failure.
 * @property `runDetails.numRuns`: The number of test cases that were run.
 * @property `runDetails.seed`: The replay seed for reproducing the failure.
 * @property `runDetails.counterexamplePath`: Fast-check shrink metadata for
 * diagnostics; it is not an exact replay trace.
 * @property `runDetails.path`: The legacy path fallback for older callers.
 * @property `runDetails.error`: The error thrown during the test.
 * @param radio The event emitter to log messages.
 * @param type The type of test that failed: invariant or property.
 * @returns void
 */
export const reporter = (
  runDetails: RunDetails,
  radio: EventEmitter,
  type: "invariant" | "test",
  statistics: Statistics,
) => {
  const { counterexample, failed, numRuns, path, seed } = runDetails;

  if (failed) {
    const error = runDetails.errorInstance || runDetails.error;
    const counterexamplePathValue = runDetails.counterexamplePath ?? path;

    // Extract the actual Clarity error once for both error types.
    const clarityError =
      (error as FalsifiedInvariantError | PropertyTestError)?.clarityError ||
      error?.message ||
      error?.toString() ||
      "Unknown error";

    // Report general run data.
    radio.emit(
      "logFailure",
      `\nError: Property failed after ${numRuns} tests.`,
    );
    radio.emit("logFailure", `Seed : ${seed}`);
    if (counterexamplePathValue) {
      radio.emit("logFailure", `Path : ${counterexamplePathValue}`);
    }
    switch (type) {
      case "invariant": {
        const ce = counterexample[0] as InvariantCounterExample;
        // Report specific run data for the invariant testing type.
        radio.emit("logFailure", `\nCounterexample:`);
        radio.emit(
          "logFailure",
          `- Contract : ${getContractNameFromContractId(
            ce.rendezvousContractId,
          )}`,
        );
        radio.emit(
          "logFailure",
          `- Functions: ${ce.selectedFunctions
            .map(
              (selectedFunction: ContractInterfaceFunction) =>
                selectedFunction.name,
            )
            .join(", ")} (${ce.selectedFunctions
            .map(
              (selectedFunction: ContractInterfaceFunction) =>
                selectedFunction.access,
            )
            .join(", ")})`,
        );
        radio.emit(
          "logFailure",
          `- Arguments: ${ce.selectedFunctionsArgsList
            .map((selectedFunctionArgs: ClarityValue[]) =>
              selectedFunctionArgs.map((cv) => cvToString(cv)).join(" "),
            )
            .join(", ")}`,
        );
        radio.emit(
          "logFailure",
          `- Callers  : ${ce.sutCallers
            .map((sutCaller: [string, string]) => sutCaller[0])
            .join(", ")}`,
        );
        radio.emit(
          "logFailure",
          `- Outputs  : ${ce.selectedFunctions
            .map((selectedFunction: ContractInterfaceFunction) =>
              JSON.stringify(selectedFunction.outputs),
            )
            .join(", ")}`,
        );
        radio.emit(
          "logFailure",
          `- Invariant: ${ce.selectedInvariant.name} (${ce.selectedInvariant.access})`,
        );
        radio.emit(
          "logFailure",
          `- Arguments: ${(ce.invariantArgs as ClarityValue[])
            .map((cv) => cvToString(cv))
            .join(" ")}`,
        );
        radio.emit("logFailure", `- Caller   : ${ce.invariantCaller[0]}`);

        radio.emit(
          "logFailure",
          `\nWhat happened? Rendezvous went on a rampage and found a weak spot:\n`,
        );

        const formattedError = `The invariant "${
          ce.selectedInvariant.name
        }" returned:\n\n${clarityError
          .toString()
          .split("\n")
          .map((line: string) => "    " + line)
          .join("\n")}\n`;

        radio.emit("logFailure", formattedError);

        break;
      }
      case "test": {
        const ce = counterexample[0] as TestCounterExample;

        // Report specific run data for the property testing type.
        radio.emit("logFailure", `\nCounterexample:`);
        radio.emit(
          "logFailure",
          `- Contract : ${getContractNameFromContractId(
            ce.rendezvousContractId,
          )}`,
        );
        radio.emit(
          "logFailure",
          `- Test Function : ${ce.selectedTestFunction.name} (${ce.selectedTestFunction.access})`,
        );
        radio.emit(
          "logFailure",
          `- Arguments     : ${(ce.functionArgs as ClarityValue[])
            .map((cv) => cvToString(cv))
            .join(" ")}`,
        );
        radio.emit("logFailure", `- Caller        : ${ce.testCaller[0]}`);
        radio.emit(
          "logFailure",
          `- Outputs       : ${JSON.stringify(ce.selectedTestFunction.outputs)}`,
        );

        radio.emit(
          "logFailure",
          `\nWhat happened? Rendezvous went on a rampage and found a weak spot:\n`,
        );

        const formattedError = `The test function "${
          ce.selectedTestFunction.name
        }" returned:\n\n${clarityError
          .toString()
          .split("\n")
          .map((line: string) => "    " + line)
          .join("\n")}\n`;

        radio.emit("logFailure", formattedError);
        break;
      }
    }

    // Set non-zero exit code to properly signal test failure to shells,
    // scripts, CI systems, and other tools that check process exit status.
    process.exitCode = 1;
  } else {
    radio.emit(
      "logMessage",
      green(
        `\nOK, ${
          type === "invariant" ? "invariants" : "properties"
        } passed after ${numRuns} runs.\n`,
      ),
    );
  }
  reportStatistics(statistics, type, radio);
  radio.emit("logMessage", "\n");
};

const ARROW = "->";
const SUCCESS_SYMBOL = "+";
const FAIL_SYMBOL = "-";
const WARN_SYMBOL = "!";

/**
 * Reports execution statistics in a tree-like format.
 * @param statistics The statistics object containing test execution data.
 * @param type The type of test being reported.
 * @param radio The event emitter for logging messages.
 */
const reportStatistics = (
  statistics: Statistics,
  type: "invariant" | "test",
  radio: EventEmitter,
): void => {
  if (
    (type === "invariant" && (!statistics.invariant || !statistics.sut)) ||
    (type === "test" && !statistics.test)
  ) {
    radio.emit("logMessage", "No statistics available for this run");
    return;
  }

  radio.emit("logMessage", `\nEXECUTION STATISTICS\n`);

  switch (type) {
    case "invariant": {
      radio.emit("logMessage", "│ PUBLIC FUNCTION CALLS");
      radio.emit("logMessage", "│");
      radio.emit("logMessage", `├─ ${SUCCESS_SYMBOL} SUCCESSFUL`);
      logAsTree(Object.fromEntries(statistics.sut!.successful), radio);

      radio.emit("logMessage", "│");
      radio.emit("logMessage", `├─ ${FAIL_SYMBOL} IGNORED`);
      logAsTree(Object.fromEntries(statistics.sut!.failed), radio);

      radio.emit("logMessage", "│");
      radio.emit("logMessage", "│ INVARIANT CHECKS");
      radio.emit("logMessage", "│");
      radio.emit("logMessage", `├─ ${SUCCESS_SYMBOL} PASSED`);
      logAsTree(Object.fromEntries(statistics.invariant!.successful), radio);

      radio.emit("logMessage", "│");
      radio.emit("logMessage", `└─ ${FAIL_SYMBOL} FAILED`);
      logAsTree(Object.fromEntries(statistics.invariant!.failed), radio, {
        isLastSection: true,
      });

      radio.emit("logMessage", "\nLEGEND:\n");
      radio.emit(
        "logMessage",
        "  SUCCESSFUL calls executed and advanced the test",
      );
      radio.emit(
        "logMessage",
        "  IGNORED    calls failed but did not affect the test",
      );
      radio.emit(
        "logMessage",
        "  PASSED     invariants maintained system integrity",
      );
      radio.emit(
        "logMessage",
        "  FAILED     invariants indicate contract vulnerabilities",
      );
      if (computeTotalCount(statistics.invariant!.failed) > 0) {
        radio.emit(
          "logFailure",
          "\n! FAILED invariants require immediate attention as they indicate that your contract can enter an invalid state under certain conditions.",
        );
      }
      break;
    }

    case "test": {
      radio.emit("logMessage", "│ PROPERTY TEST CALLS");
      radio.emit("logMessage", "│");
      radio.emit("logMessage", `├─ ${SUCCESS_SYMBOL} PASSED`);
      logAsTree(Object.fromEntries(statistics.test!.successful), radio);

      radio.emit("logMessage", "│");
      radio.emit("logMessage", `├─ ${WARN_SYMBOL} DISCARDED`);
      logAsTree(Object.fromEntries(statistics.test!.discarded), radio);

      radio.emit("logMessage", "│");
      radio.emit("logMessage", `└─ ${FAIL_SYMBOL} FAILED`);
      logAsTree(Object.fromEntries(statistics.test!.failed), radio, {
        isLastSection: true,
      });

      radio.emit("logMessage", "\nLEGEND:\n");
      radio.emit(
        "logMessage",
        "  PASSED    properties verified for given inputs",
      );
      radio.emit(
        "logMessage",
        "  DISCARDED skipped due to invalid preconditions",
      );
      radio.emit(
        "logMessage",
        "  FAILED    property violations or unexpected behavior",
      );
      if (computeTotalCount(statistics.test!.failed) > 0) {
        radio.emit(
          "logFailure",
          "\n! FAILED tests indicate that your function properties don't hold for all inputs. Review the counterexamples above for debugging.",
        );
      }
      break;
    }
  }
};

/**
 * Displays a tree structure of data.
 * @param tree The object to display as a tree.
 * @param radio The event emitter for logging messages.
 * @param options Configuration options for tree display.
 */
const logAsTree = (
  tree: Record<string, any>,
  radio: EventEmitter,
  options: StatisticsTreeOptions = {},
): void => {
  const { isLastSection = false, baseIndent = "   " } = options;

  const printTree = (
    node: Record<string, any>,
    radioEmitter: EventEmitter,
    indent: string = baseIndent,
    isLastParent = true,
  ): void => {
    const keys = Object.keys(node);

    keys.forEach((key, index) => {
      const isLast = index === keys.length - 1;
      const connector = isLast ? "└─" : "├─";
      const nextIndent = indent + (isLastParent ? "   " : "│  ");
      const leadingChar = isLastSection ? " " : "│";

      if (typeof node[key] === "object" && node[key] !== null) {
        radioEmitter.emit(
          "logMessage",
          `${leadingChar} ${indent}${connector} ${ARROW} ${key}`,
        );
        printTree(node[key], radioEmitter, nextIndent, isLast);
      } else {
        const count = node[key] as number;
        radioEmitter.emit(
          "logMessage",
          `${leadingChar} ${indent}${connector} ${key}: x${count}`,
        );
      }
    });
  };

  printTree(tree, radio, baseIndent);
};

/**
 * Computes the total number of failures from a failure map.
 * @param failedMap Map containing failure counts by test name
 * @returns The sum of all failure counts
 */
const computeTotalCount = (failedMap: Map<string, number>): number => {
  let totalFailures = 0;
  for (const count of failedMap.values()) {
    totalFailures += count;
  }
  return totalFailures;
};
