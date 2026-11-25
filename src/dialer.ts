import { existsSync } from "node:fs";
import { resolve } from "node:path";

import type { Dialer, DialerContext } from "./dialer.types";

// In telephony, a registry is used for maintaining a known set of handlers,
// devices, or processes. This aligns with this class's purpose. Dialers are
// loaded/stored and run in a structured way, so "registry" fits both telephony
// and DI semantics.
export class DialerRegistry {
  private readonly dialPath: string;
  private preDialers: Dialer[] = [];
  private postDialers: Dialer[] = [];

  constructor(dialPath: string) {
    this.dialPath = dialPath;
  }

  registerPreDialer(dialer: Dialer) {
    this.preDialers.push(dialer);
  }

  registerPostDialer(dialer: Dialer) {
    this.postDialers.push(dialer);
  }

  async registerDialers() {
    const resolvedDialPath = resolve(this.dialPath);

    if (!existsSync(resolvedDialPath)) {
      console.error(`Error: Dialer file not found: ${resolvedDialPath}`);
      process.exit(1);
    }

    try {
      const userModule = await import(resolvedDialPath);

      Object.entries(userModule).forEach(([key, fn]) => {
        if (typeof fn === "function") {
          if (key.startsWith("pre")) {
            this.registerPreDialer(fn as Dialer);
          } else if (key.startsWith("post")) {
            this.registerPostDialer(fn as Dialer);
          }
        }
      });
    } catch (error) {
      console.error(`Failed to load dialers:`, error);
      process.exit(1);
    }
  }

  async executePreDialers(context: DialerContext) {
    if (this.preDialers.length === 0) {
      return;
    }

    for (const dial of this.preDialers) {
      await dial(context);
    }
  }

  async executePostDialers(context: DialerContext) {
    if (this.postDialers.length === 0) {
      return;
    }

    for (const dial of this.postDialers) {
      await dial(context);
    }
  }
}

export class PreDialerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Pre-dialer error";
  }
}

export class PostDialerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Post-dialer error";
  }
}
