import type { ContractInterfaceFunction } from "@stacks/clarinet-sdk-wasm";

export interface RunDetails {
  failed: boolean;
  counterexample: CounterExample[];
  numRuns: number;
  seed: number;
  path?: string;
  error?: Error;
  errorInstance?: Error;
}

type CounterExample = TestCounterExample | InvariantCounterExample;

export interface TestCounterExample {
  rendezvousContractId: string;
  selectedTestFunction: ContractInterfaceFunction;
  functionArgs: any;
  testCaller: [string, string];
}

export interface InvariantCounterExample {
  rendezvousContractId: string;
  selectedFunctions: ContractInterfaceFunction[];
  selectedFunctionsArgsList: any[];
  sutCallers: [string, string][];
  selectedInvariant: ContractInterfaceFunction;
  invariantArgs: any;
  invariantCaller: [string, string];
}

interface SutFunctionStatistics {
  thrown: number;
  successful: Map<string, number>;
  failed: Map<string, number>;
}

interface InvariantFunctionStatistics {
  successful: Map<string, number>;
  failed: Map<string, number>;
}

interface TestFunctionStatistics {
  successful: Map<string, number>;
  discarded: Map<string, number>;
  failed: Map<string, number>;
}

export interface Statistics {
  sut?: SutFunctionStatistics;
  invariant?: InvariantFunctionStatistics;
  test?: TestFunctionStatistics;
}

/**
 * Options for configuring tree statistics reporting.
 */
export interface StatisticsTreeOptions {
  isLastSection?: boolean;
  baseIndent?: string;
}
