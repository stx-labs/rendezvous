import { rmSync } from "node:fs";
import { join, resolve } from "node:path";

import { initSimnet } from "@stacks/clarinet-sdk";
import {
  Cl,
  ClarityType,
  type ClarityValue,
  type ListCV,
} from "@stacks/transactions";
import fc from "fast-check";

import { getContractFunction, strategyFor } from "./lib";
import {
  escapeNonPrintable,
  functionToArbitrary,
  getContractNameFromContractId,
  getFunctionsFromContractInterfaces,
  getFunctionsListForContract,
  getSimnetDeployerContractsInterfaces,
  INT128_MAX,
  INT128_MIN,
  printCV,
  UINT128_MAX,
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

/**
 * Builds the fast-check arbitrary for a single argument of the given type.
 */
const arbitraryFor = (type: EnrichedParameterType): fc.Arbitrary<any> =>
  functionToArbitrary(
    {
      name: "f",
      access: "public",
      args: [{ name: "x", type }],
      outputs: { type: "bool" },
    } as unknown as EnrichedContractInterfaceFunction,
    [],
    {},
  )[0];

/** Matches a high or low surrogate that is not part of a valid pair. */
const loneSurrogate =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

describe("Argument generation", () => {
  it.each([
    ["int128", INT128_MIN, INT128_MAX] as const,
    ["uint128", BigInt(0), UINT128_MAX] as const,
  ])("generates %s values across the full Clarity range", (type, min, max) => {
    const values: bigint[] = fc.sample(arbitraryFor(type), 2_000);
    const beyond64Bits = BigInt(2) ** BigInt(64);

    expect(values.every((v) => v >= min && v <= max)).toBe(true);
    expect(values).toContain(min);
    expect(values).toContain(max);
    expect(values.some((v) => v !== max && v > beyond64Bits)).toBe(true);
    if (min < 0) {
      expect(values.some((v) => v !== min && v < -beyond64Bits)).toBe(true);
    }
    // Still biased toward small values.
    expect(
      values.filter((v) => v >= -1000 && v <= 1000).length,
    ).toBeGreaterThan(100);
    // Every magnitude in between is covered, not only the two extremes.
    const magnitudes = values.map((v) => (v < 0 ? -v : v));
    for (const [low, high] of [
      [10, 20],
      [20, 32],
      [32, 48],
      [48, 64],
      [64, 100],
      [100, 127],
    ]) {
      expect(
        magnitudes.filter(
          (m) => m >= BigInt(2) ** BigInt(low) && m < BigInt(2) ** BigInt(high),
        ).length,
      ).toBeGreaterThan(50);
    }
  });

  it.each([
    ["int128", (v: bigint) => v >= BigInt(-5), BigInt(-6)] as const,
    ["int128", (v: bigint) => v <= BigInt(1000), BigInt(1001)] as const,
    ["uint128", (v: bigint) => v < BigInt(1000), BigInt(1000)] as const,
  ])(
    "shrinks a failing %s to the smallest counterexample",
    (type, holds, smallest) => {
      // Covers failures first found on an exact bound, 1 value in 20.
      for (let seed = 0; seed < 200; seed++) {
        const details = fc.check(fc.property(arbitraryFor(type), holds), {
          seed,
        });
        expect(details.failed).toBe(true);
        expect(details.counterexample).toEqual([smallest]);
      }
    },
  );

  it("generates single ASCII, BMP and astral code points for string-utf8", () => {
    const values = fc.sample(
      arbitraryFor({ "string-utf8": { length: 1 } }),
      1_000,
    ) as string[];
    const codePoints = values.flatMap((v) =>
      [...v].map((c) => c.codePointAt(0)!),
    );

    for (const value of values) {
      expect([...value].length).toBeLessThanOrEqual(1);
      expect(value).not.toMatch(loneSurrogate);
    }
    expect(codePoints.some((cp) => cp < 0x80)).toBe(true);
    expect(codePoints.some((cp) => cp >= 0x80 && cp < 0x10000)).toBe(true);
    expect(codePoints.some((cp) => cp >= 0x10000)).toBe(true);
  });

  it("produces arguments the simnet accepts unchanged", async () => {
    // Setup
    const tempDir = createIsolatedTestEnvironment(
      resolve(__dirname, "example"),
      isolatedTestEnvPrefix,
    );
    const simnet = await initSimnet(join(tempDir, "Clarinet.toml"));
    const reversed = ([arg]: ClarityValue[]) =>
      arg.type === ClarityType.StringUTF8
        ? Cl.stringUtf8([...arg.value].reverse().join(""))
        : Cl.list([...(arg as ListCV).value].reverse());

    // Exercise & Verify: these functions return their input reversed, so any
    // value the simnet altered or rejected surfaces as a mismatch or a throw.
    for (const fnName of ["reverse", "reverse-uint", "reverse-string"]) {
      const fn = getContractFunction(simnet, "reverse", fnName);
      fc.assert(
        fc.property(strategyFor(simnet, fn), (args) => {
          const { result } = simnet.callReadOnlyFn(
            "reverse",
            fnName,
            args,
            simnet.deployer,
          );
          expect(result).toEqual(reversed(args));
        }),
        { numRuns: 100 },
      );
    }

    // Teardown
    rmSync(tempDir, { recursive: true, force: true });
  });
});

describe("Clarity value printing", () => {
  it("escapes code points Cl.stringify leaves raw with \\u{...}", () => {
    expect(printCV(Cl.stringUtf8("\u0080\u007f\u200b\u2028"))).toBe(
      'u"\\u{80}\\u{7f}\\u{200b}\\u{2028}"',
    );
    expect(printCV(Cl.list([Cl.stringUtf8("\u{f0000}")]))).toBe(
      '(list u"\\u{f0000}")',
    );
  });

  it("keeps Cl.stringify escaping for newlines and C0 controls", () => {
    expect(printCV(Cl.stringUtf8("a\nb\u001b[31m\u0000"))).toBe(
      'u"a\\nb\\u001b[31m\\u0000"',
    );
  });

  it("leaves printable values unchanged", () => {
    expect(printCV(Cl.stringUtf8("héllo 中文 🛋"))).toBe('u"héllo 中文 🛋"');
    // A combining mark on a base character, here a decomposed "é".
    expect(printCV(Cl.stringUtf8("he\u0301llo"))).toBe('u"he\u0301llo"');
  });

  it("escapes combining marks that have no base character", () => {
    expect(printCV(Cl.stringUtf8("\u0301a\u0301 \u0301"))).toBe(
      'u"\\u{301}a\u0301 \\u{301}"',
    );
    // A mark after an escaped code point would render on the escape itself.
    expect(printCV(Cl.stringUtf8("a\u200b\u0301\u0302"))).toBe(
      'u"a\\u{200b}\\u{301}\\u{302}"',
    );
  });

  it("escapes non-ASCII spaces, ignorable and unassigned code points", () => {
    expect(printCV(Cl.stringUtf8("a b\u00a0\u3000"))).toBe(
      'u"a b\\u{a0}\\u{3000}"',
    );
    expect(printCV(Cl.stringUtf8("\u2764\ufe0f\u3164"))).toBe(
      'u"\u2764\\u{fe0f}\\u{3164}"',
    );
    expect(printCV(Cl.stringUtf8("\u0378\uffff"))).toBe('u"\\u{378}\\u{ffff}"');
  });

  it("escapes raw control characters in free text but keeps newlines", () => {
    expect(escapeNonPrintable('u"\u001b[31m\r"\nnext\u0080')).toBe(
      'u"\\u{1b}[31m\\u{d}"\nnext\\u{80}',
    );
  });
});
