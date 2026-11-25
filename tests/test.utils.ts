import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Creates an isolated test environment by copying the Clarinet project to a
 * unique temporary directory. This prevents race conditions when multiple
 * tests try to initialize simnet concurrently.
 *
 * @param manifestDir - The absolute path to the manifest directory.
 * @param testPrefix - Prefix for the temporary directory name.
 * @returns The path to the temporary directory containing the isolated project
 * copy.
 */
export const createIsolatedTestEnvironment = (
  manifestDir: string,
  testPrefix: string,
): string => {
  const tempDir = mkdtempSync(join(tmpdir(), testPrefix));
  cpSync(manifestDir, tempDir, { recursive: true });
  return tempDir;
};
