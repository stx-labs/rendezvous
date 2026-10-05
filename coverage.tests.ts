import { EventEmitter } from "node:events";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { getSDK, initSimnet } from "@stacks/clarinet-sdk";
import fc from "fast-check";

import { main } from "./app";
import { CoverageTracker, observedAsyncProperty } from "./coverage";
import { createIsolatedTestEnvironment } from "./test.utils";

const record = (file: string, rows: string[]) =>
  [`SF:${file}`, ...rows, "end_of_record"].join("\n");

describe("LCOV aggregation", () => {
  it("counts positive hits only, including '-' as an unhit branch", () => {
    const tracker = new CoverageTracker();
    const novel = tracker.ingest(
      record("a.clar", [
        "DA:1,0",
        "DA:2,5",
        "DA:3,0,checksum",
        "BRDA:2,0,0,0",
        "BRDA:2,0,1,-",
        "BRDA:2,1,0,7",
        // Advertised totals cannot turn a zero-hit record into coverage.
        "LH:999",
        "BRH:999",
        "LF:999",
        "BRF:999",
      ]),
    );
    expect(novel).toStrictEqual([
      '["a.clar","line",2]',
      '["a.clar","branch",2,1,0]',
    ]);
    expect(tracker.summary()).toMatchObject({
      lines: { hit: 1, total: 3 },
      branches: { hit: 1, total: 3 },
    });
  });

  it("distinguishes files and blocks and deduplicates repeated hits", () => {
    const tracker = new CoverageTracker();
    const report =
      record("a.clar", ["DA:2,1", "BRDA:2,0,0,1", "BRDA:2,1,0,1"]) +
      "\n" +
      record("b.clar", ["DA:2,1", "BRDA:2,0,0,1"]);
    expect(tracker.ingest(report)).toHaveLength(5);
    expect(tracker.ingest(report)).toEqual([]);
    expect(tracker.summary()).toMatchObject({
      lines: { hit: 2, total: 2 },
      branches: { hit: 3, total: 3 },
    });
    expect(tracker.toLcov()).toContain("DA:2,2\n");
    expect(tracker.toLcov()).toContain("BRDA:2,1,0,2\n");
  });

  it("keeps reused block and branch IDs on separate lines distinct", () => {
    const tracker = new CoverageTracker();
    expect(
      tracker.ingest(record("a.clar", ["BRDA:2,0,0,1", "BRDA:9,0,0,0"])),
    ).toEqual(['["a.clar","branch",2,0,0]']);
    expect(tracker.ingest(record("a.clar", ["BRDA:9,0,0,3"]))).toEqual([
      '["a.clar","branch",9,0,0]',
    ]);
    expect(tracker.summary().branches).toEqual({ hit: 2, total: 2 });
    expect(tracker.toLcov()).toContain("BRDA:2,0,0,1\n");
    expect(tracker.toLcov()).toContain("BRDA:9,0,0,3\n");
  });

  it("ignores invalid records and rows outside a source file", () => {
    const tracker = new CoverageTracker();
    tracker.ingest(
      "DA:1,10\n" +
        record("a.clar", [
          "DA:0,4",
          "DA:2,-1",
          "DA:3,-",
          "DA:4,1.5",
          "DA:5,NaN",
          "DA:6,1,checksum,extra",
          "BRDA:0,0,0,4",
          "BRDA:2,x,0,4",
          "BRDA:2,0,0,NaN",
          "BRDA:2,0,0,-1",
          "BRDA:2,0,0,1,extra",
          "DA:10,1",
          "BRDA:10,0,0,1",
        ]) +
        "\nBRDA:10,1,0,8",
    );
    expect(tracker.summary()).toMatchObject({
      lines: { hit: 1, total: 1 },
      branches: { hit: 1, total: 1 },
    });
  });

  it("keeps coverage increases, the final point and plateau time", () => {
    let now = 100;
    const tracker = new CoverageTracker(() => now);
    const reports = [
      record("a.clar", ["DA:1,0", "DA:2,1"]),
      "",
      record("a.clar", ["DA:1,3"]),
      "",
    ];
    const free = vi.fn();
    const simnet = {
      collectReport: vi.fn(() => ({ coverage: reports.shift()!, free })),
    };
    const sdk = simnet as unknown as Parameters<typeof tracker.sample>[0];
    for (const time of [110, 120, 130, 140]) {
      now = time;
      tracker.sample(sdk);
    }
    now = 150;
    const summary = tracker.summary();
    expect(summary.lastIncreaseMs).toBe(30);
    expect(summary.evaluations).toBe(4);
    expect(summary.curve.map((p) => p.elapsedMs)).toEqual([10, 30, 50]);
    expect(summary.curve.map((p) => p.lines.hit)).toEqual([1, 2, 2]);
    expect(free).toHaveBeenCalledTimes(4);
    expect(simnet.collectReport).toHaveBeenCalledWith(false, "");
  });

  it("round trips LCOV including never-taken branches", () => {
    const tracker = new CoverageTracker();
    tracker.ingest(record("a.clar", ["DA:1,0", "BRDA:1,0,0,-"]));
    tracker.ingest(record("a.clar", ["DA:1,5", "BRDA:1,0,1,7"]));
    const replay = new CoverageTracker();
    replay.ingest(tracker.toLcov());
    expect(replay.summary().files).toEqual(tracker.summary().files);
    expect(tracker.toLcov()).toContain("BRDA:1,0,0,-");
    expect(tracker.toLcov()).toContain("BRF:2\nBRH:1");
  });
});

