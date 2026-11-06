import type { EventEmitter } from "node:events";

import type { Simnet } from "@stacks/clarinet-sdk";

import type { EnrichedContractInterfaceFunction } from "./shared.types";
import type { ImplementedTraitType } from "./traits.types";

type ContractId = string;

type SutFunctionName = string;

/**
 * LocalContext is a data structure used to track the number of times each SUT
 * function is called for every contract. It is a nested map where:
 * - The outer key is the contract identifier.
 * - The inner key is the SUT function name within the contract.
 * - The value is the count of times the SUT function has been invoked.
 */
export type LocalContext = Record<ContractId, Record<SutFunctionName, number>>;

/**
 * The configuration for an invariant test.
 */
export interface InvariantTestConfig {
  simnet: Simnet;
  targetContractName: string;
  rendezvousContractId: string;
  runs: number | undefined;
  seed: number | undefined;
  bail: boolean;
  dial: string | undefined;
  radio: EventEmitter;
  eligibleAccounts: Map<string, string>;
  allAddresses: string[];
  pattern?: string;
}

/**
 * The context to run an invariant test with.
 */
export interface InvariantTestContext {
  /** SUT functions for the target contract. */
  functions: EnrichedContractInterfaceFunction[];
  /** Invariant functions for the target contract. */
  invariants: EnrichedContractInterfaceFunction[];
  /** Project contracts mapped to the traits they implement. */
  projectTraitImplementations: Record<string, ImplementedTraitType[]>;
}
