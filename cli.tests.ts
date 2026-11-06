import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseCli } from "./cli";

describe("CLI parsing with parseCli", () => {
  it("returns undefined when --help is passed", () => {
    expect(parseCli(["--help"])).toBeUndefined();
  });

  it("throws when no arguments are provided", () => {
    expect(() => parseCli([])).toThrow("No path to Clarinet project provided.");
  });

  it("throws when only manifest path is provided", () => {
    expect(() => parseCli(["./example"])).toThrow(
      "No target contract name provided.",
    );
  });

  it("throws when type is invalid", () => {
    expect(() => parseCli(["./example", "counter", "invalid"])).toThrow(
      "Invalid type provided.",
    );
  });

  it("returns a valid RunConfig with all CLI options", () => {
    const config = parseCli([
      "./example",
      "counter",
      "invariant",
      "--seed=42",
      "--runs=200",
      "--bail",
      "--regr",
      "--dial=./dialers.cjs",
    ])!;

    expect(config.manifestDir).toBe("./example");
    expect(config.sutContractName).toBe("counter");
    expect(config.type).toBe("invariant");
    expect(config.seed).toBe(42);
    expect(config.runs).toBe(200);
    expect(config.bail).toBe(true);
    expect(config.regr).toBe(true);
    expect(config.dial).toBe("./dialers.cjs");
  });

  it("parses --fail-on-unchecked and defaults it to false", () => {
    expect(
      parseCli(["./example", "slice", "test", "--fail-on-unchecked"])!
        .failOnUnchecked,
    ).toBe(true);
    expect(parseCli(["./example", "slice", "test"])!.failOnUnchecked).toBe(
      false,
    );
  });

  it("reads fail_on_unchecked from the config file", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "rendezvous-test-fail-on-unchecked-"),
    );
    const configPath = join(tempDir, "rv.config.json");
    writeFileSync(
      configPath,
      JSON.stringify({ fail_on_unchecked: true }),
      "utf-8",
    );
    try {
      const config = parseCli([
        "./example",
        "slice",
        "test",
        `--config=${configPath}`,
      ])!;
      expect(config.failOnUnchecked).toBe(true);
      const ignored = parseCli([
        "./example",
        "slice",
        "test",
        `--config=${configPath}`,
        "--fail-on-unchecked",
      ])!;
      expect(ignored.warnings.join("\n")).toContain("--fail-on-unchecked");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("keeps coverage disabled by default", () => {
    const config = parseCli(["./example", "counter", "test"])!;
    expect(config.coverage).toBe(false);
    expect(config.coverageJson).toBeUndefined();
    expect(config.coverageLcov).toBeUndefined();
  });

  it("accepts opt-in coverage and its output paths", () => {
    const config = parseCli([
      "./example",
      "counter",
      "test",
      "--coverage",
      "--coverage-json=curve.json",
      "--coverage-lcov=coverage.lcov",
    ])!;
    expect(config.coverage).toBe(true);
    expect(config.coverageJson).toBe("curve.json");
    expect(config.coverageLcov).toBe("coverage.lcov");
  });

  it("requires explicit opt-in for coverage output paths", () => {
    expect(() =>
      parseCli(["./example", "counter", "test", "--coverage-json=curve.json"]),
    ).toThrow("Coverage outputs require --coverage.");
    expect(() =>
      parseCli([
        "./example",
        "counter",
        "test",
        "--coverage",
        "--coverage-json=",
      ]),
    ).toThrow('"coverage-json" must be a non-empty string.');
  });

  it("takes coverage only from the config when --config is provided", () => {
    const dir = mkdtempSync(join(tmpdir(), "rendezvous-test-coverage-cli-"));
    const configPath = join(dir, "rv.config.json");
    try {
      writeFileSync(configPath, JSON.stringify({ coverage: false }));
      const config = parseCli([
        "./example",
        "counter",
        "test",
        `--config=${configPath}`,
        "--coverage",
        "--coverage-json=ignored.json",
      ])!;
      expect(config.coverage).toBe(false);
      expect(config.coverageJson).toBeUndefined();
      expect(config.warnings[0]).toContain("--coverage, --coverage-json");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("normalizes type to lowercase", () => {
    const config = parseCli(["./example", "counter", "InVaRiAnT"])!;
    expect(config.type).toBe("invariant");
  });

  it("uses config file values exclusively when --config is provided, ignoring CLI flags", () => {
    // Arrange
    const tempDir = mkdtempSync(join(tmpdir(), "rendezvous-test-parsecli-"));
    onTestFinished(() => rmSync(tempDir, { recursive: true, force: true }));
    const configPath = join(tempDir, "rv.config.json");
    writeFileSync(
      configPath,
      JSON.stringify({ seed: 100, runs: 500, bail: true }),
      "utf-8",
    );

    // Act — CLI also passes --seed=999 and --runs=10, but config wins.
    const config = parseCli([
      "./example",
      "counter",
      "test",
      `--config=${configPath}`,
      "--seed=999",
      "--runs=10",
    ])!;

    // Assert — only config values are used.
    expect(config.seed).toBe(100);
    expect(config.runs).toBe(500);
    expect(config.bail).toBe(true);
  });

  it("uses CLI flags exclusively when --config is not provided", () => {
    const config = parseCli([
      "./example",
      "counter",
      "test",
      "--seed=42",
      "--runs=200",
      "--bail",
    ])!;

    expect(config.seed).toBe(42);
    expect(config.runs).toBe(200);
    expect(config.bail).toBe(true);
    expect(config.accounts).toBeUndefined();
  });

  it("loads accounts from config file", () => {
    // Arrange
    const tempDir = mkdtempSync(
      join(tmpdir(), "rendezvous-test-parsecli-accounts-"),
    );
    onTestFinished(() => rmSync(tempDir, { recursive: true, force: true }));
    const configPath = join(tempDir, "rv.config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        accounts: [
          {
            name: "whale_1",
            address: "SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE",
          },
        ],
        accounts_mode: "overwrite",
      }),
      "utf-8",
    );

    // Act
    const config = parseCli([
      "./example",
      "counter",
      "test",
      `--config=${configPath}`,
    ])!;

    // Assert
    expect(config.accounts).toEqual([
      {
        name: "whale_1",
        address: "SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE",
      },
    ]);
    expect(config.accountsMode).toBe("overwrite");
  });

  it("throws when config file does not exist", () => {
    expect(() =>
      parseCli([
        "./example",
        "counter",
        "test",
        "--config=/tmp/nonexistent-rv-test.json",
      ]),
    ).toThrow("Config file not found:");
  });

  it("throws when --seed is not an integer", () => {
    expect(() =>
      parseCli(["./example", "counter", "test", "--seed=abc"]),
    ).toThrow(`"seed" must be an integer.`);
  });

  it("throws when --runs is not a positive integer", () => {
    expect(() =>
      parseCli(["./example", "counter", "test", "--runs=0"]),
    ).toThrow(`"runs" must be a positive integer.`);
  });

  it("throws when --runs is not a number", () => {
    expect(() =>
      parseCli(["./example", "counter", "test", "--runs=abc"]),
    ).toThrow(`"runs" must be a positive integer.`);
  });

  it("defaults accountsMode to overwrite when not specified", () => {
    const config = parseCli(["./example", "counter", "test"])!;
    expect(config.accountsMode).toBe("overwrite");
  });

  it("warns when CLI flags are used alongside --config", () => {
    // Arrange
    const tempDir = mkdtempSync(
      join(tmpdir(), "rendezvous-test-parsecli-warn-flags-"),
    );
    onTestFinished(() => rmSync(tempDir, { recursive: true, force: true }));
    const configPath = join(tempDir, "rv.config.json");
    writeFileSync(configPath, JSON.stringify({ seed: 1 }), "utf-8");

    // Act
    const config = parseCli([
      "./example",
      "counter",
      "test",
      `--config=${configPath}`,
      "--seed=999",
      "--bail",
    ])!;

    // Assert
    expect(config.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("--seed"),
        expect.stringContaining("--bail"),
      ]),
    );
  });

  it("warns when config file contains unrecognized keys", () => {
    // Arrange
    const tempDir = mkdtempSync(
      join(tmpdir(), "rendezvous-test-parsecli-warn-keys-"),
    );
    onTestFinished(() => rmSync(tempDir, { recursive: true, force: true }));
    const configPath = join(tempDir, "rv.config.json");
    writeFileSync(
      configPath,
      JSON.stringify({ sedd: 42, bail: true }),
      "utf-8",
    );

    // Act
    const config = parseCli([
      "./example",
      "counter",
      "test",
      `--config=${configPath}`,
    ])!;

    // Assert
    expect(config.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("sedd")]),
    );
  });

  it("returns no warnings for valid CLI-only usage", () => {
    const config = parseCli(["./example", "counter", "test", "--seed=42"])!;
    expect(config.warnings).toEqual([]);
  });
});
