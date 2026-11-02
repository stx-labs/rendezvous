import { existsSync, readFileSync } from "node:fs";

/**
 * A custom account entry in the config file.
 */
export interface ConfigAccount {
  /** The account name (e.g., "whale_1"). */
  name: string;
  /** The Stacks address (e.g., "SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE"). */
  address: string;
}

/**
 * The mode for merging config accounts with Devnet.toml accounts.
 * - "concatenate": Adds config accounts to the existing Devnet accounts.
 * - "overwrite": Replaces all Devnet accounts with config accounts.
 */
export type AccountsMode = "concatenate" | "overwrite";

/**
 * The structure of a rendezvous config file (rv.config.json).
 */
export interface RendezvousConfig {
  /** Custom accounts to use during testing. */
  accounts?: ConfigAccount[];
  /**
   * How to combine config accounts with Devnet.toml accounts.
   * Default: "overwrite".
   */
  accounts_mode?: AccountsMode;
  /** Seed for replay functionality. */
  seed?: number;
  /** Number of test iterations. */
  runs?: number;
  /** Stop on first failure. */
  bail?: boolean;
  /** Run regression tests only. */
  regr?: boolean;
  /** Fail the run if a test or invariant was never checked. */
  fail_on_unchecked?: boolean;
  /** Path to custom dialers file. */
  dial?: string;
}

/**
 * Loads and validates a rendezvous config file.
 * @param configPath The path to the config file.
 * @returns The parsed and validated config.
 */
export const loadConfig = (
  configPath: string,
): { config: RendezvousConfig; unknownKeys: string[] } => {
  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const raw = readFileSync(configPath, "utf-8");

  let parsed: unknown = undefined;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Failed to parse config file as JSON: ${configPath}`);
  }

  return validateConfig(parsed);
};

/**
 * Validates the parsed config object and returns a typed config.
 * @param raw The raw parsed JSON object.
 * @returns The validated config.
 */
const validateConfig = (
  raw: unknown,
): { config: RendezvousConfig; unknownKeys: string[] } => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Config file must contain a JSON object.");
  }

  const obj = raw as Record<string, unknown>;
  const config: RendezvousConfig = {};

  if ("accounts" in obj) {
    if (!Array.isArray(obj.accounts)) {
      throw new Error(`"accounts" must be an array.`);
    }
    config.accounts = obj.accounts.map((entry: unknown, i: number) => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        throw new Error(`"accounts[${i}]" must be an object.`);
      }
      const acc = entry as Record<string, unknown>;
      if (typeof acc.name !== "string" || acc.name.length === 0) {
        throw new Error(`"accounts[${i}].name" must be a non-empty string.`);
      }
      if (typeof acc.address !== "string" || acc.address.length === 0) {
        throw new Error(`"accounts[${i}].address" must be a non-empty string.`);
      }
      return { name: acc.name, address: acc.address };
    });
  }

  if ("accounts_mode" in obj) {
    if (
      obj.accounts_mode !== "concatenate" &&
      obj.accounts_mode !== "overwrite"
    ) {
      throw new Error(
        `"accounts_mode" must be "concatenate" or "overwrite". Got: "${obj.accounts_mode}".`,
      );
    }
    config.accounts_mode = obj.accounts_mode;
  }

  if ("seed" in obj) {
    if (typeof obj.seed !== "number" || !Number.isInteger(obj.seed)) {
      throw new Error(`"seed" must be an integer.`);
    }
    config.seed = obj.seed;
  }

  if ("runs" in obj) {
    if (
      typeof obj.runs !== "number" ||
      !Number.isInteger(obj.runs) ||
      obj.runs < 1
    ) {
      throw new Error(`"runs" must be a positive integer.`);
    }
    config.runs = obj.runs;
  }

  if ("bail" in obj) {
    if (typeof obj.bail !== "boolean") {
      throw new Error(`"bail" must be a boolean.`);
    }
    config.bail = obj.bail;
  }

  if ("regr" in obj) {
    if (typeof obj.regr !== "boolean") {
      throw new Error(`"regr" must be a boolean.`);
    }
    config.regr = obj.regr;
  }

  if ("fail_on_unchecked" in obj) {
    if (typeof obj.fail_on_unchecked !== "boolean") {
      throw new Error(`"fail_on_unchecked" must be a boolean.`);
    }
    config.fail_on_unchecked = obj.fail_on_unchecked;
  }

  if ("dial" in obj) {
    if (typeof obj.dial !== "string") {
      throw new Error(`"dial" must be a string.`);
    }
    config.dial = obj.dial;
  }

  const knownKeys = new Set([
    "accounts",
    "accounts_mode",
    "seed",
    "runs",
    "bail",
    "regr",
    "fail_on_unchecked",
    "dial",
  ]);
  const unknownKeys = Object.keys(obj).filter((k) => !knownKeys.has(k));

  return { config, unknownKeys };
};

/**
 * Resolves accounts by merging config accounts with simnet accounts.
 * @param simnetAccounts The accounts from the simnet (Devnet.toml).
 * @param configAccounts The custom accounts from the config file.
 * @param mode The merge mode: "overwrite" (default) or "concatenate".
 * @returns An object with the resolved eligible accounts map and all addresses.
 */
export const resolveAccounts = (
  simnetAccounts: Map<string, string>,
  configAccounts: ConfigAccount[] | undefined,
  mode: AccountsMode = "overwrite",
): { eligibleAccounts: Map<string, string>; allAddresses: string[] } => {
  if (!configAccounts || configAccounts.length === 0) {
    // No custom accounts — use simnet accounts, filtering out "faucet".
    const eligibleAccounts = new Map(
      [...simnetAccounts].filter(([key]) => key !== "faucet"),
    );
    return {
      eligibleAccounts,
      allAddresses: [...simnetAccounts.values()],
    };
  }

  const configAccountsMap = new Map(
    configAccounts.map((acc) => [acc.name, acc.address]),
  );

  if (mode === "overwrite") {
    // Replace all simnet accounts with config accounts.
    return {
      eligibleAccounts: new Map(configAccountsMap),
      allAddresses: [...configAccountsMap.values()],
    };
  }

  // Concatenate: start with simnet accounts (filtering out "faucet"),
  // then add/override with config accounts.
  const merged = new Map(
    [...simnetAccounts].filter(([key]) => key !== "faucet"),
  );

  for (const [name, address] of configAccountsMap) {
    merged.set(name, address);
  }

  // All addresses includes simnet addresses excluding faucet plus any new
  // user-provided config addresses.
  const allAddresses = [...merged.values()];

  return { eligibleAccounts: merged, allAddresses };
};
