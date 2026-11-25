import { join } from "node:path";

import { initSimnet } from "@stacks/clarinet-sdk";
import {
  Cl,
  ClarityType,
  type ClarityValue,
  type ListCV,
} from "@stacks/transactions";
import fc from "fast-check";

import { getContractFunction, strategyFor } from "../src/lib";
import { exampleDir } from "./test.utils";

const manifestPath = join(exampleDir, "Clarinet.toml");

describe("getContractFunction", () => {
  it("returns the function interface for a known contract and function", async () => {
    const simnet = await initSimnet(manifestPath);
    const fn = getContractFunction(simnet, "counter", "increment");

    expect(fn.name).toBe("increment");
    expect(fn.access).toBe("public");
  });

  it("returns a function with arguments", async () => {
    const simnet = await initSimnet(manifestPath);
    const fn = getContractFunction(simnet, "counter", "add");

    expect(fn.name).toBe("add");
    expect(fn.args.length).toBe(1);
  });

  it("throws when the contract does not exist", async () => {
    const simnet = await initSimnet(manifestPath);

    expect(() => getContractFunction(simnet, "nonexistent", "foo")).toThrow(
      'Contract "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.nonexistent" not found.',
    );
  });

  it("throws when the function does not exist", async () => {
    const simnet = await initSimnet(manifestPath);

    expect(() => getContractFunction(simnet, "counter", "nonexistent")).toThrow(
      'Function "nonexistent" not found in contract "counter".',
    );
  });

  it("accepts a custom deployer address", async () => {
    const simnet = await initSimnet(manifestPath);

    // Using the actual deployer explicitly should work the same.
    const fn = getContractFunction(
      simnet,
      "counter",
      "increment",
      simnet.deployer,
    );
    expect(fn.name).toBe("increment");
  });
});

describe("strategyFor", () => {
  it("produces ClarityValue arrays for a function with arguments", async () => {
    const simnet = await initSimnet(manifestPath);
    const fn = getContractFunction(simnet, "counter", "add");
    const arb = strategyFor(simnet, fn);

    fc.assert(
      fc.property(arb, (args: ClarityValue[]) => {
        expect(Array.isArray(args)).toBe(true);
        expect(args.length).toBe(fn.args.length);
        args.forEach((arg) => {
          expect(arg).toHaveProperty("type");
        });
      }),
      { numRuns: 10 },
    );
  });

  it("produces an empty array for a function with no arguments", async () => {
    const simnet = await initSimnet(manifestPath);
    const fn = getContractFunction(simnet, "counter", "increment");
    const arb = strategyFor(simnet, fn);

    fc.assert(
      fc.property(arb, (args: ClarityValue[]) => {
        expect(args).toEqual([]);
      }),
      { numRuns: 1 },
    );
  });

  it("produces trait reference arguments for a private test function", async () => {
    const simnet = await initSimnet(manifestPath);
    const fn = getContractFunction(simnet, "send-tokens", "test-transfer");
    const [[token]] = fc.sample(strategyFor(simnet, fn), 1);

    expect(token).toHaveProperty("type", "contract");
  });

  it("produces arguments usable with simnet.callPublicFn", async () => {
    const simnet = await initSimnet(manifestPath);
    // Unlike `counter.add`, which throws on uint overflow, `update-shipment`
    // returns a response for any valid arguments.
    const fn = getContractFunction(simnet, "cargo", "update-shipment");
    const arb = strategyFor(simnet, fn);

    fc.assert(
      fc.property(arb, (args: ClarityValue[]) => {
        // Should not throw — arguments are valid Clarity values.
        const { result } = simnet.callPublicFn(
          `${simnet.deployer}.cargo`,
          "update-shipment",
          args,
          simnet.deployer,
        );
        expect(result).toBeDefined();
      }),
      { numRuns: 5 },
    );
  });

  it("produces arguments the simnet accepts unchanged", async () => {
    const simnet = await initSimnet(manifestPath);
    const reversed = ([arg]: ClarityValue[]) =>
      arg.type === ClarityType.StringUTF8
        ? Cl.stringUtf8([...arg.value].reverse().join(""))
        : Cl.list([...(arg as ListCV).value].reverse());

    // These functions return their input reversed, so any value the simnet
    // altered or rejected surfaces as a mismatch or a throw.
    for (const fnName of ["reverse", "reverse-uint", "reverse-string"]) {
      const fn = getContractFunction(simnet, "reverse", fnName);
      fc.assert(
        fc.property(strategyFor(simnet, fn), (args) => {
          const { result } = simnet.callReadOnlyFn(
            "reverse",
            fnName,
            args,
            simnet.deployer,
          );
          expect(result).toEqual(reversed(args));
        }),
        { numRuns: 100 },
      );
    }
  });

  it("honors allAddresses override for principal-typed arguments", async () => {
    const simnet = await initSimnet(manifestPath);
    const fn = getContractFunction(simnet, "rendezvous-token", "mint");
    const restrictedAddress = [...simnet.getAccounts().values()][0];
    const arb = strategyFor(simnet, fn, [restrictedAddress]);

    fc.assert(
      fc.property(arb, (args: ClarityValue[]) => {
        const [recipientArg] = args;
        expect(recipientArg).toEqual(
          expect.objectContaining({ value: restrictedAddress }),
        );
      }),
      { numRuns: 10 },
    );
  });

  it("hands each run its own argument objects, including while shrinking", async () => {
    const simnet = await initSimnet(manifestPath);
    const fn = getContractFunction(simnet, "rendezvous-token", "mint");
    const arb = strategyFor(simnet, fn);
    const recipients: ClarityValue[] = [];

    expect(() =>
      fc.assert(
        fc.property(arb, ([recipient, amount]: ClarityValue[]) => {
          recipients.push(recipient);
          // Edit the argument in place, as a pre-dialer could.
          (recipient as { value: string }).value = "mutated";
          return (amount as { value: bigint }).value < BigInt(1000);
        }),
        { seed: 3, numRuns: 1000 },
      ),
    ).toThrow();

    // A failure followed by shrinking runs the property several times.
    expect(recipients.length).toBeGreaterThan(2);
    expect(new Set(recipients).size).toBe(recipients.length);
  });
});
