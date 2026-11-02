// Preloaded into each `rv` child process by `bench/run.mjs` (via `--require`).
// On exit, writes the process's resource usage to the file named by
// `BENCH_RUSAGE_FILE`. `process.resourceUsage()` covers every thread in the
// process, so the CPU time includes the clarinet-sdk WASM work.

const { writeFileSync } = require("node:fs");

const target = process.env.BENCH_RUSAGE_FILE;

if (target) {
  process.on("exit", () => {
    const { userCPUTime, systemCPUTime, maxRSS } = process.resourceUsage();
    writeFileSync(
      target,
      JSON.stringify({
        userMs: userCPUTime / 1000,
        systemMs: systemCPUTime / 1000,
        maxRssKb: maxRSS,
      }),
    );
  });
}
