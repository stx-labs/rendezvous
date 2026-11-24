import { rmSync } from "node:fs";
import { join, resolve } from "node:path";

import { initSimnet } from "@stacks/clarinet-sdk";
import {
  Cl,
  cvToString,
  type ClarityValue,
  type ListCV,
  type TupleCV,
} from "@stacks/transactions";
import fc from "fast-check";

import {
  functionToArbitrary,
  getContractNameFromContractId,
  getFunctionsFromContractInterfaces,
  getFunctionsListForContract,
  getSimnetDeployerContractsInterfaces,
} from "./shared";
import type {
  EnrichedContractInterfaceFunction,
  EnrichedParameterType,
} from "./shared.types";
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

describe("Argument generation", () => {
  const addresses = [
    "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
    "ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5",
    "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG",
  ];
  const traitIdentifier = { issuer: [1], name: "traits" };
  const ftTrait = { name: "ft-trait", contract_identifier: traitIdentifier };
  const traitImplementations = {
    [`${addresses[0]}.token-a`]: [ftTrait],
    [`${addresses[0]}.token-b`]: [ftTrait],
    [`${addresses[0]}.other`]: [
      { name: "nft-trait", contract_identifier: traitIdentifier },
    ],
  };

  const arbitrariesFor = (...types: EnrichedParameterType[]) =>
    functionToArbitrary(
      {
        name: "f",
        access: "public",
        outputs: { type: "bool" },
        args: types.map((type, i) => ({ name: `arg${i}`, type })),
      } as EnrichedContractInterfaceFunction,
      addresses,
      traitImplementations,
    );

  const sampleAsStrings = (types: EnrichedParameterType[]) =>
    fc
      .sample(fc.tuple(...arbitrariesFor(...types)), { seed: 42, numRuns: 4 })
      .map((args) => args.map((cv) => cvToString(cv)));

  it.each<[EnrichedParameterType, ClarityValue]>([
    ["bool", Cl.some(Cl.bool(false))],
    ["uint128", Cl.some(Cl.uint(0))],
    [{ "string-ascii": { length: 3 } }, Cl.some(Cl.stringAscii(""))],
    [{ buffer: { length: 3 } }, Cl.some(Cl.bufferFromHex(""))],
    [{ optional: "bool" }, Cl.some(Cl.none())],
  ])("generates (some <falsy>) for optional %j", (inner, expected) => {
    const [arbitrary] = arbitrariesFor({ optional: inner });
    const generated = fc.sample(arbitrary, { seed: 1, numRuns: 2000 });

    expect(generated).toContainEqual(expected);
    expect(generated).toContainEqual(Cl.none());
  });

  it("generates a distinct object for each none", () => {
    const [arbitrary] = arbitrariesFor({
      list: { type: { optional: "bool" }, length: 8 },
    });
    const nones = fc
      .sample(arbitrary, { seed: 1, numRuns: 200 })
      .flatMap((cv) => (cv as ListCV).value)
      .filter((cv) => cv.type === "none");

    expect(nones.length).toBeGreaterThan(1);
    expect(new Set(nones).size).toBe(nones.length);
  });

  it("generates tuples with a regular prototype", () => {
    const [arbitrary] = arbitrariesFor({
      tuple: [{ name: "a", type: "bool" }],
    });
    const generated = fc.sample(arbitrary, { seed: 1, numRuns: 200 });

    generated.forEach((cv) => {
      expect(Object.getPrototypeOf((cv as TupleCV).value)).toBe(
        Object.prototype,
      );
    });
  });

  // These literals were generated before the argument arbitraries mapped
  // straight to Clarity values. If this test fails, seeds saved in
  // `.rendezvous-regressions` now replay to different arguments: call that
  // out as a user-visible change instead of refreshing the values.
  it.each<[string, EnrichedParameterType[], string[][]]>([
    [
      "tuples, responses and integers",
      [
        {
          tuple: [
            { name: "a", type: "bool" },
            { name: "b", type: "int128" },
          ],
        },
        {
          response: { ok: "uint128", error: { "string-ascii": { length: 3 } } },
        },
        "uint128",
      ],
      [
        ["(tuple (a false) (b -2))", "(ok u15541234)", "u1077723492"],
        ["(tuple (a true) (b 2147483646))", "(ok u23)", "u1605711835"],
        ["(tuple (a true) (b -11))", '(err "A")', "u21"],
        ["(tuple (a false) (b 2147483626))", '(err "Q")', "u30"],
      ],
    ],
    [
      "lists, buffers, utf8 strings, principals and trait references",
      [
        { list: { type: { buffer: { length: 2 } }, length: 3 } },
        { "string-utf8": { length: 4 } },
        "principal",
        {
          trait_reference: {
            name: "token",
            import: { Imported: ftTrait },
          },
        },
      ],
      [
        ["(list )", 'u"LZy"', addresses[0], `${addresses[0]}.token-b`],
        ["(list 0x 0x98)", 'u"$"', addresses[2], `${addresses[0]}.token-b`],
        ["(list )", 'u""', addresses[1], `${addresses[0]}.token-b`],
        ["(list )", 'u""', addresses[1], `${addresses[0]}.token-a`],
      ],
    ],
  ])("generates the same %s for a fixed seed", (_, types, expected) => {
    expect(sampleAsStrings(types)).toEqual(expected);
  });

  // Unlike the literals above, these were generated after falsy optionals
  // became reachable: before that, every `(some false)` and `(some "")` below
  // came out as `none`. They guard later changes the same way.
  it("generates the same optionals for a fixed seed", () => {
    expect(
      sampleAsStrings([
        { optional: "bool" },
        { optional: { "string-ascii": { length: 2 } } },
        { list: { type: { optional: "uint128" }, length: 3 } },
      ]),
    ).toEqual([
      ["(some false)", '(some "")', "(list none (some u8))"],
      ["(some false)", '(some "d")', "(list )"],
      [
        "(some false)",
        "none",
        "(list (some u2047405135) (some u21) (some u10))",
      ],
      ["none", "none", "(list (some u1789811753))"],
    ]);
  });
});
