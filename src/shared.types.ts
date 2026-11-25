import type {
  ContractInterfaceFunctionAccess,
  ContractInterfaceFunctionArg,
  ContractInterfaceFunctionOutput,
} from "@stacks/clarinet-sdk-wasm";

import type { ImportedTraitType } from "./traits.types";

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

// Types used for argument generation.

/** The base Clarity parameter types, as found in the contract interface. */
export type BaseType =
  "int128" | "uint128" | "bool" | "principal" | "trait_reference";

/**
 * The base Clarity parameter types, after the contract interface is "enriched"
 * with additional information about trait references. The "trait_reference" is
 * no longer a base type after "enrichment".
 */
type EnrichedBaseType = "int128" | "uint128" | "bool" | "principal";

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
