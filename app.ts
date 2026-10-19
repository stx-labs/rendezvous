#!/usr/bin/env node
import { EventEmitter } from "node:events";
import { existsSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { initSimnet } from "@stacks/clarinet-sdk";

import {
  helpMessage,
  logRunConfig,
  logWarnings,
  parseCli,
  type RunConfig,
} from "./cli";
import { red, yellow } from "./colors";
import { resolveAccounts } from "./config";
import { CoverageTracker, reportAfterRun } from "./coverage";
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
  radio.on("logFailure", (log) => logger(red(log, process.stderr), "error"));

  const runConfig = parseCliOrExit(process.argv.slice(2), radio);

  if (!runConfig) {
    radio.emit("logMessage", helpMessage);
    return;
  }

  logWarnings(radio, runConfig.warnings);

  // Unchecked tests and inconclusive campaigns fail only on request. The
  // event can fire once per regression, so fail once after the run.
  let unchecked = false;
  if (runConfig.failOnUnchecked) {
    radio.on("unchecked", () => {
      unchecked = true;
    });
  }

  const manifestPath = join(
    runConfig.manifestDir,
    getManifestFileName(runConfig.manifestDir, runConfig.sutContractName),
  );

  logRunConfig(radio, runConfig, manifestPath);

  // SDK options apply when the instance is created; bypass the cache only
  // when coverage is explicitly enabled. Default initialization is unchanged.
  const simnet = runConfig.coverage
    ? await initSimnet(manifestPath, true, {
        trackCosts: false,
        trackCoverage: true,
      })
    : await initSimnet(manifestPath);
  const coverage = runConfig.coverage ? new CoverageTracker() : undefined;
  coverage?.collect(simnet);
  if (runConfig.coverageJson) {
    radio.on("runComplete", () => coverage!.sample(simnet));
  }

  const { eligibleAccounts, allAddresses } = resolveAccounts(
    simnet.getAccounts(),
    runConfig.accounts,
    runConfig.accountsMode,
  );

  const resetSession = async () => {
    coverage?.collect(simnet);
    await initSimnet(manifestPath);
    radio.emit("logMessage", "Simnet session reset.");
  };

  const deployerContractsInterfaces =
    getSimnetDeployerContractsInterfaces(simnet);

  /**
   * The list of contract IDs for the SUT contract names, as per the simnet.
   */
  const rendezvousList = [...deployerContractsInterfaces.keys()].filter(
    (deployedContract) =>
      getContractNameFromContractId(deployedContract) ===
      runConfig.sutContractName,
  );

  if (rendezvousList.length === 0) {
    radio.emit(
      "logFailure",
      `\nContract "${runConfig.sutContractName}" not found among project contracts.\n`,
    );
    process.exitCode = 1;
    coverage?.throwIfFailed();
    return;
  }

  const rendezvousAllFunctions = getFunctionsFromContractInterfaces(
    new Map(
      [...deployerContractsInterfaces].filter(([contractId]) =>
        rendezvousList.includes(contractId),
      ),
    ),
  );

  const reportCoverage = (tracker: CoverageTracker) => {
    tracker.collect(simnet);
    tracker.throwIfFailed();
    const report = tracker.summary();
    radio.emit(
      "logMessage",
      `Coverage: ${report.lines.hit}/${report.lines.total} lines, ` +
        `${report.branches.hit}/${report.branches.total} branches ` +
        `in ${(report.elapsedMs / 1000).toFixed(3)} s.`,
    );
    // Totals include every project contract, so also list the files the
    // run reached.
    for (const file of report.files) {
      if (file.lines.hit > 0 || file.branches.hit > 0) {
        radio.emit(
          "logMessage",
          `  ${relative(runConfig.manifestDir, file.file)}: ` +
            `${file.lines.hit}/${file.lines.total} lines, ` +
            `${file.branches.hit}/${file.branches.total} branches`,
        );
      }
    }
    if (runConfig.coverageJson) {
      writeFileSync(
        runConfig.coverageJson,
        JSON.stringify(
          {
            version: 1,
            manifestPath: resolve(manifestPath),
            contract: runConfig.sutContractName,
            type: runConfig.type,
            seed: runConfig.seed,
            requestedRuns: runConfig.runs,
            ...report,
          },
          null,
          2,
        ) + "\n",
      );
    }
    if (runConfig.coverageLcov) {
      writeFileSync(runConfig.coverageLcov, tracker.toLcov());
    }
  };

  // Select the testing routine based on `type`.
  const run = async () => {
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

  if (coverage) {
    await reportAfterRun(run, () => reportCoverage(coverage), radio);
  } else {
    await run();
  }

  if (unchecked) {
    radio.emit(
      "logFailure",
      "Failing the run because of --fail-on-unchecked.\n",
    );
    process.exitCode = 1;
  }
};

if (require.main === module) {
  main();
}
