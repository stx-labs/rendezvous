import type { Simnet } from "@stacks/clarinet-sdk";
import type {
  ContractInterfaceFunction,
  IContractInterface,
} from "@stacks/clarinet-sdk-wasm";
import { Cl, type ClarityValue } from "@stacks/transactions";
import fc from "fast-check";

import type {
  EnrichedContractInterfaceFunction,
  EnrichedParameterType,
} from "./shared.types";
import { getContractIdsImplementingTrait } from "./traits";
import type { ImplementedTraitType, ImportedTraitType } from "./traits.types";

/** 79 characters long divider for logging. */
export const LOG_DIVIDER =
  "-------------------------------------------------------------------------------";

/**
 * Retrieves the contract interfaces of the contracts deployed by the deployer
 * account from the simnet instance.
 * @param simnet The simnet instance.
 * @returns The contract IDs mapped to their interfaces.
 */
export const getSimnetDeployerContractsInterfaces = (
  simnet: Simnet,
): Map<string, IContractInterface> =>
  new Map(
    [...simnet.getContractsInterfaces()].filter(
      ([key]) => key.split(".")[0] === simnet.deployer,
    ),
  );

/**
 * Retrieves the function interfaces from the contract interfaces. Filters out
 * other contract interface data such as data maps, variables, and constants.
 * @param contractInterfaces The smart contract interfaces map.
 * @returns The contract IDs mapped to their function interfaces.
 */
export const getFunctionsFromContractInterfaces = (
  contractInterfaces: Map<string, IContractInterface>,
): Map<string, ContractInterfaceFunction[]> =>
  new Map(
    Array.from(contractInterfaces, ([contractId, contractInterface]) => [
      contractId,
      contractInterface.functions,
    ]),
  );

export const getFunctionsListForContract = (
  functionsMap: Map<string, EnrichedContractInterfaceFunction[]>,
  contractId: string,
) => functionsMap.get(contractId) || [];

/** Dynamically generates fast-check arbitraries for a given function
 * interface.
 * @param functionInterface The "enriched" function interface.
 * @param addresses The array of addresses to use for principal types.
 * @param projectTraitImplementations The contract IDs mapped to the traits
 * they implement.
 * @returns Array of fast-check arbitraries.
 */
export const functionToArbitrary = (
  functionInterface: EnrichedContractInterfaceFunction,
  addresses: string[],
  projectTraitImplementations: Record<string, ImplementedTraitType[]>,
): fc.Arbitrary<ClarityValue>[] =>
  functionInterface.args.map((arg) =>
    parameterTypeToArbitrary(
      arg.type as EnrichedParameterType,
      addresses,
      projectTraitImplementations,
    ),
  );

/**
 * Generates a fast-check arbitrary for a given parameter type.
 * @param type The "enriched" parameter type.
 * @param addresses The array of addresses to use for principal types.
 * @param projectTraitImplementations The contract IDs mapped to the traits
 * they implement.
 * @returns Fast-check arbitrary.
 */
const parameterTypeToArbitrary = (
  type: EnrichedParameterType,
  addresses: string[],
  projectTraitImplementations: Record<string, ImplementedTraitType[]>,
): fc.Arbitrary<ClarityValue> => {
  if (typeof type === "string") {
    // The type is a base type.
    if (type === "principal") {
      if (addresses.length === 0) {
        throw new Error(
          "No addresses could be retrieved from the simnet instance!",
        );
      }
      return baseTypesToArbitrary.principal(addresses);
    } else {
      return baseTypesToArbitrary[type];
    }
  } else {
    // The type is a complex type.
    if ("buffer" in type) {
      return complexTypesToArbitrary["buffer"](type.buffer.length);
    } else if ("string-ascii" in type) {
      return complexTypesToArbitrary["string-ascii"](
        type["string-ascii"].length,
      );
    } else if ("string-utf8" in type) {
      return complexTypesToArbitrary["string-utf8"](type["string-utf8"].length);
    } else if ("list" in type) {
      return complexTypesToArbitrary["list"](
        type.list.type,
        type.list.length,
        addresses,
        projectTraitImplementations,
      );
    } else if ("tuple" in type) {
      return complexTypesToArbitrary["tuple"](
        type.tuple,
        addresses,
        projectTraitImplementations,
      );
    } else if ("optional" in type) {
      return complexTypesToArbitrary["optional"](
        type.optional,
        addresses,
        projectTraitImplementations,
      );
    } else if ("response" in type) {
      return complexTypesToArbitrary.response(
        type.response.ok,
        type.response.error,
        addresses,
        projectTraitImplementations,
      );
    } else if ("trait_reference" in type) {
      return complexTypesToArbitrary.trait_reference(
        type.trait_reference,
        projectTraitImplementations,
      );
    } else {
      throw new Error(`Unsupported complex type: ${JSON.stringify(type)}`);
    }
  }
};

