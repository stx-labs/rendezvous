import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import fc from "fast-check";

import type { RunDetails } from "./heatstroke.types";
import {
  getFailureFilePath,
  loadFailures,
  persistFailure,
} from "./persistence";

const temporaryTestBaseDir = resolve(tmpdir(), "rendezvous-test-persistence");

const TEST_CONTRACT_ID = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.counter";

const fileNameRegex = /^[a-zA-Z0-9_-]+$/;

const createTemporaryCustomTestBaseDir = (dirName: string) => {
  const path = join(temporaryTestBaseDir, dirName);
  mkdirSync(path, { recursive: true });
  return path;
};

// Mock RunDetails helper
const createMockRunDetails = (
  seed: number,
  failed = true,
  numRuns = 100,
): RunDetails => ({
  failed,
  seed,
  numRuns,
  counterexample: [],
});

afterAll(() => {
  rmSync(temporaryTestBaseDir, { recursive: true, force: true });
});

describe("Failure Persistence", () => {
  describe("Failure file path", () => {
    it("returns the correct absolute file path with default base directory", () => {
      // Arrange & Act
      const filePath = getFailureFilePath(TEST_CONTRACT_ID);

      // Assert
      expect(filePath).toBe(
        resolve(".rendezvous-regressions", `${TEST_CONTRACT_ID}.json`),
      );
    });

    it("returns the correct absolute file path with any given custom base directory", () => {
      fc.assert(
        fc.property(
          // Arrange
          fc.record({ customBaseDir: fc.string() }),
          ({ customBaseDir }) => {
            // Act
            const filePath = getFailureFilePath(
              TEST_CONTRACT_ID,
              customBaseDir,
            );

            // Assert
            expect(filePath).toBe(
              resolve(customBaseDir, `${TEST_CONTRACT_ID}.json`),
            );
          },
        ),
      );
    });
  });

  describe("Persisting Failures", () => {
    it("persisting a failure correctly creates the regression file", () => {
      fc.assert(
        fc.property(
          fc.record({
            customBaseDirName: fc.stringMatching(fileNameRegex),
            seed: fc.integer(),
            type: fc.constantFrom("invariant", "test"),
          }),
          ({ customBaseDirName, seed, type }) => {
            // Setup
            const runDetails = createMockRunDetails(seed);
            const customBaseDir =
              createTemporaryCustomTestBaseDir(customBaseDirName);

            // Exercise
            persistFailure(runDetails, type, TEST_CONTRACT_ID, undefined, {
              baseDir: customBaseDir,
            });

            // Verify
            expect(
              statSync(getFailureFilePath(TEST_CONTRACT_ID, customBaseDir)),
            ).toBeDefined();

            // Teardown
            rmSync(customBaseDir, {
              recursive: true,
              force: true,
            });
          },
        ),
      );
    });

    it("persisting failures correctly groups them by test type", () => {
      fc.assert(
        fc.property(
          fc.record({
            customBaseDirName: fc.stringMatching(fileNameRegex),
            seed1: fc.integer(),
            seed2: fc.integer(),
          }),
          ({ customBaseDirName, seed1, seed2 }) => {
            // Setup
            const runDetails1 = createMockRunDetails(seed1);
            const runDetails2 = createMockRunDetails(seed2);
            const customBaseDir =
              createTemporaryCustomTestBaseDir(customBaseDirName);

            // Exercise
            persistFailure(
              runDetails1,
              "invariant",
              TEST_CONTRACT_ID,
              undefined,
              {
                baseDir: customBaseDir,
              },
            );
            persistFailure(runDetails2, "test", TEST_CONTRACT_ID, undefined, {
              baseDir: customBaseDir,
            });

            // Verify
            const invariantFailures = loadFailures(
              TEST_CONTRACT_ID,
              "invariant",
              {
                baseDir: customBaseDir,
              },
            );
            const testFailures = loadFailures(TEST_CONTRACT_ID, "test", {
              baseDir: customBaseDir,
            });
            expect(invariantFailures).toHaveLength(1);
            expect(invariantFailures[0].seed).toBe(seed1);
            expect(testFailures).toHaveLength(1);
            expect(testFailures[0].seed).toBe(seed2);

            // Teardown
            rmSync(customBaseDir, {
              recursive: true,
              force: true,
            });
          },
        ),
      );
    });

    it("persisting failures does not duplicate the same seed within a type", () => {
      fc.assert(
        fc.property(
          fc.record({
            customBaseDirName: fc.stringMatching(fileNameRegex),
            seed: fc.integer(),
            type: fc.constantFrom("invariant", "test"),
          }),
          ({ customBaseDirName, seed, type }) => {
            // Setup
            const runDetails = createMockRunDetails(seed);
            const customBaseDir =
              createTemporaryCustomTestBaseDir(customBaseDirName);

            // Exercise
            persistFailure(runDetails, type, TEST_CONTRACT_ID, undefined, {
              baseDir: customBaseDir,
            });
            persistFailure(runDetails, type, TEST_CONTRACT_ID, undefined, {
              baseDir: customBaseDir,
            });

            // Verify
            const failures = loadFailures(TEST_CONTRACT_ID, type, {
              baseDir: customBaseDir,
            });
            expect(failures).toHaveLength(1);
            expect(failures[0].seed).toBe(seed);

            // Teardown
            rmSync(customBaseDir, {
              recursive: true,
              force: true,
            });
          },
        ),
      );
    });

    it("persisting failures correctly allows same seed for different types", () => {
      fc.assert(
        fc.property(
          fc.record({
            customBaseDirName: fc.stringMatching(fileNameRegex),
            seed: fc.integer(),
          }),
          ({ customBaseDirName, seed }) => {
            // Setup
            const runDetails = createMockRunDetails(seed);
            const customBaseDir =
              createTemporaryCustomTestBaseDir(customBaseDirName);

            // Exercise
            persistFailure(
              runDetails,
              "invariant",
              TEST_CONTRACT_ID,
              undefined,
              {
                baseDir: customBaseDir,
              },
            );
            persistFailure(runDetails, "test", TEST_CONTRACT_ID, undefined, {
              baseDir: customBaseDir,
            });

            // Verify
            const invariantFailures = loadFailures(
              TEST_CONTRACT_ID,
              "invariant",
              {
                baseDir: customBaseDir,
              },
            );
            const testFailures = loadFailures(TEST_CONTRACT_ID, "test", {
              baseDir: customBaseDir,
            });
            expect(invariantFailures).toHaveLength(1);
            expect(invariantFailures[0].seed).toBe(seed);
            expect(testFailures).toHaveLength(1);
            expect(testFailures[0].seed).toBe(seed);

            // Teardown
            rmSync(customBaseDir, {
              recursive: true,
              force: true,
            });
          },
        ),
      );
    });

    it("persisting failures correctly saves multiple failures of same type", () => {
      fc.assert(
        fc.property(
          fc.record({
            customBaseDirName: fc.stringMatching(fileNameRegex),
            // Generate between 2 and 5 seeds. If there are duplicates, only
            // the unique seeds should be persisted.
            seeds: fc.array(fc.integer(), { minLength: 2, maxLength: 5 }),
          }),
          ({ customBaseDirName, seeds }) => {
            // Setup
            // Extract the unique seeds from the array.
            const uniqueSeeds = [...new Set(seeds)];

            const customBaseDir =
              createTemporaryCustomTestBaseDir(customBaseDirName);

            // Exercise
            seeds.forEach((seed) => {
              persistFailure(
                createMockRunDetails(seed),
                "invariant",
                TEST_CONTRACT_ID,
                undefined,
                { baseDir: customBaseDir },
              );
            });

            // Verify
            const failures = loadFailures(TEST_CONTRACT_ID, "invariant", {
              baseDir: customBaseDir,
            });
            expect(failures).toHaveLength(uniqueSeeds.length);
            uniqueSeeds.forEach((seed) => {
              expect(failures.map((f) => f.seed)).toContain(seed);
            });

            // Teardown
            rmSync(customBaseDir, { recursive: true, force: true });
          },
        ),
      );
    });

    it("always includes valid timestamp in failure record", () => {
      fc.assert(
        fc.property(
          fc.record({
            customBaseDirName: fc.stringMatching(fileNameRegex),
            seed: fc.integer(),
          }),
          ({ customBaseDirName, seed }) => {
            // Setup
            const before = Date.now();
            const runDetails = createMockRunDetails(seed);
            const customBaseDir =
              createTemporaryCustomTestBaseDir(customBaseDirName);

            // Exercise
            persistFailure(
              runDetails,
              "invariant",
              TEST_CONTRACT_ID,
              undefined,
              {
                baseDir: customBaseDir,
              },
            );

            const after = Date.now();

            // Verify
            const failures = loadFailures(TEST_CONTRACT_ID, "invariant", {
              baseDir: customBaseDir,
            });
            expect(failures[0].timestamp).toBeGreaterThanOrEqual(before);
            expect(failures[0].timestamp).toBeLessThanOrEqual(after);

            // Teardown
            rmSync(customBaseDir, { recursive: true, force: true });
          },
        ),
      );
    });

    it("includes the number of runs in the failure record", () => {
      fc.assert(
        fc.property(
          fc.record({
            customBaseDirName: fc.stringMatching(fileNameRegex),
            seed: fc.integer(),
            numRuns: fc.integer(),
          }),
          ({ customBaseDirName, seed, numRuns }) => {
            // Setup
            const runDetails = createMockRunDetails(seed, true, numRuns);
            const customBaseDir =
              createTemporaryCustomTestBaseDir(customBaseDirName);

            // Exercise
            persistFailure(
              runDetails,
              "invariant",
              TEST_CONTRACT_ID,
              undefined,
              {
                baseDir: customBaseDir,
              },
            );

            // Verify
            const failures = loadFailures(TEST_CONTRACT_ID, "invariant", {
              baseDir: customBaseDir,
            });
            expect(failures[0].numRuns).toBe(numRuns);

            // Teardown
            rmSync(customBaseDir, { recursive: true, force: true });
          },
        ),
      );
    });

    it("includes the dial path in the failure record", () => {
      fc.assert(
        fc.property(
          fc.record({
            customBaseDirName: fc.stringMatching(fileNameRegex),
            seed: fc.integer(),
            dial: fc.string(),
          }),
          ({ customBaseDirName, seed, dial }) => {
            // Setup
            const runDetails = createMockRunDetails(seed);
            const customBaseDir =
              createTemporaryCustomTestBaseDir(customBaseDirName);

            // Exercise
            persistFailure(runDetails, "invariant", TEST_CONTRACT_ID, dial, {
              baseDir: customBaseDir,
            });

            // Verify
            const failures = loadFailures(TEST_CONTRACT_ID, "invariant", {
              baseDir: customBaseDir,
            });
            expect(failures[0].dial).toBe(dial);

            // Teardown
            rmSync(customBaseDir, { recursive: true, force: true });
          },
        ),
      );
    });

    it("persists paths and reads records from older files", () => {
      const customBaseDir = createTemporaryCustomTestBaseDir("paths");
      const options = { baseDir: customBaseDir };

      try {
        persistFailure(
          {
            ...createMockRunDetails(1),
            counterexamplePath: "0:1",
            path: "legacy",
          },
          "test",
          TEST_CONTRACT_ID,
          undefined,
          options,
        );
        persistFailure(
          { ...createMockRunDetails(2), path: "legacy" },
          "test",
          TEST_CONTRACT_ID,
          undefined,
          options,
        );

        const failures = loadFailures(TEST_CONTRACT_ID, "test", options);
        expect(
          failures.find(({ seed }) => seed === 1)?.counterexamplePath,
        ).toBe("0:1");
        expect(
          failures.find(({ seed }) => seed === 2)?.counterexamplePath,
        ).toBe("legacy");

        const record = { seed: 17, numRuns: 20, timestamp: 123 };
        writeFileSync(
          getFailureFilePath(TEST_CONTRACT_ID, customBaseDir),
          JSON.stringify({ invariant: [record], test: [] }),
        );
        expect(loadFailures(TEST_CONTRACT_ID, "invariant", options)).toEqual([
          record,
        ]);
      } finally {
        rmSync(customBaseDir, { recursive: true, force: true });
      }
    });
  });

  describe("Loading Failures", () => {
    it("returns empty array when no failures exist", () => {
      fc.assert(
        fc.property(
          fc.record({
            customBaseDirName: fc.stringMatching(fileNameRegex),
          }),
          ({ customBaseDirName }) => {
            // Setup
            const customBaseDir =
              createTemporaryCustomTestBaseDir(customBaseDirName);

            // Exercise
            const failures = loadFailures(TEST_CONTRACT_ID, "invariant", {
              baseDir: customBaseDir,
            });

            // Verify
            expect(failures).toEqual([]);

            // Teardown
            rmSync(customBaseDir, { recursive: true, force: true });
          },
        ),
      );
    });

    it("returns empty array for type with no failures", () => {
      fc.assert(
        fc.property(
          fc.record({
            customBaseDirName: fc.stringMatching(fileNameRegex),
            seed: fc.integer(),
          }),
          ({ customBaseDirName, seed }) => {
            // Setup
            const customBaseDir =
              createTemporaryCustomTestBaseDir(customBaseDirName);
            persistFailure(
              createMockRunDetails(seed),
              "test",
              TEST_CONTRACT_ID,
              undefined,
              {
                baseDir: customBaseDir,
              },
            );

            // Exercise
            const failures = loadFailures(TEST_CONTRACT_ID, "invariant", {
              baseDir: customBaseDir,
            });

            // Verify
            expect(failures).toEqual([]);

            // Teardown
            rmSync(customBaseDir, { recursive: true, force: true });
          },
        ),
      );
    });
  });
});
