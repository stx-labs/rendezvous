import type { Simnet } from "@stacks/clarinet-sdk";
import type {
  ContractInterfaceFunction,
  IContractInterface,
} from "@stacks/clarinet-sdk-wasm";
import {
  Cl,
  optionalCVOf,
  principalCV,
  responseErrorCV,
  responseOkCV,
  type ClarityValue,
} from "@stacks/transactions";
import fc from "fast-check";

import type {
  BaseTypesToArbitrary,
  BaseTypesToCV,
  ComplexTypesToArbitrary,
  ComplexTypesToCV,
  EnrichedBaseType,
  EnrichedContractInterfaceFunction,
  EnrichedParameterType,
  ResponseStatus,
  TupleData,
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
): fc.Arbitrary<any>[] =>
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
): fc.Arbitrary<any> => {
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
export const INT128_MIN = -(BigInt(2) ** BigInt(127));
/** Largest Clarity `int` value: 2^127 - 1. */
export const INT128_MAX = BigInt(2) ** BigInt(127) - BigInt(1);
/** Largest Clarity `uint` value: 2^128 - 1. */
export const UINT128_MAX = BigInt(2) ** BigInt(128) - BigInt(1);

/**
 * A `bigint` in `[min, max]`. `fc.bigInt` rarely hits the exact bounds, so
 * they are also drawn directly 1 time in 20.
 */
const fullRangeBigInt = (min: bigint, max: bigint): fc.Arbitrary<bigint> =>
  fc.oneof(
    { arbitrary: fc.bigInt({ min, max }), weight: 19 },
    { arbitrary: fc.constantFrom(min, max), weight: 1 },
  );

/**
 * Base types to fast-check arbitraries mapping.
 */
const baseTypesToArbitrary: BaseTypesToArbitrary = {
  int128: fullRangeBigInt(INT128_MIN, INT128_MAX),
  uint128: fullRangeBigInt(BigInt(0), UINT128_MAX),
  bool: fc.boolean(),
  principal: (addresses: string[]) => fc.constantFrom(...addresses),
};

/**
 * Complex types to fast-check arbitraries mapping.
 */
const complexTypesToArbitrary: ComplexTypesToArbitrary = {
  // For buffer types, the length must be doubled because they are represented
  // in hex. The `argToCV` function expects this format for `buff` ClarityValue
  // conversion. The UInt8Array will have half the length of the corresponding
  // hex string. Stacks.js reference:
  // https://github.com/stx-labs/stacks.js/blob/fd0bf26b5f29fc3c1bf79581d0ad9b89f0d7f15a/packages/common/src/utils.ts#L522
  buffer: (length: number) => hexaString({ maxLength: 2 * length }),
  "string-ascii": (length: number) =>
    fc.string({
      unit: asciiChar,
      maxLength: length,
    }),
  // Clarity measures `string-utf8` length in code points, and each unit is
  // exactly one code point.
  "string-utf8": (length: number) =>
    fc.string({ unit: utf8CodePoint, maxLength: length }),
  list: (
    type: EnrichedParameterType,
    length: number,
    addresses: string[],
    projectTraitImplementations: Record<string, ImplementedTraitType[]>,
  ) =>
    fc.array(
      parameterTypeToArbitrary(type, addresses, projectTraitImplementations),
      {
        maxLength: length,
      },
    ),
  tuple: (
    items: { name: string; type: EnrichedParameterType }[],
    addresses: string[],
    projectTraitImplementations: Record<string, ImplementedTraitType[]>,
  ) => {
    const tupleArbitraries: Record<string, fc.Arbitrary<any>> = {};
    items.forEach((item) => {
      tupleArbitraries[item.name] = parameterTypeToArbitrary(
        item.type,
        addresses,
        projectTraitImplementations,
      );
    });
    return fc.record(tupleArbitraries);
  },
  optional: (
    type: EnrichedParameterType,
    addresses: string[],
    projectTraitImplementations: Record<string, ImplementedTraitType[]>,
  ) =>
    fc.option(
      parameterTypeToArbitrary(type, addresses, projectTraitImplementations),
    ),
  response: (
    okType: EnrichedParameterType,
    errType: EnrichedParameterType,
    addresses: string[],
    projectTraitImplementations: Record<string, ImplementedTraitType[]>,
  ) =>
    fc.oneof(
      fc.record({
        status: fc.constant("ok"),
        value: parameterTypeToArbitrary(
          okType,
          addresses,
          projectTraitImplementations,
        ),
      }),
      fc.record({
        status: fc.constant("error"),
        value: parameterTypeToArbitrary(
          errType,
          addresses,
          projectTraitImplementations,
        ),
      }),
    ),
  trait_reference: (
    traitData: ImportedTraitType,
    projectTraitImplementations: Record<string, ImplementedTraitType[]>,
  ) =>
    fc.constantFrom(
      ...getContractIdsImplementingTrait(
        traitData,
        projectTraitImplementations,
      ),
    ),
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
 * A single code point for `string-utf8`: printable ASCII (the shrink target),
 * printable non-ASCII, or any code point. Never a lone surrogate, which UTF-8
 * encoding would silently replace with U+FFFD.
 */
const utf8CodePoint: fc.Arbitrary<string> = fc.oneof(
  asciiChar,
  fc.string({ unit: "grapheme-composite", minLength: 1, maxLength: 1 }),
  fc.string({ unit: "binary", minLength: 1, maxLength: 1 }),
);

/**
 * Converts JavaScript generated function arguments to Clarity values.
 * @param functionInterface The function interface.
 * @param generatedArguments Array of generated arguments.
 * @returns Array of Clarity values.
 */
export const argsToCV = (
  functionInterface: EnrichedContractInterfaceFunction,
  generatedArguments: any[],
) =>
  functionInterface.args.map((arg, i) =>
    argToCV(generatedArguments[i], arg.type as EnrichedParameterType),
  );

/**
 * Converts a JavaScript generated function argument to a Clarity value.
 * @param generatedArgument Generated argument.
 * @param type Argument type (base or complex).
 * @returns Clarity value.
 */
const argToCV = (
  generatedArgument: any,
  type: EnrichedParameterType,
): ClarityValue => {
  if (isBaseType(type)) {
    // Base type.
    switch (type) {
      case "int128": {
        return baseTypesToCV.int128(generatedArgument as bigint);
      }
      case "uint128": {
        return baseTypesToCV.uint128(generatedArgument as bigint);
      }
      case "bool": {
        return baseTypesToCV.bool(generatedArgument as boolean);
      }
      case "principal": {
        return baseTypesToCV.principal(generatedArgument as string);
      }
      default: {
        throw new Error(`Unsupported base parameter type: ${type}`);
      }
    }
  } else {
    // Complex type.
    if ("buffer" in type) {
      return complexTypesToCV.buffer(generatedArgument);
    } else if ("string-ascii" in type) {
      return complexTypesToCV["string-ascii"](generatedArgument);
    } else if ("string-utf8" in type) {
      return complexTypesToCV["string-utf8"](generatedArgument);
    } else if ("list" in type) {
      const listItems = generatedArgument.map((item: any) =>
        argToCV(item, type.list.type),
      );
      return complexTypesToCV.list(listItems);
    } else if ("tuple" in type) {
      const tupleData: Record<string, ClarityValue> = {};
      type.tuple.forEach((field) => {
        tupleData[field.name] = argToCV(
          generatedArgument[field.name],
          field.type,
        );
      });
      return complexTypesToCV.tuple(tupleData);
    } else if ("optional" in type) {
      return optionalCVOf(
        generatedArgument
          ? argToCV(generatedArgument, type.optional)
          : undefined,
      );
    } else if ("response" in type) {
      const status = generatedArgument.status as ResponseStatus;
      const branchType = type.response[status];
      const responseValue = argToCV(generatedArgument.value, branchType);
      return complexTypesToCV.response(status, responseValue);
    } else if ("trait_reference" in type) {
      return complexTypesToCV.trait_reference(generatedArgument);
    } else {
      throw new Error(
        `Unsupported complex parameter type: ${JSON.stringify(type)}`,
      );
    }
  }
};

/**
 * Base types to Clarity values mapping.
 */
const baseTypesToCV: BaseTypesToCV = {
  int128: (arg: bigint) => Cl.int(arg),
  uint128: (arg: bigint) => Cl.uint(arg),
  bool: (arg: boolean) => Cl.bool(arg),
  principal: (arg: string) => Cl.principal(arg),
};

/**
 * Complex types to Clarity values mapping.
 */
const complexTypesToCV: ComplexTypesToCV = {
  buffer: (arg: string) => Cl.bufferFromHex(arg),
  "string-ascii": (arg: string) => Cl.stringAscii(arg),
  "string-utf8": (arg: string) => Cl.stringUtf8(arg),
  list: (items: ClarityValue[]) => Cl.list(items),
  tuple: (tupleData: TupleData<ClarityValue>) => Cl.tuple(tupleData),
  optional: (arg: ClarityValue | null) =>
    arg ? optionalCVOf(arg) : optionalCVOf(undefined),
  response: (status: ResponseStatus, value: ClarityValue) => {
    if (status === "ok") {
      return responseOkCV(value);
    } else if (status === "error") {
      return responseErrorCV(value);
    } else {
      throw new Error(`Unsupported response status: ${status}`);
    }
  },
  trait_reference: (traitImplementation: string) =>
    principalCV(traitImplementation),
};

const isBaseType = (type: EnrichedParameterType): type is EnrichedBaseType =>
  ["int128", "uint128", "bool", "principal"].includes(type as EnrichedBaseType);

/**
 * Code points that are invisible or would corrupt terminal output: controls
 * other than newline (e.g. ESC, CR, C1), format characters (e.g. zero-width
 * space), private-use code points, and line/paragraph separators.
 */
const nonPrintableCodePoint = /(?!\n)[\p{Cc}\p{Cf}\p{Co}\p{Zl}\p{Zp}]/gu;

/**
 * Escapes non-printable code points as `\u{...}`, keeping newlines.
 * @param text The text to log.
 * @returns The printable text.
 */
export const escapeNonPrintable = (text: string): string =>
  text.replace(
    nonPrintableCodePoint,
    (c) => `\\u{${c.codePointAt(0)!.toString(16)}}`,
  );

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
