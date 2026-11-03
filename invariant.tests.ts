import { EventEmitter } from "node:events";
import { rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { initSimnet } from "@stacks/clarinet-sdk";
import { Cl } from "@stacks/transactions";

import { resolveAccounts } from "./config";
import {
  checkInvariants,
  initializeClarityContext,
  initializeLocalContext,
} from "./invariant";
import {
  getContractNameFromContractId,
  getFunctionsFromContractInterfaces,
  getSimnetDeployerContractsInterfaces,
} from "./shared";
import { createIsolatedTestEnvironment } from "./test.utils";

const isolatedTestEnvPrefix = "rendezvous-test-invariant-";

describe("Simnet contracts operations", () => {
  it("correctly initializes the local context for a given contract and functions", async () => {
    // Setup
    const tempDir = createIsolatedTestEnvironment(
      resolve(__dirname, "example"),
      isolatedTestEnvPrefix,
    );
    const manifestPath = join(tempDir, "Clarinet.toml");
    const simnet = await initSimnet(manifestPath);
    const sutContractsInterfaces = getSimnetDeployerContractsInterfaces(simnet);
    const sutContractsAllFunctions = getFunctionsFromContractInterfaces(
      sutContractsInterfaces,
    );

    // Pick the first contract for testing.
    const [contractId, functions] = [...sutContractsAllFunctions.entries()][0];

    const expectedInitialContext = {
      [contractId]: Object.fromEntries(functions.map((f) => [f.name, 0])),
    };

    // Exercise
    const actualInitialContext = initializeLocalContext(contractId, functions);

    // Verify
    expect(actualInitialContext).toEqual(expectedInitialContext);

    // Teardown
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("correctly initializes the Clarity context", async () => {
    // Setup
    const tempDir = createIsolatedTestEnvironment(
      resolve(__dirname, "example"),
      isolatedTestEnvPrefix,
    );
    const simnet = await initSimnet(join(tempDir, "Clarinet.toml"));

    const rendezvousList = [
      ...getSimnetDeployerContractsInterfaces(simnet).keys(),
    ].filter((deployedContract) =>
      ["counter"].includes(getContractNameFromContractId(deployedContract)),
    );

    const rendezvousAllFunctions = getFunctionsFromContractInterfaces(
      new Map(
        [...getSimnetDeployerContractsInterfaces(simnet)].filter(
          ([contractId]) => rendezvousList.includes(contractId),
        ),
      ),
    );

    // Pick the first contract for testing.
    const [contractId, functions] = [...rendezvousAllFunctions.entries()][0];

    // Exercise
    initializeClarityContext(simnet, contractId, functions);

    const actualContext = functions.map((f) => {
      const actualValue = simnet.getMapEntry(
        contractId,
        "context",
        Cl.stringAscii(f.name),
      );
      return {
        contractId,
        functionName: f.name,
        called: actualValue,
      };
    });

    // Verify

    // The JS representation of Clarity `(some (tuple (called uint)))`, where
    // `called` is initialized to 0.
    const expectedClarityValue = Cl.some(Cl.tuple({ called: Cl.uint(0) }));
    const expectedContext = functions.map((f) => ({
      contractId,
      functionName: f.name,
      called: expectedClarityValue,
    }));

    expect(actualContext).toEqual(expectedContext);

    // Teardown
    rmSync(tempDir, { recursive: true, force: true });
  });
});

describe("Custom dialers", () => {
  it("executes the pre-dialers from the very first run", async () => {
    // Setup
    const tempDir = createIsolatedTestEnvironment(
      resolve(__dirname, "example"),
      isolatedTestEnvPrefix,
    );
    const simnet = await initSimnet(join(tempDir, "Clarinet.toml"));

    // The dialer module is loaded through a dynamic import in the same
    // process, so it can report its calls through a global counter.
    const dialPath = join(tempDir, "record-calls-dialer.mjs");
    writeFileSync(
      dialPath,
      "export async function preRecordCall() {\n" +
        "  globalThis.__rvPreDialerCalls += 1;\n" +
        "}\n",
    );
    const globals = globalThis as typeof globalThis & {
      __rvPreDialerCalls?: number;
    };
    globals.__rvPreDialerCalls = 0;

    const rendezvousList = [
      ...getSimnetDeployerContractsInterfaces(simnet).keys(),
    ].filter(
      (deployedContract) =>
        getContractNameFromContractId(deployedContract) === "counter",
    );
    const rendezvousAllFunctions = getFunctionsFromContractInterfaces(
      new Map(
        [...getSimnetDeployerContractsInterfaces(simnet)].filter(
          ([contractId]) => rendezvousList.includes(contractId),
        ),
      ),
    );
    const { eligibleAccounts, allAddresses } = resolveAccounts(
      simnet.getAccounts(),
      undefined,
    );

    // Exercise

    // A single run selects at least one SUT function, so the pre-dialer must
    // have fired at least once by the time the run completes.
    await checkInvariants(
      simnet,
      async () => {},
      rendezvousList,
      rendezvousAllFunctions,
      0,
      1,
      dialPath,
      true,
      false,
      new EventEmitter(),
      eligibleAccounts,
      allAddresses,
    );

    // Verify
    expect(globals.__rvPreDialerCalls).toBeGreaterThan(0);

    // Teardown
    delete globals.__rvPreDialerCalls;
    rmSync(tempDir, { recursive: true, force: true });
  });
});