// `BigInt(...)` rather than `n` literals: the compile target is ES2019.
/** Smallest Clarity `int` value: -2^127. */
const INT128_MIN = -(BigInt(2) ** BigInt(127));
/** Largest Clarity `int` value: 2^127 - 1. */
const INT128_MAX = BigInt(2) ** BigInt(127) - BigInt(1);
/** Largest Clarity `uint` value: 2^128 - 1. */
const UINT128_MAX = BigInt(2) ** BigInt(128) - BigInt(1);

/**
 * A `bigint` in `[0, 2^maxBits - 1]` whose bit width is drawn first, so every
 * magnitude is covered. `fc.bigInt` alone is uniform over the range, which
 * almost never yields a value below 2^100. Half the widths are capped at 64
 * bits, where realistic amounts live (the STX supply in uSTX fits in 51).
 */
const magnitude = (maxBits: number): fc.Arbitrary<bigint> =>
  fc
    .tuple(
      fc.oneof(
        fc.integer({ min: 0, max: 64 }),
        fc.integer({ min: 0, max: maxBits }),
      ),
      fc.noBias(
        fc.bigInt({
          min: BigInt(0),
          max: BigInt(2) ** BigInt(maxBits) - BigInt(1),
        }),
      ),
    )
    .map(([bits, raw]) => raw >> BigInt(maxBits - bits));

/**
 * A `bigint` in `[min, max]` that generates with `source` and shrinks like
 * `fc.bigInt`: on the value itself, toward 0. Shrinking through `source`
 * instead would depend on how the value was drawn, and an exact bound would
 * not shrink at all.
 */
class FullRangeBigIntArbitrary extends fc.Arbitrary<bigint> {
  private readonly source: fc.Arbitrary<bigint>;
  private readonly shrinker: fc.Arbitrary<bigint>;

  constructor(source: fc.Arbitrary<bigint>, min: bigint, max: bigint) {
    super();
    // `source` rarely hits the exact bounds, so they are also drawn directly
    // 1 time in 20.
    this.source = fc.oneof(
      { arbitrary: source, weight: 19 },
      { arbitrary: fc.constantFrom(min, max), weight: 1 },
    );
    this.shrinker = fc.bigInt({ min, max });
  }

  generate(mrng: fc.Random, biasFactor: number | undefined): fc.Value<bigint> {
    // No context: the shrinker then starts from the value alone.
    return new fc.Value(
      this.source.generate(mrng, biasFactor).value,
      undefined,
    );
  }

  canShrinkWithoutContext(value: unknown): value is bigint {
    return this.shrinker.canShrinkWithoutContext(value);
  }

  shrink(value: bigint, context: unknown): fc.Stream<fc.Value<bigint>> {
    return this.shrinker.shrink(value, context);
  }
}

/**
 * Base types to fast-check arbitraries mapping.
 */
const baseTypesToArbitrary = {
  int128: new FullRangeBigIntArbitrary(
    fc
      .tuple(fc.boolean(), magnitude(127))
      .map(([negative, m]) => (negative ? -m - BigInt(1) : m)),
    INT128_MIN,
    INT128_MAX,
  ).map(Cl.int),
  uint128: new FullRangeBigIntArbitrary(
    magnitude(128),
    BigInt(0),
    UINT128_MAX,
  ).map(Cl.uint),
  bool: fc.boolean().map(Cl.bool),
  principal: (addresses: string[]) =>
    fc.constantFrom(...addresses).map(Cl.principal),
};

/**
 * Complex types to fast-check arbitraries mapping.
 */
