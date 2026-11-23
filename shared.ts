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

/**
 * Base types to fast-check arbitraries mapping.
 */
const baseTypesToArbitrary = {
  int128: fc.integer().map(Cl.int),
  uint128: fc.nat().map(Cl.uint),
  bool: fc.boolean().map(Cl.bool),
  principal: (addresses: string[]) =>
    fc.constantFrom(...addresses).map(Cl.principal),
};

/**
 * Complex types to fast-check arbitraries mapping.
 */
const complexTypesToArbitrary = {
  // For buffer types, the length must be doubled because they are represented
  // in hex, as `Cl.bufferFromHex` expects. The UInt8Array will have half the length of the corresponding
  // hex string. Stacks.js reference:
  // https://github.com/stx-labs/stacks.js/blob/fd0bf26b5f29fc3c1bf79581d0ad9b89f0d7f15a/packages/common/src/utils.ts#L522
  buffer: (length: number) =>
    hexaString({ maxLength: 2 * length }).map(Cl.bufferFromHex),
  "string-ascii": (length: number) =>
    fc
      .string({
        unit: fc.constantFrom(...charSet),
        maxLength: length,
      })
      .map(Cl.stringAscii),
  "string-utf8": (length: number) =>
    fc.string({ maxLength: length }).map(Cl.stringUtf8),
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
    // boolean per value, and saved regression seeds depend on that draw.
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

export const getContractNameFromContractId = (contractId: string): string =>
  contractId.split(".")[1];
