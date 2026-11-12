import type { ParsedTransactionResult, Simnet } from "@stacks/clarinet-sdk";
import type { ClarityValue } from "@stacks/transactions";

import type { EnrichedContractInterfaceFunction } from "./shared.types";

export type Dialer = (context: DialerContext) => Promise<void> | void;

export interface DialerContext {
  simnet: Simnet;
  contractId: string;
  clarityValueArguments: ClarityValue[];
  functionCall: ParsedTransactionResult | undefined;
  selectedFunction: EnrichedContractInterfaceFunction;
}
