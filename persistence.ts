import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { RunDetails } from "./heatstroke.types";

/**
 * Represents a persisted failure record for regression testing.
 */
interface FailureRecord {
  /** The seed used by fast-check for this test run */
  seed: number;
  /** The number of runs needed to reproduce the failure*/
  numRuns: number;
  /** The fast-check path to the counterexample */
  counterexamplePath?: string | null;
  /** The path to the dialer file used for this test run */
  dial: string | undefined;
  /** Timestamp when the failure was recorded */
  timestamp: number;
}

/**
 * Container for all failures grouped by test type.
 */
interface FailureStore {
  /** Failures from invariant tests */
  invariant: FailureRecord[];
  /** Failures from property tests */
  test: FailureRecord[];
}

/**
 * Configuration for persistence behavior.
 */
interface PersistenceConfig {
  /** Base directory for storing regression files. Default: '.rendezvous-regressions' */
  baseDir?: string;
}

/** Default configuration for persistence behavior. */
const DEFAULT_CONFIG: Required<PersistenceConfig> = {
  baseDir: ".rendezvous-regressions",
};

/**
 * Gets the absolute file path for a contract's failure store.
 * Uses contractId as filename (e.g., "ST1...ADDR.counter.json")
 * @param contractId The contract identifier being tested
 * @param baseDir The base directory for storing regression files
 * @returns The file path for the failure store
 */
export const getFailureFilePath = (
  contractId: string,
  baseDir: string = DEFAULT_CONFIG.baseDir,
): string => resolve(baseDir, `${contractId}.json`);

/**
 * Loads the failure store for a contract, or creates an empty one.
 * @param contractId The contract identifier being tested
 * @param baseDir The base directory for storing regression files
 * @returns The failure store
 */
const loadFailureStore = (
  contractId: string,
  baseDir: string = DEFAULT_CONFIG.baseDir,
): FailureStore => {
  const filePath = getFailureFilePath(contractId, baseDir);

  try {
    const content = readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return { invariant: [], test: [] };
  }
};

/**
 * Saves the failure store for a contract.
 * @param contractId The contract identifier being tested
 * @param baseDir The base directory for storing regression files
 * @param store The failure store to save
 */
const saveFailureStore = (
  contractId: string,
  baseDir: string,
  store: FailureStore,
): void => {
  // Ensure the base directory exists.
  mkdirSync(baseDir, { recursive: true });

  const filePath = getFailureFilePath(contractId, baseDir);
  writeFileSync(filePath, JSON.stringify(store, null, 2), "utf-8");
};

/**
 * Persists a test failure for future regression testing.
 *
 * @param runDetails The test run details from fast-check
 * @param type The type of test that failed
 * @param contractId The contract identifier being tested
 * @param dial The path to the dialer file used for this test run
 * @param config Optional configuration for persistence behavior
 */
export const persistFailure = (
  runDetails: RunDetails,
  type: "invariant" | "test",
  contractId: string,
  dial: string | undefined,
  config?: PersistenceConfig,
): void => {
  const { baseDir } = { ...DEFAULT_CONFIG, ...config };

  // Load existing store.
  const store = loadFailureStore(contractId, baseDir);

  const record: FailureRecord = {
    seed: runDetails.seed,
    dial: dial,
    numRuns: runDetails.numRuns,
    counterexamplePath: runDetails.counterexamplePath ?? runDetails.path,
    timestamp: Date.now(),
  };

  // Get the array for this test type.
  const failures = store[type];

  // Check if this seed already exists.
  const seedExists = failures.some((f) => f.seed === record.seed);
  if (seedExists) {
    // Already recorded.
    return;
  }

  // Add new failure.
  failures.push(record);

  // Sort the failures in descending order by timestamp.
  failures.sort((a, b) => b.timestamp - a.timestamp);

  // Save back to file.
  saveFailureStore(contractId, baseDir, store);
};

/**
 * Loads persisted failures for a given contract and test type.
 *
 * @param contractId The contract identifier
 * @param type The type of test ("invariant" or "test")
 * @param config Optional configuration
 * @returns Array of failure records, or empty array if none exist
 */
export const loadFailures = (
  contractId: string,
  type: "invariant" | "test",
  config?: PersistenceConfig,
): FailureRecord[] => {
  const { baseDir } = { ...DEFAULT_CONFIG, ...config };
  const store = loadFailureStore(contractId, baseDir);

  return store[type];
};
