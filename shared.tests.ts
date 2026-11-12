import { rmSync } from "node:fs";
import { join, resolve } from "node:path";

import { initSimnet } from "@stacks/clarinet-sdk";
import fc from "fast-check";

import {
  getContractNameFromContractId,
  getFunctionsFromContractInterfaces,
  getFunctionsListForContract,
  getSimnetDeployerContractsInterfaces,
  matchesPattern,
} from "./shared";
import { createIsolatedTestEnvironment } from "./test.utils";

const isolatedTestEnvPrefix = "rendezvous-test-shared-";

describe("Simnet contracts operations", () => {
  it("retrieves the contracts from the simnet", async () => {
    // Setup
    const tempDir = createIsolatedTestEnvironment(
      resolve(__dirname, "example"),
      isolatedTestEnvPrefix,
    );
    const manifestPath = join(tempDir, "Clarinet.toml");
    const simnet = await initSimnet(manifestPath);
    const expectedDeployerContracts = new Map(
      [...simnet.getContractsInterfaces()].filter(
        ([key]) => key.split(".")[0] === simnet.deployer,
      ),
    );

    // Exercise
    const actualDeployerContracts =
      getSimnetDeployerContractsInterfaces(simnet);

    // Verify
    expect(actualDeployerContracts).toEqual(expectedDeployerContracts);

    // Teardown
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("retrieves the contract functions from the simnet", async () => {
    // Setup
    const tempDir = createIsolatedTestEnvironment(
      resolve(__dirname, "example"),
      isolatedTestEnvPrefix,
    );
    const manifestPath = join(tempDir, "Clarinet.toml");
    const simnet = await initSimnet(manifestPath);
    const sutContractsInterfaces = getSimnetDeployerContractsInterfaces(simnet);
    const sutContractsList = [...sutContractsInterfaces.keys()];
    const allFunctionsMap = new Map(
      Array.from(sutContractsInterfaces, ([contractId, contractInterface]) => [
        contractId,
        contractInterface.functions,
      ]),
    );
    const expectedContractFunctionsList = sutContractsList.map(
      (contractId) => allFunctionsMap.get(contractId) || [],
    );

    // Exercise
    const actualContractFunctionsList = sutContractsList.map((contractId) =>
      getFunctionsListForContract(allFunctionsMap, contractId),
    );

    // Verify
    expect(actualContractFunctionsList).toEqual(expectedContractFunctionsList);

    // Teardown
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("extracts the functions from the contract interfaces", async () => {
    // Setup
    const tempDir = createIsolatedTestEnvironment(
      resolve(__dirname, "example"),
      isolatedTestEnvPrefix,
    );
    const manifestPath = join(tempDir, "Clarinet.toml");
    const simnet = await initSimnet(manifestPath);
    const sutContractsInterfaces = getSimnetDeployerContractsInterfaces(simnet);
    const expectedAllFunctionsMap = new Map(
      Array.from(sutContractsInterfaces, ([contractId, contractInterface]) => [
        contractId,
        contractInterface.functions,
      ]),
    );

    // Exercise
    const actualAllFunctionsMap = getFunctionsFromContractInterfaces(
      sutContractsInterfaces,
    );

    // Verify
    expect(actualAllFunctionsMap).toEqual(expectedAllFunctionsMap);

    // Teardown
    rmSync(tempDir, { recursive: true, force: true });
  });
});

describe("Contract identifier parsing", () => {
  it("gets correct contract name from contract identifier", () => {
    const addressCharset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const contractNameCharset =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    fc.assert(
      // Arrange
      fc.property(
        fc.string({ unit: fc.constantFrom(...addressCharset) }),
        fc.string({ unit: fc.constantFrom(...contractNameCharset) }),
        (address, contractName) => {
          const contractId = `${address}.${contractName}`;

          // Act
          const actual = getContractNameFromContractId(contractId);

          // Assert
          expect(actual).toBe(contractName);
        },
      ),
    );
  });
});

describe("Function name patterns", () => {
  it("quickly rejects patterns with many stars", () => {
    expect(
      matchesPattern(
        "invariant-last-shipment-id-gt-0-after-create-shipment",
        "invariant-**********absent",
      ),
    ).toBe(false);
  });

  it.each([
    ["", "", true],
    ["test", "", false],
    ["", "*", true],
    ["", "?", false],
    ["test-\\", "test-\\", true],
    ["test-", "test-\\", false],
    ["abbbc", "*bc", true],
    ["abbbd", "*bc", false],
    ["😀", "?", true],
    ["a\nb", "a*b", true],
    ["a\n", "a", false],
    ["test-foo", "test-foo*", true],
    ["test-foobar", "test-foo*", true],
    ["test-foo", "test-?oo", true],
    ["test-boo", "test-?oo", true],
    ["test-fooo", "test-?oo", false],
    // Patterns match the complete function name.
    ["test-foo", "test-fo", false],
    ["other-test-foo", "test-foo*", false],
    // Regex metacharacters are ordinary literal characters.
    ["test-a.b", "test-a.b", true],
    ["test-axb", "test-a.b", false],
    ["test-a+b", "test-a+b", true],
    ["test-(a)[b]{c}|^$\\", "test-(a)[b]{c}|^$\\", true],
    // Pattern escaping is separate from shell quoting.
    ["test-valid?", "test-valid\\?", true],
    ["test-validx", "test-valid\\?", false],
    ["test-valid?extra", "test-valid\\?", false],
    ["test-valid*", "test-valid\\*", true],
    ["test-valid", "test-valid\\*", false],
    ["test-validx", "test-valid\\*", false],
    ["test-valid*extra", "test-valid\\*", false],
    ["test-\\?", "test-\\\\\\?", true],
    ["test-\\x", "test-\\\\\\?", false],
    ["test-\\x", "test-\\\\?", true],
    ["test-x", "test-\\\\?", false],
    ["test-a.b", "test-a\\.b", true],
    ["test-axb", "test-a\\.b", false],
  ])("matches %s against %s: %s", (name, pattern, expected) => {
    expect(matchesPattern(name, pattern)).toBe(expected);
  });
});
