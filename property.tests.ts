import { rmSync } from "node:fs";
import { join, resolve } from "node:path";

import { initSimnet } from "@stacks/clarinet-sdk";
import type {
  ContractInterfaceFunction,
  ContractInterfaceFunctionAccess,
  ContractInterfaceFunctionArg,
  ContractInterfaceFunctionOutput,
} from "@stacks/clarinet-sdk-wasm";
import fc from "fast-check";

import {
  isParamsMatch,
  isReturnTypeBoolean,
  isTestDiscardedInPlace,
} from "./property";
import { createIsolatedTestEnvironment } from "./test.utils";

const isolatedTestEnvPrefix = "rendezvous-test-property-";

describe("Test discarding related operations", () => {
  it("boolean output checker returns true when the function's output is boolean", () => {
    fc.assert(
      fc.property(
        fc.record({
          fnName: fc.string(),
          access: fc.constant("read_only"),
          args: fc.array(
            fc.record({
              name: fc.string(),
              type: fc.constantFrom("int128", "uint128", "bool", "principal"),
            }),
          ),
          outputs: fc.record({ type: fc.constant("bool") }),
        }),
        (r: {
          fnName: string;
          access: string;
          args: { name: string; type: string }[];
          outputs: { type: string };
        }) => {
          const discardFunctionInterface: ContractInterfaceFunction = {
            name: r.fnName,
            access: r.access as ContractInterfaceFunctionAccess,
            args: r.args as ContractInterfaceFunctionArg[],
            outputs: r.outputs as ContractInterfaceFunctionOutput,
          };
          const actual = isReturnTypeBoolean(discardFunctionInterface);
          expect(actual).toBe(true);
        },
      ),
    );
  });

  it("boolean output checker returns false when the function's output is non-boolean", () => {
    fc.assert(
      fc.property(
        fc.record({
          fnName: fc.string(),
          access: fc.constant("read_only"),
          args: fc.array(
            fc.record({
              name: fc.string(),
              type: fc.constantFrom("int128", "uint128", "bool", "principal"),
            }),
          ),
          outputs: fc.record({
            type: fc.constantFrom("int128", "uint128", "principal"),
          }),
        }),
        (r: {
          fnName: string;
          access: string;
          args: { name: string; type: string }[];
          outputs: { type: string };
        }) => {
          const discardFunctionInterface: ContractInterfaceFunction = {
            name: r.fnName,
            access: r.access as ContractInterfaceFunctionAccess,
            args: r.args as ContractInterfaceFunctionArg[],
            outputs: r.outputs as ContractInterfaceFunctionOutput,
          };
          const actual = isReturnTypeBoolean(discardFunctionInterface);
          expect(actual).toBe(false);
        },
      ),
    );
  });

  it("param matcher returns true when two functions have the same parameters", () => {
    fc.assert(
      fc.property(
        fc.record({
          fnName: fc.string(),
          access: fc.constant("read_only"),
          args: fc.array(
            fc.record({
              name: fc.string(),
              type: fc.constantFrom("int128", "uint128", "bool", "principal"),
            }),
          ),
          outputs: fc.record({ type: fc.constant("bool") }),
        }),
        (r: {
          fnName: string;
          access: string;
          args: { name: string; type: string }[];
          outputs: { type: string };
        }) => {
          const testFunctionInterface: ContractInterfaceFunction = {
            name: r.fnName,
            access: r.access as ContractInterfaceFunctionAccess,
            args: r.args as ContractInterfaceFunctionArg[],
            outputs: r.outputs as ContractInterfaceFunctionOutput,
          };
          const discardFunctionInterface: ContractInterfaceFunction = {
            name: r.fnName,
            access: r.access as ContractInterfaceFunctionAccess,
            args: r.args as ContractInterfaceFunctionArg[],
            outputs: r.outputs as ContractInterfaceFunctionOutput,
          };
          const actual = isParamsMatch(
            testFunctionInterface,
            discardFunctionInterface,
          );
          expect(actual).toBe(true);
        },
      ),
    );
  });

  it("param matcher returns false when two functions have different parameters", () => {
    fc.assert(
      fc.property(
        fc
          .record({
            testFn: fc.record({
              fnName: fc.string(),
              access: fc.constant("read_only"),
              args: fc.array(
                fc.record({
                  name: fc.string(),
                  type: fc.constantFrom(
                    "int128",
                    "uint128",
                    "bool",
                    "principal",
                  ),
                }),
              ),
              outputs: fc.record({ type: fc.constant("bool") }),
            }),
            discardFn: fc.record({
              fnName: fc.string(),
              access: fc.constant("read_only"),
              args: fc.array(
                fc.record({
                  name: fc.string(),
                  type: fc.constantFrom(
                    "int128",
                    "uint128",
                    "bool",
                    "principal",
                  ),
                }),
              ),
              outputs: fc.record({ type: fc.constant("bool") }),
            }),
          })
          .filter(
            (r) =>
              JSON.stringify(
                [...r.testFn.args].sort((a, b) => a.name.localeCompare(b.name)),
              ) !==
              JSON.stringify(
                [...r.discardFn.args].sort((a, b) =>
                  a.name.localeCompare(b.name),
                ),
              ),
          ),
        (r: {
          testFn: {
            fnName: string;
            access: string;
            args: { name: string; type: string }[];
            outputs: { type: string };
          };
          discardFn: {
            fnName: string;
            access: string;
            args: { name: string; type: string }[];
            outputs: { type: string };
          };
        }) => {
          const testFunctionInterface: ContractInterfaceFunction = {
            name: r.testFn.fnName,
            access: r.testFn.access as ContractInterfaceFunctionAccess,
            args: r.testFn.args as ContractInterfaceFunctionArg[],
            outputs: r.testFn.outputs as ContractInterfaceFunctionOutput,
          };
          const discardFunctionInterface: ContractInterfaceFunction = {
            name: r.discardFn.fnName,
            access: r.discardFn.access as ContractInterfaceFunctionAccess,
            args: r.discardFn.args as ContractInterfaceFunctionArg[],
            outputs: r.discardFn.outputs as ContractInterfaceFunctionOutput,
          };
          const actual = isParamsMatch(
            testFunctionInterface,
            discardFunctionInterface,
          );
          expect(actual).toBe(false);
        },
      ),
    );
  });

  it("in place discard function returns true if the function call result is (ok false)", async () => {
    // Setup
    const tempDir = createIsolatedTestEnvironment(
      resolve(__dirname, "example"),
      isolatedTestEnvPrefix,
    );
    const manifestPath = join(tempDir, "Clarinet.toml");
    const simnet = await initSimnet(manifestPath);

    simnet.deployContract(
      "contract",
      "(define-public (discarded-fn) (ok false))",
      { clarityVersion: 2 },
      simnet.deployer,
    );

    const { result: functionCallResult } = simnet.callPublicFn(
      "contract",
      "discarded-fn",
      [],
      simnet.deployer,
    );

    // Exercise
    const dircardedInPlace = isTestDiscardedInPlace(functionCallResult);

    // Verify
    expect(dircardedInPlace).toBe(true);

    // Teardown
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("in place discard function returns false if the function call result is (ok true)", async () => {
    // Setup
    const tempDir = createIsolatedTestEnvironment(
      resolve(__dirname, "example"),
      isolatedTestEnvPrefix,
    );
    const manifestPath = join(tempDir, "Clarinet.toml");
    const simnet = await initSimnet(manifestPath);

    simnet.deployContract(
      "contract",
      "(define-public (not-discarded-fn) (ok true))",
      { clarityVersion: 2 },
      simnet.deployer,
    );

    const { result: functionCallResult } = simnet.callPublicFn(
      "contract",
      "not-discarded-fn",
      [],
      simnet.deployer,
    );

    // Exercise
    const dircardedInPlace = isTestDiscardedInPlace(functionCallResult);

    // Verify
    expect(dircardedInPlace).toBe(false);

    // Teardown
    rmSync(tempDir, { recursive: true, force: true });
  });
});