const complexTypesToArbitrary = {
  // For buffer types, the length must be doubled because they are represented
  // in hex, as `Cl.bufferFromHex` expects. The UInt8Array will have half the
  // length of the corresponding hex string. Stacks.js reference:
  // https://github.com/stx-labs/stacks.js/blob/fd0bf26b5f29fc3c1bf79581d0ad9b89f0d7f15a/packages/common/src/utils.ts#L522
  buffer: (length: number) =>
    hexaString({ maxLength: 2 * length }).map(Cl.bufferFromHex),
  "string-ascii": (length: number) =>
    fc
      .string({
        unit: asciiChar,
        maxLength: length,
      })
      .map(Cl.stringAscii),
  // Clarity measures `string-utf8` length in code points, and each unit is
  // exactly one code point.
  "string-utf8": (length: number) =>
    fc.string({ unit: utf8CodePoint, maxLength: length }).map(Cl.stringUtf8),
  list: (
    type: EnrichedParameterType,
    length: number,
    addresses: string[],
    projectTraitImplementations: Record<string, ImplementedTraitType[]>,
  ) =>
    fc
      .array(
        parameterTypeToArbitrary(type, addresses, projectTraitImplementations),
        {
          maxLength: length,
        },
      )
      .map(Cl.list),
  tuple: (
    items: { name: string; type: EnrichedParameterType }[],
    addresses: string[],
    projectTraitImplementations: Record<string, ImplementedTraitType[]>,
  ) => {
    const tupleArbitraries: Record<string, fc.Arbitrary<ClarityValue>> = {};
    items.forEach((item) => {
      tupleArbitraries[item.name] = parameterTypeToArbitrary(
        item.type,
        addresses,
        projectTraitImplementations,
      );
    });
    // `fc.record` can return a null-prototype object, so copy it into a plain
    // one. Do not use `noNullPrototype: true` instead: it removes a random draw
    // that saved regression seeds depend on.
    return fc.record(tupleArbitraries).map((data) => Cl.tuple({ ...data }));
  },
  optional: (
    type: EnrichedParameterType,
    addresses: string[],
    projectTraitImplementations: Record<string, ImplementedTraitType[]>,
  ) =>
    // Map the `null` sentinel afterwards instead of passing `nil: Cl.none()`:
    // `nil` would hand out one shared object, so a pre-dialer mutating one
    // `none` argument would change every other generated `none`.
    fc
      .option(
        parameterTypeToArbitrary(
          type,
          addresses,
          projectTraitImplementations,
        ).map(Cl.some),
      )
      .map((value) => value ?? Cl.none()),
  response: (
    okType: EnrichedParameterType,
    errType: EnrichedParameterType,
    addresses: string[],
    projectTraitImplementations: Record<string, ImplementedTraitType[]>,
  ) =>
    // Each branch keeps a single-key `fc.record` because `fc.record` draws one
    // boolean per generated record (to pick its prototype), and saved
    // regression seeds depend on that draw.
    fc.oneof(
      fc
        .record({
          value: parameterTypeToArbitrary(
            okType,
            addresses,
            projectTraitImplementations,
          ),
        })
        .map(({ value }) => Cl.ok(value)),
      fc
        .record({
          value: parameterTypeToArbitrary(
            errType,
            addresses,
            projectTraitImplementations,
          ),
        })
        .map(({ value }) => Cl.error(value)),
    ),
  trait_reference: (
    traitData: ImportedTraitType,
    projectTraitImplementations: Record<string, ImplementedTraitType[]>,
  ) =>
    fc
      .constantFrom(
        ...getContractIdsImplementingTrait(
          traitData,
          projectTraitImplementations,
        ),
      )
      .map(Cl.principal),
};

/**
 * Custom hexadecimal string generator. The `hexaString` generator from
 * fast-check has been deprecated. This generator is implemented to match the
 * behavior of the deprecated generator.
 *
 * @param constraints Fast-check string constraints.
 * @returns Fast-check arbitrary for hexadecimal strings.
 *
 * Reference for the proposed replacement of the deprecated `hexaString`
 * generator:
 * https://github.com/dubzzz/fast-check/commit/3f4f1203a8863c07d22b45591bf0de1fac02b948
 */
