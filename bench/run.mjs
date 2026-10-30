#!/usr/bin/env node
// Wall-clock, CPU and memory benchmark for the `rv` CLI against the `bench`
// contract.
//
// Usage: node bench/run.mjs [--runs=1000,10000] [--modes=test,invariant]
//                           [--repeat=3] [--seed=1]
//
// Requires a fresh build (`npm run build`, or use `npm run bench`). Each
// configuration spawns `dist/app.js` as a child process, so the timings include
// Node startup and simnet initialization. A `--runs=1` baseline is measured per
// mode and subtracted to estimate the per-call cost. CPU time and peak RSS come
// from `process.resourceUsage()` inside the child (see `rusage.cjs`).
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { parseArgs, stripVTControlCharacters } from "node:util";

const benchDir = dirname(fileURLToPath(import.meta.url));
const rootDir = join(benchDir, "..");
const appPath = join(rootDir, "dist", "app.js");
const rusagePreload = join(benchDir, "rusage.cjs");

// Per mode: the log line of a single call to the SUT function, and the
// execution statistics lines whose counts must add up to the same total.
const callPatterns = {
  test: { call: / test-add-pair /, stats: /\stest-add-pair: x(\d+)$/ },
  invariant: { call: / add-pair /, stats: /\sadd-pair: x(\d+)$/ },
};

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const toInteger = (name, value, min) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min) {
    fail(`--${name} must be an integer >= ${min}, got "${value}".`);
  }
  return n;
};

const parseOptions = () => {
  try {
    return parseArgs({
      options: {
        runs: { type: "string", default: "1000,10000" },
        modes: { type: "string", default: "test,invariant" },
        repeat: { type: "string", default: "3" },
        seed: { type: "string", default: "1" },
      },
      strict: true,
    }).values;
  } catch (error) {
    return fail(error.message);
  }
};

const options = parseOptions();

const runsList = options.runs.split(",").map((r) => toInteger("runs", r, 1));
const modes = options.modes.split(",");
for (const mode of modes) {
  if (!(mode in callPatterns)) {
    fail(`Unknown mode "${mode}". Expected one of: test, invariant.`);
  }
}
const repeat = toInteger("repeat", options.repeat, 1);
const seed = toInteger("seed", options.seed, 0);

if (!existsSync(appPath)) {
  fail(`Missing ${appPath}. Run \`npm run build\` first.`);
}

// Warn when a source file changed after the last build, since the benchmark
// would otherwise silently measure the old code.
const builtAt = statSync(appPath).mtimeMs;
const staleSources = readdirSync(rootDir).filter(
  (file) =>
    file.endsWith(".ts") &&
    !file.endsWith(".tests.ts") &&
    statSync(join(rootDir, file)).mtimeMs > builtAt,
);
if (staleSources.length > 0) {
  console.warn(
    `Warning: dist/ is older than ${staleSources.join(", ")}. ` +
      "Run `npm run build` (or `npm run bench`) to measure the current code.\n",
  );
}

const rusageDir = mkdtempSync(join(tmpdir(), "rv-bench-"));
const rusageFile = join(rusageDir, "rusage.json");

const readUsage = () => {
  try {
    return JSON.parse(readFileSync(rusageFile, "utf8"));
  } catch {
    return null;
  }
};

const runOnce = (mode, runs) =>
  new Promise((resolve, reject) => {
    // Never let a run read the previous run's resource usage.
    rmSync(rusageFile, { force: true });

    const start = process.hrtime.bigint();
    const child = spawn(
      process.execPath,
      [
        "--require",
        rusagePreload,
        appPath,
        "bench",
        "bench",
        mode,
        `--runs=${runs}`,
        `--seed=${seed}`,
      ],
      {
        cwd: rootDir,
        env: { ...process.env, BENCH_RUSAGE_FILE: rusageFile },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    const pattern = callPatterns[mode];
    let calls = 0;
    let statsCalls = 0;
    let passed = false;
    createInterface({ input: child.stdout }).on("line", (raw) => {
      const line = stripVTControlCharacters(raw);
      if (pattern.call.test(line)) {
        calls++;
      }
      const stats = pattern.stats.exec(line);
      if (stats) {
        statsCalls += Number(stats[1]);
      }
      if (/^OK, (properties|invariants) passed/.test(line)) {
        passed = true;
      }
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk));

    child.on("close", (code) => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      const label = `rv ${mode} --runs=${runs}`;
      if (code !== 0 || !passed) {
        reject(new Error(`${label} failed:\n${stderr}`));
        return;
      }
      // Both counts come from rv's human-readable output, so a format change
      // shows up here as a mismatch instead of as wrong numbers.
      if (calls === 0 || calls !== statsCalls) {
        reject(
          new Error(
            `${label}: counted ${calls} call lines but the execution ` +
              `statistics report ${statsCalls}. Has rv's output format changed?`,
          ),
        );
        return;
      }
      const usage = readUsage();
      if (!usage) {
        reject(new Error(`${label}: no resource usage recorded.`));
        return;
      }
      resolve({
        ms,
        calls,
        cpuMs: usage.userMs + usage.systemMs,
        maxRssKb: usage.maxRssKb,
      });
    });
  });

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const measure = async (mode, runs) => {
  const samples = [];
  for (let i = 0; i < repeat; i++) {
    samples.push(await runOnce(mode, runs));
  }
  return {
    ms: median(samples.map((s) => s.ms)),
    min: Math.min(...samples.map((s) => s.ms)),
    max: Math.max(...samples.map((s) => s.ms)),
    cpuMs: median(samples.map((s) => s.cpuMs)),
    maxRssKb: median(samples.map((s) => s.maxRssKb)),
    // Same seed, so the call count is identical across repeats.
    calls: samples[0].calls,
  };
};

console.log(
  `node ${process.version}, ${process.platform}/${process.arch}, ` +
    `seed=${seed}, repeat=${repeat} (median reported)\n`,
);

const rows = [];
try {
  for (const mode of modes) {
    const baseline = await measure(mode, 1);
    rows.push({ mode, runs: 1, ...baseline, callsPerSec: null });
    for (const runs of runsList) {
      const result = await measure(mode, runs);
      const extraCalls = result.calls - baseline.calls;
      const extraMs = result.ms - baseline.ms;
      // Too few extra calls (or timing noise) makes the rate meaningless.
      const callsPerSec =
        extraCalls > 0 && extraMs > 0 ? (extraCalls / extraMs) * 1000 : null;
      rows.push({ mode, runs, ...result, callsPerSec });
    }
  }
} finally {
  rmSync(rusageDir, { recursive: true, force: true });
}

const fmt = (n, digits = 0) =>
  n === null
    ? "-"
    : n.toLocaleString("en-US", { maximumFractionDigits: digits });

console.table(
  rows.map((r) => ({
    mode: r.mode,
    runs: r.runs,
    calls: r.calls,
    "wall ms (median)": fmt(r.ms),
    "min..max ms": `${fmt(r.min)}..${fmt(r.max)}`,
    "calls/s (excl. startup)": fmt(r.callsPerSec),
    "cpu ms (usr+sys)": fmt(r.cpuMs),
    "cpu %": fmt((r.cpuMs / r.ms) * 100),
    "peak rss MB": fmt(r.maxRssKb / 1024, 1),
  })),
);
