import type { ParsedTransactionResult } from "@stacks/clarinet-sdk";
import type { ClarityValue } from "@stacks/transactions";

import type { EnrichedContractInterfaceFunction } from "./shared.types";

export type Dialer = (context: DialerContext) => Promise<void> | void;

export interface DialerContext {
  clarityValueArguments: ClarityValue[];
  functionCall: ParsedTransactionResult | undefined;
  selectedFunction: EnrichedContractInterfaceFunction;
}
