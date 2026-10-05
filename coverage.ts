import type { EventEmitter } from "node:events";
import { performance } from "node:perf_hooks";

import type { Simnet } from "@stacks/clarinet-sdk";
import fc from "fast-check";

/** Attach an evaluation hook only when a runner opts into observing it. */
export const observedAsyncProperty =
  (radio: EventEmitter): typeof fc.asyncProperty =>
  (...args) => {
    const property = fc.asyncProperty(...args);
    if (radio.listenerCount("runComplete") > 0) {
      property.afterEach(() => {
        radio.emit("runComplete");
      });
    }
    return property;
  };

export interface CoverageCounts {
  lines: { hit: number; total: number };
  branches: { hit: number; total: number };
}

export interface CoveragePoint extends CoverageCounts {
  elapsedMs: number;
  evaluations: number;
}

interface Branch {
  line: number;
  block: number;
  branch: number;
  hits: number | null;
}

interface FileCoverage {
  lines: Map<number, number>;
  branches: Map<string, Branch>;
}

const integer = (value: string): number | undefined => {
  if (!/^\d+$/.test(value)) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
};

const counts = (file: FileCoverage): CoverageCounts => ({
  lines: {
    hit: [...file.lines.values()].filter((hits) => hits > 0).length,
    total: file.lines.size,
  },
  branches: {
    hit: [...file.branches.values()].filter((b) => (b.hits ?? 0) > 0).length,
    total: file.branches.size,
  },
});

/**
 * Aggregates drained SDK LCOV reports. Only positive hits count as coverage.
 * Identities include the file and line, or file, line, block and branch.
 */
export class CoverageTracker {
  private readonly files = new Map<string, FileCoverage>();
  private readonly hitIds = new Set<string>();
  private readonly curve: CoveragePoint[] = [];
  private readonly started: number;
  private readonly now: () => number;
  private evaluations = 0;
  private lastIncreaseMs: number | null = null;

  constructor(now: () => number = () => performance.now()) {
    this.now = now;
    this.started = now();
  }

  /** Returns the stable IDs hit for the first time in this report. */
  ingest(lcov: string): string[] {
    const novel: string[] = [];
    let fileName: string | undefined = undefined;
    const hit = (id: string, hits: number | null) => {
      if ((hits ?? 0) > 0 && !this.hitIds.has(id)) {
        this.hitIds.add(id);
        novel.push(id);
      }
    };

    for (const row of lcov.split(/\r?\n/)) {
      if (row.startsWith("SF:")) {
        fileName = row.slice(3) || undefined;
        if (fileName && !this.files.has(fileName)) {
          this.files.set(fileName, { lines: new Map(), branches: new Map() });
        }
      } else if (row === "end_of_record") {
        fileName = undefined;
      } else if (fileName && row.startsWith("DA:")) {
        const fields = row.slice(3).split(",");
        if (fields.length < 2 || fields.length > 3) {
          continue;
        }
        const [lineText, hitsText] = fields;
        const line = integer(lineText);
        const hits = integer(hitsText);
        if (line === undefined || line < 1 || hits === undefined) {
          continue;
        }
        const file = this.files.get(fileName)!;
        file.lines.set(line, (file.lines.get(line) ?? 0) + hits);
        hit(JSON.stringify([fileName, "line", line]), hits);
      } else if (fileName && row.startsWith("BRDA:")) {
        const fields = row.slice(5).split(",");
        if (fields.length !== 4) {
          continue;
        }
        const [line, block, branch] = fields.slice(0, 3).map(integer);
        const hits = fields[3] === "-" ? null : integer(fields[3]);
        if (
          line === undefined ||
          line < 1 ||
          block === undefined ||
          branch === undefined ||
          hits === undefined
        ) {
          continue;
        }
        const file = this.files.get(fileName)!;
        const key = JSON.stringify([line, block, branch]);
        const previous = file.branches.get(key)?.hits;
        file.branches.set(key, {
          line,
          block,
          branch,
          hits: hits === null ? (previous ?? null) : (previous ?? 0) + hits,
        });
        hit(JSON.stringify([fileName, "branch", line, block, branch]), hits);
      }
    }
    if (novel.length > 0) {
      this.lastIncreaseMs = this.elapsedMs();
    }
    return novel;
  }

  /** collectReport drains coverage; preserve every delta before a reset. */
  collect(simnet: Pick<Simnet, "collectReport">): string[] {
    const report = simnet.collectReport(false, "");
    try {
      return this.ingest(report.coverage);
    } finally {
      report.free();
    }
  }

  /**
   * Sample after a completed candidate, including failures and shrinking.
   * Store increases only, bounding curve size by the coverage identities.
   */
  sample(simnet: Pick<Simnet, "collectReport">): string[] {
    this.evaluations++;
    const novel = this.collect(simnet);
    if (novel.length > 0 || this.curve.length === 0) {
      this.curve.push(this.point());
    }
    return novel;
  }

  private elapsedMs(): number {
    return this.now() - this.started;
  }

  private point(): CoveragePoint {
    const totals: CoverageCounts = {
      lines: { hit: 0, total: 0 },
      branches: { hit: 0, total: 0 },
    };
    for (const file of this.files.values()) {
      const found = counts(file);
      totals.lines.hit += found.lines.hit;
      totals.lines.total += found.lines.total;
      totals.branches.hit += found.branches.hit;
      totals.branches.total += found.branches.total;
    }
    return {
      elapsedMs: this.elapsedMs(),
      evaluations: this.evaluations,
      ...totals,
    };
  }

  summary() {
    const final = this.point();
    return {
      ...final,
      lastIncreaseMs: this.lastIncreaseMs,
      files: [...this.files]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([file, coverage]) => ({ file, ...counts(coverage) })),
      curve: [...this.curve, final],
    };
  }

  /** Writes merged line and branch records, with accurate derived totals. */
  toLcov(): string {
    const records: string[] = [];
    for (const [fileName, file] of [...this.files].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const total = counts(file);
      records.push("TN:", `SF:${fileName}`);
      for (const [line, hits] of [...file.lines].sort(([a], [b]) => a - b)) {
        records.push(`DA:${line},${hits}`);
      }
      records.push(`LF:${total.lines.total}`, `LH:${total.lines.hit}`);
      for (const branch of [...file.branches.values()].sort(
        (a, b) => a.line - b.line || a.block - b.block || a.branch - b.branch,
      )) {
        const key = `${branch.line},${branch.block},${branch.branch}`;
        records.push(`BRDA:${key},${branch.hits ?? "-"}`);
      }
      records.push(
        `BRF:${total.branches.total}`,
        `BRH:${total.branches.hit}`,
        "end_of_record",
      );
    }
    return records.length > 0 ? records.join("\n") + "\n" : "";
  }
}
