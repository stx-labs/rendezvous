import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { initSimnet } from "@stacks/clarinet-sdk";
import { Cl } from "@stacks/transactions";

import { checkInvariants } from "./invariant";
import * as persistence from "./persistence";
import { getFunctionsFromContractInterfaces } from "./shared";

it.each([
  { result: "err", replay: false, bail: true, throws: false },
  { result: "ok", replay: false, bail: true, throws: false },
  { result: "err", replay: false, bail: false, throws: true },
  { result: "err", replay: true, bail: true, throws: true },
])(
  "post-dialer sees $result responses (replay=$replay, bail=$bail, throws=$throws)",
  async ({ result, replay, bail, throws }) => {
    const directory = mkdtempSync(join(tmpdir(), "rv-post-error-"));
    const oldExitCode = process.exitCode;
    try {
      mkdirSync(join(directory, "settings"));
      writeFileSync(
        join(directory, "Clarinet.toml"),
        `[project]
name = "fixture"
telemetry = false
[contracts.fixture]
path = "fixture.clar"
clarity_version = 3
epoch = 3.0
`,
      );
      writeFileSync(
        join(directory, "settings/Devnet.toml"),
        `[network]
name = "devnet"
[accounts.deployer]
mnemonic = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
balance = 100000000000000
`,
      );
      writeFileSync(
        join(directory, "fixture.clar"),
        `(define-map context (string-ascii 100) { called: uint })
(define-private (update-context (name (string-ascii 100)) (calls uint)) (ok (map-set context name { called: calls })))
(define-public (step) (begin (print u42) ${result === "ok" ? "(ok true)" : "(err u1)"}))
(define-read-only (invariant-pass) true)`,
      );
      const dial = join(directory, "dial.mjs");
      writeFileSync(
        dial,
        `export function postCheck(context) { globalThis.__rvPostCheck(context); }`,
      );
      const post = vi.fn(() => {
        if (throws) {
          throw new Error("post check failed");
        }
      });
      vi.stubGlobal("__rvPostCheck", post);
      const persist = vi
        .spyOn(persistence, "persistFailure")
        .mockImplementation(() => {});
      vi.spyOn(persistence, "loadFailures").mockReturnValue([
        { seed: 17, numRuns: 1, dial, timestamp: 0 },
      ]);
      const simnet = await initSimnet(join(directory, "Clarinet.toml"));
      const id = `${simnet.deployer}.fixture`;
      const contractInterface = simnet.getContractsInterfaces().get(id)!;
      const functions = getFunctionsFromContractInterfaces(
        new Map([[id, contractInterface]]),
      );
      const radio = new EventEmitter();
      const accounts = new Map([["deployer", simnet.deployer]]);
      process.exitCode = 0;
      await checkInvariants(
        simnet,
        async () => {},
        [id],
        functions,
        17,
        1,
        dial,
        bail,
        replay,
        radio,
        accounts,
        [simnet.deployer],
      );
      expect(post).toHaveBeenCalledWith(
        expect.objectContaining({
          functionCall: expect.objectContaining({
            result:
              result === "ok" ? Cl.ok(Cl.bool(true)) : Cl.error(Cl.uint(1)),
            events:
              result === "ok"
                ? [
                    expect.objectContaining({
                      event: "print_event",
                      data: expect.objectContaining({ value: Cl.uint(42) }),
                    }),
                  ]
                : [],
          }),
        }),
      );
      expect(process.exitCode).toBe(throws ? 1 : 0);
      expect(persist).toHaveBeenCalledTimes(throws ? 1 : 0);
    } finally {
      process.exitCode = oldExitCode;
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

it("checks SIP-010 print events only for successful transfers", async () => {
  const { postTransferSip010PrintEvent } = require("./example/sip010.cjs");
  const memo = Cl.bufferFromAscii("memo");
  const context = {
    selectedFunction: { name: "transfer" },
    clarityValueArguments: [null, null, null, Cl.some(memo)],
    functionCall: { result: Cl.error(Cl.uint(1)), events: [] },
  };
  await expect(postTransferSip010PrintEvent(context)).resolves.toBeUndefined();
  context.functionCall = {
    result: Cl.ok(Cl.bool(true)),
    events: [{ event: "print_event", data: { value: memo } }],
  } as any;
  await expect(postTransferSip010PrintEvent(context)).resolves.toBeUndefined();
  context.functionCall.events = [];
  await expect(postTransferSip010PrintEvent(context)).rejects.toThrow(
    "No print event found",
  );
});
