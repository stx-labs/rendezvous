import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { loadConfig, resolveAccounts, type ConfigAccount } from "./config";

const temporaryTestBaseDir = resolve(tmpdir(), "rendezvous-test-config");

const createTempConfigFile = (dirName: string, content: string): string => {
  const dir = join(temporaryTestBaseDir, dirName);
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, "rv.config.json");
  writeFileSync(filePath, content, "utf-8");
  return filePath;
};

afterAll(() => {
  rmSync(temporaryTestBaseDir, { recursive: true, force: true });
});

describe("Config loading and validation", () => {
  it("throws when the config file does not exist", () => {
    // Arrange
    const nonExistentPath = "/tmp/nonexistent-rv-config.json";

    // Act & Assert
    expect(() => loadConfig(nonExistentPath)).toThrow("Config file not found:");
  });

  it("throws when the config file contains invalid JSON", () => {
    // Arrange
    const filePath = createTempConfigFile("invalid-json", "not json {{{");

    // Act & Assert
    expect(() => loadConfig(filePath)).toThrow(
      "Failed to parse config file as JSON:",
    );
  });

  it("throws when the config file is not a JSON object", () => {
    // Arrange
    const filePath = createTempConfigFile("array-root", "[1, 2, 3]");

    // Act & Assert
    expect(() => loadConfig(filePath)).toThrow(
      "Config file must contain a JSON object.",
    );
  });

  it("returns an empty config for an empty JSON object", () => {
    // Arrange
    const filePath = createTempConfigFile("empty-object", "{}");

    // Act
    const { config } = loadConfig(filePath);

    // Assert
    expect(config).toEqual({});
  });

  it("parses a valid config with all fields", () => {
    // Arrange
    const content = JSON.stringify({
      accounts: [
        {
          name: "whale_1",
          address: "SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE",
        },
      ],
      accounts_mode: "overwrite",
      seed: 42,
      runs: 500,
      bail: true,
      regr: false,
      dial: "./dialers.cjs",
    });
    const filePath = createTempConfigFile("all-fields", content);

    // Act
    const { config, unknownKeys } = loadConfig(filePath);

    // Assert
    expect(config.accounts).toEqual([
      { name: "whale_1", address: "SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE" },
    ]);
    expect(config.accounts_mode).toBe("overwrite");
    expect(config.seed).toBe(42);
    expect(config.runs).toBe(500);
    expect(config.bail).toBe(true);
    expect(config.regr).toBe(false);
    expect(config.dial).toBe("./dialers.cjs");
    expect(unknownKeys).toEqual([]);
  });

  it("reports unrecognized keys", () => {
    // Arrange
    const filePath = createTempConfigFile(
      "unknown-keys",
      JSON.stringify({ sedd: 42, rans: 100, seed: 1 }),
    );

    // Act
    const { config, unknownKeys } = loadConfig(filePath);

    // Assert
    expect(unknownKeys).toEqual(["sedd", "rans"]);
    expect(config.seed).toBe(1);
  });

  it("throws when accounts is not an array", () => {
    // Arrange
    const filePath = createTempConfigFile(
      "accounts-not-array",
      JSON.stringify({ accounts: "not-an-array" }),
    );

    // Act & Assert
    expect(() => loadConfig(filePath)).toThrow(`"accounts" must be an array.`);
  });

  it("throws when an account entry is missing the name field", () => {
    // Arrange
    const filePath = createTempConfigFile(
      "account-no-name",
      JSON.stringify({
        accounts: [{ address: "SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE" }],
      }),
    );

    // Act & Assert
    expect(() => loadConfig(filePath)).toThrow(
      `"accounts[0].name" must be a non-empty string.`,
    );
  });

  it("throws when an account entry is missing the address field", () => {
    // Arrange
    const filePath = createTempConfigFile(
      "account-no-address",
      JSON.stringify({ accounts: [{ name: "whale_1" }] }),
    );

    // Act & Assert
    expect(() => loadConfig(filePath)).toThrow(
      `"accounts[0].address" must be a non-empty string.`,
    );
  });

  it("throws when accounts_mode is invalid", () => {
    // Arrange
    const filePath = createTempConfigFile(
      "invalid-mode",
      JSON.stringify({ accounts_mode: "merge" }),
    );

    // Act & Assert
    expect(() => loadConfig(filePath)).toThrow(
      `"accounts_mode" must be "concatenate" or "overwrite".`,
    );
  });

  it("throws when seed is not an integer", () => {
    // Arrange
    const filePath = createTempConfigFile(
      "seed-float",
      JSON.stringify({ seed: 1.5 }),
    );

    // Act & Assert
    expect(() => loadConfig(filePath)).toThrow(`"seed" must be an integer.`);
  });

  it("throws when runs is not a positive integer", () => {
    // Arrange
    const filePath = createTempConfigFile(
      "runs-zero",
      JSON.stringify({ runs: 0 }),
    );

    // Act & Assert
    expect(() => loadConfig(filePath)).toThrow(
      `"runs" must be a positive integer.`,
    );
  });

  it("throws when bail is not a boolean", () => {
    // Arrange
    const filePath = createTempConfigFile(
      "bail-string",
      JSON.stringify({ bail: "yes" }),
    );

    // Act & Assert
    expect(() => loadConfig(filePath)).toThrow(`"bail" must be a boolean.`);
  });

  it("loads fail_on_unchecked and rejects non-boolean values", () => {
    const valid = loadConfig(
      createTempConfigFile(
        "fail-on-unchecked",
        JSON.stringify({ fail_on_unchecked: true }),
      ),
    );
    expect(valid.config.fail_on_unchecked).toBe(true);
    expect(valid.unknownKeys).toEqual([]);

    expect(() =>
      loadConfig(
        createTempConfigFile(
          "fail-on-unchecked-string",
          JSON.stringify({ fail_on_unchecked: "yes" }),
        ),
      ),
    ).toThrow(`"fail_on_unchecked" must be a boolean.`);
  });
});

