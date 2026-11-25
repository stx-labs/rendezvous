import { join } from "node:path";

import { initSimnet } from "@stacks/clarinet-sdk";
import { beforeAll } from "vitest";

import { exampleDir } from "./test.utils";

// Ensure that the Clarinet project cache and deployment plan are initialized
// before all the tests run.
beforeAll(async () => {
  const manifestPath = join(exampleDir, "Clarinet.toml");
  await initSimnet(manifestPath);
}, 30_000);
