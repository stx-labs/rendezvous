import { join, resolve } from "node:path";

import { initSimnet } from "@stacks/clarinet-sdk";
import { beforeAll } from "vitest";

// Ensure that the Clarinet project cache and deployment plan are initialized
// before all the tests run.
beforeAll(async () => {
  const manifestPath = join(
    resolve(__dirname, "..", "example"),
    "Clarinet.toml",
  );
  await initSimnet(manifestPath);
}, 30_000);
