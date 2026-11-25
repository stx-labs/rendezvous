import type { EventEmitter } from "node:events";
import { setImmediate as yieldToEventLoop } from "node:timers/promises";

import fc from "fast-check";

const yieldBudgetNs = BigInt(50_000_000);

const interrupted = new WeakMap<
  EventEmitter,
  { stopped: boolean; fatal: boolean; lastYield: bigint }
>();

/** Install CLI-only signal handling for the lifetime of a run. */
export const listenForInterrupt = (radio: EventEmitter) => {
  const state = {
    stopped: false,
    fatal: false,
    lastYield: process.hrtime.bigint(),
  };
  interrupted.set(radio, state);
  const onInterrupt = () => {
    if (state.stopped) {
      process.exit(130);
    }
    state.stopped = true;
    radio.emit("logMessage", "\nInterrupt received. Stopping the run...");
  };
  process.on("SIGINT", onInterrupt);
  return {
    close: () => {
      process.off("SIGINT", onInterrupt);
      interrupted.delete(radio);
      if (state.stopped) {
        radio.emit("logMessage", "\nRun interrupted.\n");
        process.exitCode = state.fatal ? 1 : 130;
      }
    },
  };
};

export const isInterrupted = (radio: EventEmitter) =>
  interrupted.get(radio)?.stopped === true;

/** Fatal setup or harness errors take precedence over an interrupt. */
export const markInterruptFatal = (radio: EventEmitter) => {
  const state = interrupted.get(radio);
  if (state) {
    state.fatal = true;
  }
};

/** Deliver pending signal callbacks before reporting or removing the handler. */
export const drainInterrupts = async (radio: EventEmitter) => {
  const state = interrupted.get(radio);
  if (!state) {
    return;
  }
  await yieldToEventLoop();
  state.lastYield = process.hrtime.bigint();
};

/** Check between cases and shrink attempts, yielding no more often than 50 ms. */
export const interruptBoundary = async (radio: EventEmitter) => {
  const state = interrupted.get(radio);
  if (!state) {
    return;
  }
  if (process.hrtime.bigint() - state.lastYield >= yieldBudgetNs) {
    await drainInterrupts(radio);
  }
  if (state.stopped) {
    throw new fc.PreconditionFailure(true);
  }
};
