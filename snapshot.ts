import { EventEmitter } from "node:events";

import type { Simnet } from "@stacks/clarinet-sdk";
import { cvToString } from "@stacks/transactions";

import type { RunDetails } from "./heatstroke.types";
import { getContractNameFromContractId } from "./shared";

/**
 * The target contract's data variables before a function call.
 */
export interface StateSnapshot {
  /** The function about to be called. */
  functionName: string;
  burnBlockHeight: number;
  blockHeight: number;
  /** Data variable values as Clarity strings. */
  dataVariables: [string, string][];
}

/**
 * Records the state before each call of a single run, chosen by its number.
 * Other runs are not recorded, so replaying up to a failure stays cheap.
 */
export class StateRecorder {
  readonly snapshots: StateSnapshot[] = [];
  error: unknown = undefined;
  private readonly targetRun: number;
  private run = 0;

  constructor(targetRun: number) {
    this.targetRun = targetRun;
  }

  /** Call at the start of each run. */
  startRun() {
    this.run++;
  }

  /** Records the data variables before `functionName` is called. */
  record(simnet: Simnet, contractId: string, functionName: string) {
    if (this.run !== this.targetRun || this.error !== undefined) {
      return;
    }
    // Do not let a failed read change how the replayed run behaves.
    try {
      const variables = simnet
        .getContractsInterfaces()
        .get(contractId)!
        .variables.filter(({ access }) => access === "variable");
      this.snapshots.push({
        functionName,
        burnBlockHeight: simnet.burnBlockHeight,
        blockHeight: simnet.blockHeight,
        dataVariables: variables.map(({ name }) => [
          name,
          cvToString(simnet.getDataVar(contractId, name)),
        ]),
      });
    } catch (error: unknown) {
      this.error = error;
    }
  }
}

/**
 * Replays a failed run from a fresh session and reports the target
 * contract's data variables before each call of the first failing run.
 * Nothing is replayed or read when the run passed.
 * @param runDetails The details of the original run.
 * @param contractId The target contract identifier.
 * @param resetSession Resets the simnet session to a clean state.
 * @param replay Runs the test again with the same configuration, stopping
 * at the first failure, logging to the given radio and recording states.
 * @param radio The custom logging event emitter.
 */
export const reportStateBeforeFailure = async (
  runDetails: RunDetails,
  contractId: string,
  resetSession: () => Promise<void>,
  replay: (radio: EventEmitter, recorder: StateRecorder) => Promise<RunDetails>,
  radio: EventEmitter,
) => {
  if (!runDetails.failed) {
    return;
  }

  const { numRuns, seed } = runDetails;
  radio.emit(
    "logMessage",
    `Replaying seed ${seed} up to run ${numRuns} to report the state ` +
      `before the first failure...`,
  );
  await resetSession();

  const recorder = new StateRecorder(numRuns);
  // The replay output is not shown; only its recorded state is reported.
  const replayed = await replay(new EventEmitter(), recorder);

  if (recorder.error !== undefined) {
    radio.emit(
      "logFailure",
      `Could not read the contract state: ${String(recorder.error)}\n`,
    );
    return;
  }
  if (!replayed.failed || replayed.numRuns !== numRuns) {
    radio.emit(
      "logFailure",
      "The replay did not fail at the same run, so no state is reported.\n",
    );
    return;
  }

  const contractName = getContractNameFromContractId(contractId);
  radio.emit(
    "logMessage",
    `\nContract state before each call of run ${numRuns}, the first ` +
      `failing run (${contractName} data variables only):`,
  );
  for (const snapshot of recorder.snapshots) {
    radio.emit(
      "logMessage",
      `\n₿ ${snapshot.burnBlockHeight.toString().padStart(8)} ` +
        `Ӿ ${snapshot.blockHeight.toString().padStart(8)}   ` +
        `before ${snapshot.functionName}`,
    );
    if (snapshot.dataVariables.length === 0) {
      radio.emit("logMessage", "  (no data variables)");
    }
    for (const [name, value] of snapshot.dataVariables) {
      radio.emit("logMessage", `  ${name}: ${value}`);
    }
  }
  radio.emit("logMessage", "\n");
};
