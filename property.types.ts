import type { EventEmitter } from "node:events";

import type { Simnet } from "@stacks/clarinet-sdk";

import type { EnrichedContractInterfaceFunction } from "./shared.types";
import type { ImplementedTraitType } from "./traits.types";

/**
 * The configuration for a property test.
 */
export interface PropertyTestConfig {
  simnet: Simnet;
  targetContractName: string;
  rendezvousContractId: string;
  runs: number | undefined;
  seed: number | undefined;
  bail: boolean;
  radio: EventEmitter;
  eligibleAccounts: Map<string, string>;
  allAddresses: string[];
  pattern?: string;
}

/**
 * The context to run a property test with.
 */
export interface PropertyTestContext {
  /** Executable test functions. */
  testFunctions: EnrichedContractInterfaceFunction[];
  /** Test functions paired with their corresponding discard functions. */
  testContractsPairedFunctions: Map<string, Map<string, string | undefined>>;
  /** Project contracts mapped to the traits they implement. */
  projectTraitImplementations: Record<string, ImplementedTraitType[]>;
}
