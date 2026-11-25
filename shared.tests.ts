import { rmSync } from "node:fs";
import { join, resolve } from "node:path";

import { initSimnet } from "@stacks/clarinet-sdk";
import {
  Cl,
  cvToString,
  type ClarityValue,
  type IntCV,
  type ListCV,
  type StringUtf8CV,
  type TupleCV,
  type UIntCV,
} from "@stacks/transactions";
import fc from "fast-check";

import {
  escapeNonPrintable,
  functionToArbitrary,
  getContractNameFromContractId,
  getFunctionsFromContractInterfaces,
  getFunctionsListForContract,
  getSimnetDeployerContractsInterfaces,
  printCV,
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

  it("escapes combining marks that follow an escaped character", () => {
    // `Cl.stringify` writes these controls as `\n`, `\t`, `\r`, `\u0000` and
    // `\u001b`, whose last character must not pass for a base character.
    expect(
      printCV(
        Cl.stringUtf8("\n\u0301\t\u0301\r\u0301\u0000\u0301\u001b\u0301"),
      ),
    ).toBe(
      'u"\\n\\u{301}\\t\\u{301}\\r\\u{301}\\u0000\\u{301}\\u001b\\u{301}"',
    );
    expect(printCV(Cl.stringUtf8('"\u0301\\\u0301'))).toBe(
      'u"\\"\\u{301}\\\\\\u{301}"',
    );
    // A literal backslash followed by a letter is not an escape: the mark
    // sits on a real "n", and on the "5" that follows an escape.
    expect(printCV(Cl.stringUtf8("\\n\u0301"))).toBe('u"\\\\n\u0301"');
    expect(printCV(Cl.stringUtf8("\u001b5\u0301"))).toBe('u"\\u001b5\u0301"');
  });

  it("escapes the same text once, however often it is applied", () => {
    const once = printCV(
      Cl.stringUtf8("\n\u0301a\u0301\u200b\u0302\u{1d457}\u0080"),
    );
    expect(escapeNonPrintable(once)).toBe(once);
    // A short `\u{...}` escape ends at its brace, so the "a" after it is still
    // the base character of the mark the second time around.
    const freeText = escapeNonPrintable("\u0001a\u0301");
    expect(freeText).toBe("\\u{1}a\u0301");
    expect(escapeNonPrintable(freeText)).toBe(freeText);
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

  // If this test fails, seeds saved in `.rendezvous-regressions` now replay to
  // different arguments: call that out as a user-visible change instead of
  // refreshing the values.
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
        [
          "(tuple (a false) (b 0))",
          '(err "D")',
          "u13641652189140706672729554620",
        ],
        ["(tuple (a true) (b 897290250392))", '(err "")', "u2"],
        ["(tuple (a true) (b 8212944151))", '(err "dD")', "u1754597997475220"],
        ["(tuple (a false) (b 28078450097696348))", '(err "*Dm")', "u0"],
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
        ["(list )", 'u"6\u{1d457}y"', addresses[2], `${addresses[0]}.token-b`],
        [
          "(list 0x 0x98)",
          'u"\u000b"',
          addresses[2],
          `${addresses[0]}.token-b`,
        ],
        ["(list )", 'u""', addresses[1], `${addresses[0]}.token-b`],
        ["(list )", 'u""', addresses[1], `${addresses[0]}.token-a`],
      ],
    ],
  ])("generates the same %s for a fixed seed", (_, types, expected) => {
    expect(sampleAsStrings(types)).toEqual(expected);
  });

  // These guard later changes the same way. Before falsy optionals became
  // reachable, every `(some false)` and `(some "")` below came out as `none`.
  it("generates the same optionals for a fixed seed", () => {
    expect(
      sampleAsStrings([
        { optional: "bool" },
        { optional: { "string-ascii": { length: 2 } } },
        { list: { type: { optional: "uint128" }, length: 3 } },
      ]),
    ).toEqual([
      [
        "(some false)",
        '(some "")',
        "(list none (some u310922615578646204618026418))",
      ],
      ["(some false)", '(some "d")', "(list )"],
      [
        "(some false)",
        "none",
        "(list (some u4979923678649101874735882) (some u0) (some u1754597997475220))",
      ],
      ["none", "none", "(list (some u3087404689929566227400337680436445532))"],
    ]);
  });

  const pow2 = (n: number) => BigInt(2) ** BigInt(n);

  it.each([
    ["int128", -pow2(127), pow2(127) - BigInt(1)] as const,
    ["uint128", BigInt(0), pow2(128) - BigInt(1)] as const,
  ])("generates %s values across the full Clarity range", (type, min, max) => {
    const [arbitrary] = arbitrariesFor(type);
    const values = fc
      .sample(arbitrary, 2_000)
      .map((cv) => BigInt((cv as IntCV | UIntCV).value));
    const beyond64Bits = pow2(64);

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
      [pow2(10), pow2(20)],
      [pow2(20), pow2(32)],
      [pow2(32), pow2(48)],
      [pow2(48), pow2(64)],
      [pow2(64), pow2(100)],
      [pow2(100), pow2(127)],
    ]) {
      expect(
        magnitudes.filter((m) => m >= low && m < high).length,
      ).toBeGreaterThan(50);
    }
    // Most values fit in 64 bits, where realistic amounts live.
    expect(magnitudes.filter((m) => m < beyond64Bits).length).toBeGreaterThan(
      1_200,
    );
  });

  it.each([
    ["int128", "-6", (v: bigint) => v >= BigInt(-5), Cl.int(-6)] as const,
    ["int128", "1001", (v: bigint) => v <= BigInt(1000), Cl.int(1001)] as const,
    [
      "uint128",
      "u1000",
      (v: bigint) => v < BigInt(1000),
      Cl.uint(1000),
    ] as const,
  ])(
    "shrinks a failing %s to the smallest counterexample, %s",
    (type, _, holds, smallest) => {
      const [arbitrary] = arbitrariesFor(type);
      // Covers failures first found on an exact bound, 1 value in 20.
      for (let seed = 0; seed < 200; seed++) {
        const details = fc.check(
          fc.property(arbitrary, (cv) =>
            holds(BigInt((cv as IntCV | UIntCV).value)),
          ),
          { seed },
        );
        expect(details.failed).toBe(true);
        expect(details.counterexample).toEqual([smallest]);
      }
    },
  );

  it.each([
    ["any non-empty string", (v: string) => v.length === 0, "A"] as const,
    ["three code points", (v: string) => [...v].length < 3, "AAA"] as const,
  ])(
    "shrinks a failing string-utf8 to printable ASCII, %s",
    (_, holds, smallest) => {
      const [arbitrary] = arbitrariesFor({ "string-utf8": { length: 20 } });
      // Covers strings first drawn from each of the three code point sources.
      for (let seed = 0; seed < 100; seed++) {
        const details = fc.check(
          fc.property(arbitrary, (cv) => holds((cv as StringUtf8CV).value)),
          { seed },
        );
        expect(details.failed).toBe(true);
        expect(details.counterexample).toEqual([Cl.stringUtf8(smallest)]);
      }
    },
  );

  it("generates single ASCII, BMP and astral code points for string-utf8", () => {
    const [arbitrary] = arbitrariesFor({ "string-utf8": { length: 1 } });
    const values = fc
      .sample(arbitrary, 1_000)
      .map((cv) => (cv as StringUtf8CV).value);
    const codePoints = values.flatMap((v) =>
      [...v].map((c) => c.codePointAt(0)!),
    );
    // A high or low surrogate that is not part of a valid pair.
    const loneSurrogate =
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

    for (const value of values) {
      expect([...value].length).toBeLessThanOrEqual(1);
      expect(value).not.toMatch(loneSurrogate);
    }
    expect(codePoints.some((cp) => cp < 0x80)).toBe(true);
    expect(codePoints.some((cp) => cp >= 0x80 && cp < 0x10000)).toBe(true);
    expect(codePoints.some((cp) => cp >= 0x10000)).toBe(true);
  });
});
