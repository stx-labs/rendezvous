#!/usr/bin/env node
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { initSimnet } from "@stacks/clarinet-sdk";
import { red, yellow } from "ansicolor";

import {
  helpMessage,
  logRunConfig,
  logWarnings,
  parseCli,
  type RunConfig,
} from "./cli";
import { resolveAccounts } from "./config";
import { checkInvariants } from "./invariant";
import { checkProperties } from "./property";
import {
  getContractNameFromContractId,
  getFunctionsFromContractInterfaces,
  getSimnetDeployerContractsInterfaces,
} from "./shared";

const logger = (log: string, logLevel: "log" | "error" | "info" = "log") => {
  console[logLevel](log);
};

/**
 * Gets the manifest file name for a Clarinet project.
 * If a custom manifest exists (`Clarinet-<contract-name>.toml`), it is used.
 * Otherwise, the default `Clarinet.toml` is returned.
 * @param manifestDir The relative path to the Clarinet project directory.
 * @param targetContractName The target contract name.
 * @returns The manifest file name.
 */
export const getManifestFileName = (
  manifestDir: string,
  targetContractName: string,
) => {
  const isCustomManifest = existsSync(
    resolve(manifestDir, `Clarinet-${targetContractName}.toml`),
  );

  if (isCustomManifest) {
    return `Clarinet-${targetContractName}.toml`;
  }

  return "Clarinet.toml";
};

const parseCliOrExit = (
  argv: string[],
  radio: EventEmitter,
): RunConfig | undefined => {
  try {
    return parseCli(argv);
  } catch (err: unknown) {
    radio.emit(
      "logFailure",
      `\n${err instanceof Error ? err.message : String(err)}`,
    );
    radio.emit("logMessage", helpMessage);
    process.exit(1);
  }
};

export const main = async () => {
  const radio = new EventEmitter();
  radio.on("logMessage", (log) => logger(log));
  radio.on("logInfo", (log) => logger(yellow(log), "info"));
  radio.on("logFailure", (log) => logger(red(log), "error"));

  const runConfig = parseCliOrExit(process.argv.slice(2), radio);

  if (!runConfig) {
    radio.emit("logMessage", helpMessage);
    return;
  }

  logWarnings(radio, runConfig.warnings);

  // Unchecked tests and inconclusive campaigns fail only on request.
  if (runConfig.failOnUnchecked) {
    for (const event of ["unchecked", "inconclusive"]) {
      radio.on(event, () => {
        radio.emit(
          "logFailure",
          "Failing the run because of --fail-on-unchecked.\n",
        );
        process.exitCode = 1;
      });
    }
  }

  const manifestPath = join(
    runConfig.manifestDir,
    getManifestFileName(runConfig.manifestDir, runConfig.sutContractName),
  );

  logRunConfig(radio, runConfig, manifestPath);

  const simnet = await initSimnet(manifestPath);

  const { eligibleAccounts, allAddresses } = resolveAccounts(
    simnet.getAccounts(),
    runConfig.accounts,
    runConfig.accountsMode,
  );

  const resetSession = async () => {
    await initSimnet(manifestPath);
    radio.emit("logMessage", "Simnet session reset.");
  };

  /**
   * The list of contract IDs for the SUT contract names, as per the simnet.
   */
  const rendezvousList = [
    ...getSimnetDeployerContractsInterfaces(simnet).keys(),
  ].filter(
    (deployedContract) =>
      getContractNameFromContractId(deployedContract) ===
      runConfig.sutContractName,
  );

  if (rendezvousList.length === 0) {
    radio.emit(
      "logFailure",
      `\nContract "${runConfig.sutContractName}" not found among project contracts.\n`,
    );
    return;
  }

  const rendezvousAllFunctions = getFunctionsFromContractInterfaces(
    new Map(
      [...getSimnetDeployerContractsInterfaces(simnet)].filter(([contractId]) =>
        rendezvousList.includes(contractId),
      ),
    ),
  );

  // Select the testing routine based on `type`.
  switch (runConfig.type) {
    case "invariant": {
      await checkInvariants(
        simnet,
        resetSession,
        rendezvousList,
        rendezvousAllFunctions,
        runConfig.seed,
        runConfig.runs,
        runConfig.dial,
        runConfig.bail,
        runConfig.regr,
        radio,
        eligibleAccounts,
        allAddresses,
      );
      break;
    }

    case "test": {
      await checkProperties(
        simnet,
        resetSession,
        rendezvousList,
        rendezvousAllFunctions,
        runConfig.seed,
        runConfig.runs,
        runConfig.bail,
        runConfig.regr,
        radio,
        eligibleAccounts,
        allAddresses,
      );
      break;
    }
  }
};

if (require.main === module) {
  main();
}