export const hexaString = (
  constraints: fc.StringConstraints = {},
): fc.Arbitrary<string> => {
  const hexa = (): fc.Arbitrary<string> => {
    const hexCharSet = "0123456789abcdef";
    return fc.integer({ min: 0, max: 15 }).map((n) => hexCharSet[n]);
  };

  return fc.string({ ...constraints, unit: hexa() });
};

/** The character set used for generating ASCII strings.*/
const charSet =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 !\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";

const asciiChar = fc.constantFrom(...charSet);

/**
 * A single code point for `string-utf8`: printable ASCII, printable non-ASCII,
 * or any code point. Never a lone surrogate, which UTF-8 encoding would
 * silently replace with U+FFFD. Cross-shrinking makes printable ASCII the
 * shrink target of all three; without it a failing code point would shrink
 * within its own branch, to U+0000 or to a space.
 */
const utf8CodePoint: fc.Arbitrary<string> = fc.oneof(
  { withCrossShrink: true },
  asciiChar,
  fc.string({ unit: "grapheme-composite", minLength: 1, maxLength: 1 }),
  // Any code point but the surrogates U+D800 to U+DFFF. Not the `binary`
  // string unit: building it indexes every code point, which costs a quarter
  // of a second and 85 MB as soon as this module loads.
  fc
    .integer({ min: 0, max: 0x10ffff - 0x800 })
    .map((i) => String.fromCodePoint(i < 0xd800 ? i : i + 0x800)),
);

/**
 * Code points that are invisible or would corrupt terminal output: controls
 * other than newline (e.g. ESC, CR, C1), format characters (e.g. zero-width
 * space), private-use, unassigned and surrogate code points, separators other
 * than the ASCII space (e.g. no-break space, line separator), and
 * default-ignorable code points (e.g. variation selectors, Hangul fillers).
 */
const invisibleCodePoint =
  /(?![\n ])[\p{C}\p{Z}\p{Default_Ignorable_Code_Point}]/u;

/** A combining mark, which is only legible on top of a base character. */
const combiningMark = /\p{M}/u;

/** A visible character that a following combining mark can attach to. */
const baseCharacter = /[\p{L}\p{N}\p{S}\p{M}]/u;

/**
 * A backslash escape already in the text, or else a single code point. The
 * escapes are the ones `Cl.stringify` writes (`\n`, `\"`, `\\`, `\u001b`) and
 * the `\u{...}` that `escapeNonPrintable` writes.
 */
const escapeOrCodePoint = /\\(?:u\{[0-9a-f]+\}|u[0-9a-f]{4}|[ -~])|[\s\S]/giu;

/**
 * Escapes non-printable code points as `\u{...}`, keeping newlines and ASCII
 * spaces. A combining mark is kept only when it follows a visible base
 * character; otherwise it would render on top of a quote or an escape. That
 * includes the escapes already in `text`, such as the `\n` and `\u001b` that
 * `Cl.stringify` writes: their last character is not a base character.
 * @param text The text to log.
 * @returns The printable text.
 */
export const escapeNonPrintable = (text: string): string => {
  if (!invisibleCodePoint.test(text) && !combiningMark.test(text)) {
    return text;
  }

  let afterBaseCharacter = false;
  return text.replace(escapeOrCodePoint, (token) => {
    if (token.length > 1 && token.startsWith("\\")) {
      afterBaseCharacter = false;
      return token;
    }

    const escaped =
      invisibleCodePoint.test(token) ||
      (combiningMark.test(token) && !afterBaseCharacter);
    afterBaseCharacter = !escaped && baseCharacter.test(token);
    return escaped ? `\\u{${token.codePointAt(0)!.toString(16)}}` : token;
  });
};

/**
 * Formats a Clarity value for logging: `Cl.stringify` (which escapes quotes,
 * backslashes and C0 controls) with any remaining non-printable code points
 * escaped, e.g. `u"\u{80}"`.
 * @param cv The Clarity value.
 * @returns The printable string representation.
 */
export const printCV = (cv: ClarityValue): string =>
  escapeNonPrintable(Cl.stringify(cv));

export const getContractNameFromContractId = (contractId: string): string =>
  contractId.split(".")[1];