describe("Account resolution", () => {
  const simnetAccounts = new Map([
    ["deployer", "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM"],
    ["wallet_1", "ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5"],
    ["faucet", "STNHKEPYEPJ8ET55ZZ0M5A34J0R3N5FM2CMMMAZ6"],
  ]);

  it("filters out faucet when no config accounts are provided", () => {
    // Arrange & Act
    const { eligibleAccounts, allAddresses } = resolveAccounts(
      simnetAccounts,
      undefined,
    );

    // Assert
    expect(eligibleAccounts.has("faucet")).toBe(false);
    expect(eligibleAccounts.has("deployer")).toBe(true);
    expect(eligibleAccounts.has("wallet_1")).toBe(true);
    expect(allAddresses).toContain("STNHKEPYEPJ8ET55ZZ0M5A34J0R3N5FM2CMMMAZ6");
  });

  it("overwrites simnet accounts with config accounts by default", () => {
    // Arrange
    const configAccounts: ConfigAccount[] = [
      { name: "whale_1", address: "SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE" },
    ];

    // Act
    const { eligibleAccounts, allAddresses } = resolveAccounts(
      simnetAccounts,
      configAccounts,
    );

    // Assert
    expect(eligibleAccounts.size).toBe(1);
    expect(eligibleAccounts.has("whale_1")).toBe(true);
    expect(eligibleAccounts.has("deployer")).toBe(false);
    expect(allAddresses).toEqual(["SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE"]);
  });

  it("overwrites simnet accounts when mode is overwrite", () => {
    // Arrange
    const configAccounts: ConfigAccount[] = [
      { name: "whale_1", address: "SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE" },
    ];

    // Act
    const { eligibleAccounts, allAddresses } = resolveAccounts(
      simnetAccounts,
      configAccounts,
      "overwrite",
    );

    // Assert
    expect(eligibleAccounts.size).toBe(1);
    expect(eligibleAccounts.has("whale_1")).toBe(true);
    expect(eligibleAccounts.has("deployer")).toBe(false);
    expect(allAddresses).toEqual(["SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE"]);
  });

  it("config accounts override simnet accounts with the same name when concatenating", () => {
    // Arrange
    const configAccounts: ConfigAccount[] = [
      {
        name: "wallet_1",
        address: "SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7",
      },
    ];

    // Act
    const { eligibleAccounts } = resolveAccounts(
      simnetAccounts,
      configAccounts,
      "concatenate",
    );

    // Assert
    expect(eligibleAccounts.get("wallet_1")).toBe(
      "SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7",
    );
  });

  it("returns simnet accounts unchanged when config accounts list is empty", () => {
    // Arrange & Act
    const { eligibleAccounts } = resolveAccounts(simnetAccounts, []);

    // Assert
    expect(eligibleAccounts.has("deployer")).toBe(true);
    expect(eligibleAccounts.has("wallet_1")).toBe(true);
    expect(eligibleAccounts.has("faucet")).toBe(false);
    expect(eligibleAccounts.size).toBe(2);
  });
});
