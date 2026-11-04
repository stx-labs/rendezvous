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
  argsToCV,
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
    // 2^32, beyond what the former 32-bit generators could produce.
    const beyond32Bits = BigInt(2) ** BigInt(32);

    expect(values.every((v) => typeof v === "bigint")).toBe(true);
    expect(values.every((v) => v >= min && v <= max)).toBe(true);
    expect(values.some((v) => v > beyond32Bits)).toBe(true);
    if (min < 0) {
      expect(values.some((v) => v < -beyond32Bits)).toBe(true);
    }
    expect(values).toContain(min);
    expect(values).toContain(max);
    // Still biased toward small values.
    expect(
      values.filter((v) => v >= -1000 && v <= 1000).length,
    ).toBeGreaterThan(100);
  });

  it.each([0, 1, 10, 127])(
    "generates string-utf8 values of at most %i code points",
    (length) => {
      for (const value of fc.sample(
        arbitraryFor({ "string-utf8": { length } }),
        500,
      ) as string[]) {
        expect([...value].length).toBeLessThanOrEqual(length);
        expect(value).not.toMatch(loneSurrogate);
      }
    },
  );

  it("generates ASCII, BMP and astral code points in string-utf8 values", () => {
    const codePoints = (
      fc.sample(
        arbitraryFor({ "string-utf8": { length: 10 } }),
        1_000,
      ) as string[]
    ).flatMap((v) => [...v].map((c) => c.codePointAt(0)!));

    expect(codePoints.some((cp) => cp < 0x80)).toBe(true);
    expect(codePoints.some((cp) => cp >= 0x80 && cp < 0x10000)).toBe(true);
    expect(codePoints.some((cp) => cp >= 0x10000)).toBe(true);
  });

  it("keeps string-ascii values printable ASCII", () => {
    fc.assert(
      fc.property(
        arbitraryFor({ "string-ascii": { length: 50 } }),
        (value: string) => {
          expect(value.length).toBeLessThanOrEqual(50);
          expect(value).toMatch(/^[\x20-\x7e]*$/);
        },
      ),
    );
  });

  it("converts generated values to Clarity values unchanged", () => {
    const fn = {
      name: "f",
      access: "public",
      args: [
        { name: "i", type: "int128" },
        { name: "u", type: "uint128" },
        { name: "s", type: { "string-utf8": { length: 20 } } },
      ],
      outputs: { type: "bool" },
    } as unknown as EnrichedContractInterfaceFunction;

    fc.assert(
      fc.property(fc.tuple(...functionToArbitrary(fn, [], {})), (raw) => {
        expect(argsToCV(fn, raw)).toEqual([
          Cl.int(raw[0]),
          Cl.uint(raw[1]),
          Cl.stringUtf8(raw[2]),
        ]);
      }),
    );
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
    expect(printCV(Cl.stringUtf8("\u0080"))).toBe('u"\\u{80}"');
    expect(printCV(Cl.stringUtf8("\u007f\u200b\u2028"))).toBe(
      'u"\\u{7f}\\u{200b}\\u{2028}"',
    );
    expect(printCV(Cl.list([Cl.stringUtf8("\u{f0000}")]))).toBe(
      '(list u"\\u{f0000}")',
    );
  });

  it("keeps Cl.stringify escaping for C0 controls, quotes and backslashes", () => {
    expect(printCV(Cl.stringUtf8("a\nb\u001b[31m\u0000"))).toBe(
      'u"a\\nb\\u001b[31m\\u0000"',
    );
    expect(printCV(Cl.stringAscii('a"b\\c'))).toBe('"a\\"b\\\\c"');
  });

  it("leaves printable values unchanged", () => {
    expect(printCV(Cl.stringUtf8("héllo 中文 🛋"))).toBe('u"héllo 中文 🛋"');
    expect(printCV(Cl.int(INT128_MIN))).toBe(INT128_MIN.toString());
    expect(printCV(Cl.uint(UINT128_MAX))).toBe(`u${UINT128_MAX}`);
  });

  it("escapes raw control characters in free text but keeps newlines", () => {
    expect(escapeNonPrintable('u"\u001b[31m\r"\nnext\u0080')).toBe(
      'u"\\u{1b}[31m\\u{d}"\nnext\\u{80}',
    );
  });
});
