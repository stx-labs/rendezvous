import type {
  ContractInterfaceFunctionAccess,
  ContractInterfaceFunctionArg,
  ContractInterfaceFunctionOutput,
} from "@stacks/clarinet-sdk-wasm";
import type {
  boolCV,
  bufferCV,
  ClarityValue,
  intCV,
  listCV,
  optionalCVOf,
  principalCV,
  responseErrorCV,
  responseOkCV,
  stringAsciiCV,
  stringUtf8CV,
  tupleCV,
  uintCV,
} from "@stacks/transactions";
import type fc from "fast-check";

import type { ImplementedTraitType, ImportedTraitType } from "./traits.types";

// Types used for Clarity Value conversion.

interface ImportedTraitReferenceFunctionArg {
  type: {
    trait_reference: ImportedTraitType;
  };
  name: string;
}

/**
 * The type of the function interface, after the contract interface is
 * "enriched" with additional information about trait references.
 */
export interface EnrichedContractInterfaceFunction {
  args: (ContractInterfaceFunctionArg | ImportedTraitReferenceFunctionArg)[];
  name: string;
  access: ContractInterfaceFunctionAccess;
  outputs: ContractInterfaceFunctionOutput;
}

export type ResponseStatus = "ok" | "error";

export type TupleData<T extends ClarityValue = ClarityValue> = Record<
  string,
  T
>;

export interface BaseTypesToCV {
  int128: (arg: bigint) => ReturnType<typeof intCV>;
  uint128: (arg: bigint) => ReturnType<typeof uintCV>;
  bool: (arg: boolean) => ReturnType<typeof boolCV>;
  principal: (arg: string) => ReturnType<typeof principalCV>;
}

export interface ComplexTypesToCV {
  buffer: (arg: string) => ReturnType<typeof bufferCV>;
  "string-ascii": (arg: string) => ReturnType<typeof stringAsciiCV>;
  "string-utf8": (arg: string) => ReturnType<typeof stringUtf8CV>;
  list: (type: ClarityValue[]) => ReturnType<typeof listCV>;
  tuple: (tupleData: TupleData) => ReturnType<typeof tupleCV>;
  optional: (arg: ClarityValue | null) => ReturnType<typeof optionalCVOf>;
  response: (
    status: ResponseStatus,
    value: ClarityValue,
  ) => ReturnType<typeof responseOkCV | typeof responseErrorCV>;
  trait_reference: (trait: string) => ReturnType<typeof principalCV>;
}

// Types used for argument generation.

/** The base Clarity parameter types, as found in the contract interface. */
export type BaseType =
  "int128" | "uint128" | "bool" | "principal" | "trait_reference";

/**
 * The base Clarity parameter types, after the contract interface is "enriched"
 * with additional information about trait references. The "trait_reference" is
 * no longer a base type after "enrichment".
 */
export type EnrichedBaseType = "int128" | "uint128" | "bool" | "principal";

/** The complex Clarity parameter types, as found in the contract interface. */
type ComplexType =
  | { buffer: { length: number } }
  | { "string-ascii": { length: number } }
  | { "string-utf8": { length: number } }
  | { list: { type: ParameterType; length: number } }
  | { tuple: { name: string; type: ParameterType }[] }
  | { optional: ParameterType }
  | { response: { ok: ParameterType; error: ParameterType } };

/**
 * The complex Clarity parameter types, after the contract interface is
 * "enriched" with additional information about trait references. The
 * "trait_reference" is a complex type after enrichment.
 */
type EnrichedComplexType =
  | { buffer: { length: number } }
  | { "string-ascii": { length: number } }
  | { "string-utf8": { length: number } }
  | { list: { type: EnrichedParameterType; length: number } }
  | { tuple: { name: string; type: EnrichedParameterType }[] }
  | { optional: EnrichedParameterType }
  | { response: { ok: EnrichedParameterType; error: EnrichedParameterType } }
  | { trait_reference: ImportedTraitType };

/** The Clarity parameter types as found in the contract interface. */
export type ParameterType = BaseType | ComplexType;

/** The Clarity parameter types after the contract interface is "enriched". */
export type EnrichedParameterType = EnrichedBaseType | EnrichedComplexType;

export interface BaseTypesToArbitrary {
  int128: fc.Arbitrary<bigint>;
  uint128: fc.Arbitrary<bigint>;
  bool: ReturnType<typeof fc.boolean>;
  principal: (addresses: string[]) => ReturnType<typeof fc.constantFrom>;
}

export interface ComplexTypesToArbitrary {
  buffer: (length: number) => fc.Arbitrary<string>;
  "string-ascii": (length: number) => fc.Arbitrary<string>;
  "string-utf8": (length: number) => fc.Arbitrary<string>;
  list: (
    type: EnrichedParameterType,
    length: number,
    addresses: string[],
    projectTraitImplementations: Record<string, ImplementedTraitType[]>,
  ) => fc.Arbitrary<any[]>;
  tuple: (
    items: { name: string; type: EnrichedParameterType }[],
    addresses: string[],
    projectTraitImplementations: Record<string, ImplementedTraitType[]>,
  ) => fc.Arbitrary<object>;
  optional: (
    type: EnrichedParameterType,
    addresses: string[],
    projectTraitImplementations: Record<string, ImplementedTraitType[]>,
  ) => fc.Arbitrary<any>;
  response: (
    okType: EnrichedParameterType,
    errType: EnrichedParameterType,
    addresses: string[],
    projectTraitImplementations: Record<string, ImplementedTraitType[]>,
  ) => fc.Arbitrary<any>;
  trait_reference: (
    traitData: ImportedTraitType,
    projectTraitImplementations: Record<string, ImplementedTraitType[]>,
  ) => fc.Arbitrary<any>;
}
