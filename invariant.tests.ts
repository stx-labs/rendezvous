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
  it("executes the pre-dialers from the very first SUT call", async () => {
    // Setup
    const tempDir = createIsolatedTestEnvironment(
      resolve(__dirname, "example"),
      isolatedTestEnvPrefix,
    );
    const simnet = await initSimnet(join(tempDir, "Clarinet.toml"));

    const preDialer = vi.fn();
    vi.stubGlobal("__rvPreDialer", preDialer);
    const dialPath = join(tempDir, "record-calls-dialer.mjs");
    writeFileSync(
      dialPath,
      "export const preRecordCall = () => globalThis.__rvPreDialer();\n",
    );
    const callPublicFn = vi.spyOn(simnet, "callPublicFn");

    const contractsInterfaces = getSimnetDeployerContractsInterfaces(simnet);
    const rendezvousList = [...contractsInterfaces.keys()].filter(
      (contractId) => getContractNameFromContractId(contractId) === "counter",
    );
    const { eligibleAccounts, allAddresses } = resolveAccounts(
      simnet.getAccounts(),
      undefined,
    );

    // Exercise
    await checkInvariants(
      simnet,
      async () => {}, // resetSession
      rendezvousList,
      getFunctionsFromContractInterfaces(contractsInterfaces),
      0, // seed
      1, // runs
      dialPath,
      true, // bail
      false, // regr
      new EventEmitter(),
      eligibleAccounts,
      allAddresses,
    );

    // Verify

    // No SUT call ran without its pre-dialer. The first check keeps the count
    // comparison from passing trivially at zero.
    expect(callPublicFn).toHaveBeenCalled();
    expect(preDialer).toHaveBeenCalledTimes(callPublicFn.mock.calls.length);

    // Teardown
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    rmSync(tempDir, { recursive: true, force: true });
  });
});