describe("Evaluation observer", () => {
  it("preserves candidates without adding hooks by default", async () => {
    const radio = new EventEmitter();
    const observed: number[] = [];
    const stock: number[] = [];
    const afterEach = vi.spyOn(
      Object.getPrototypeOf(fc.asyncProperty(fc.constant(1), async () => {})),
      "afterEach",
    );
    await fc.assert(
      observedAsyncProperty(radio)(fc.integer(), async (value) => {
        observed.push(value);
      }),
      { seed: 42, numRuns: 25 },
    );
    expect(afterEach).not.toHaveBeenCalled();
    afterEach.mockRestore();
    await fc.assert(
      fc.asyncProperty(fc.integer(), async (value) => {
        stock.push(value);
      }),
      { seed: 42, numRuns: 25 },
    );
    expect(observed).toEqual(stock);
  });

  it("notifies on passing, failing and shrink evaluations", async () => {
    const radio = new EventEmitter();
    const completed = vi.fn();
    radio.on("runComplete", completed);
    let evaluations = 0;
    const result = await fc.check(
      observedAsyncProperty(radio)(
        fc.integer({ min: 1, max: 1000 }),
        async () => {
          evaluations++;
          return false;
        },
      ),
      { seed: 42 },
    );
    expect(result.failed).toBe(true);
    expect(result.numShrinks).toBeGreaterThan(0);
    expect(completed).toHaveBeenCalledTimes(evaluations);
    await fc.assert(
      observedAsyncProperty(radio)(fc.constant(1), async () => {
        evaluations++;
      }),
      { numRuns: 3 },
    );
    expect(completed).toHaveBeenCalledTimes(evaluations);
  });
});

describe("SDK coverage reports", () => {
  it("drains deltas and keeps totals across a session reset", async () => {
    const simnet = await getSDK({ trackCosts: false, trackCoverage: true });
    const project = createIsolatedTestEnvironment(
      resolve(__dirname, "example"),
      "rendezvous-coverage-sdk-",
    );
    const manifestPath = join(project, "Clarinet.toml");
    await simnet.initSession(process.cwd(), manifestPath, null);
    const tracker = new CoverageTracker();
    tracker.collect(simnet);
    simnet.callPublicFn("counter", "increment", [], simnet.deployer);
    expect(tracker.collect(simnet)).toContain(
      JSON.stringify([join(project, "contracts/counter.clar"), "line", 16]),
    );
    const empty = simnet.collectReport(false, "");
    expect(empty.coverage).toBe("");
    empty.free();
    const before = tracker.summary().lines.hit;
    await simnet.initSession(process.cwd(), manifestPath, null);
    tracker.collect(simnet);
    simnet.callPublicFn("counter", "decrement", [], simnet.deployer);
    expect(tracker.collect(simnet).length).toBeGreaterThan(0);
    expect(tracker.summary().lines.hit).toBeGreaterThan(before);
    // The SDK session is a Proxy; let its target's finalizer release it.
    rmSync(project, { recursive: true, force: true });
  });
});

describe("CLI coverage", () => {
  it.each([
    ["reverse", "test"],
    ["counter", "invariant"],
  ])(
    "preserves seeded %s %s calls and saves coverage",
    async (contract, type) => {
      const project = createIsolatedTestEnvironment(
        resolve(__dirname, "example"),
        "rendezvous-coverage-cli-",
      );
      const initialArgv = process.argv;
      const logs: string[] = [];
      const log = vi.spyOn(console, "log").mockImplementation((value) => {
        logs.push(String(value));
      });
      const jsonPath = join(project, "coverage.json");
      const lcovPath = join(project, "coverage.lcov");
      const configPath = join(project, "rv.coverage-test.json");
      const initial = await initSimnet(join(project, "Clarinet.toml"));
      // SDK account-map order varies between fresh instances. Freeze the
      // caller pool with the existing config API to compare seeded calls.
      const config = {
        seed: 42,
        runs: 10,
        bail: true,
        accounts: [...initial.getAccounts()]
          .filter(([name]) => name !== "faucet")
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([name, address]) => ({ name, address })),
      };
      const argv = [
        "node",
        "app.js",
        project,
        contract,
        type,
        `--config=${configPath}`,
      ];
      try {
        writeFileSync(configPath, JSON.stringify(config));
        process.argv = argv;
        await main();
        const stock = logs.filter((line) => line.startsWith("₿"));
        expect(logs.some((line) => line.startsWith("Coverage:"))).toBe(false);
        logs.length = 0;
        writeFileSync(
          configPath,
          JSON.stringify({
            ...config,
            coverage: true,
            coverage_json: jsonPath,
            coverage_lcov: lcovPath,
          }),
        );
        await main();
        expect(logs.filter((line) => line.startsWith("₿"))).toEqual(stock);
        // Only files the run reached are listed under the totals.
        expect(
          logs.find((line) => line.startsWith(`  contracts/${contract}.clar:`)),
        ).toMatch(/: [1-9]\d*\/\d+ lines, \d+\/\d+ branches$/);
        expect(
          logs.some((line) => line.startsWith("  contracts/cargo.clar:")),
        ).toBe(false);
        const report = JSON.parse(readFileSync(jsonPath, "utf8"));
        expect(report.evaluations).toBe(10);
        expect(report.lines.hit).toBeGreaterThan(0);
        expect(report.branches.hit).toBeGreaterThanOrEqual(0);
        expect(report.branches.total).toBeGreaterThan(0);
        expect(report.lines.total).toBeGreaterThan(report.lines.hit);
        const replay = new CoverageTracker();
        replay.ingest(readFileSync(lcovPath, "utf8"));
        expect(replay.summary().files).toEqual(report.files);
      } finally {
        process.argv = initialArgv;
        log.mockRestore();
        await initSimnet(join(project, "Clarinet.toml"), true, {
          trackCosts: false,
          trackCoverage: false,
        });
        rmSync(project, { recursive: true, force: true });
      }
    },
  );
});
