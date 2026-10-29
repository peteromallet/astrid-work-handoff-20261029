/** Speed table for the direct journey (testing plan R-10: reported, never judged). */
import { cpus, loadavg } from 'node:os';

export interface MeasureRow {
  step: string;
  via: 'runtime' | 'door';
  reps: number;
  medianMs: number;
  p95Ms: number;
  megabytes?: number;
  mbPerSecond?: number;
}

export const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Nearest-rank percentile; with fewer than 20 samples p95 is the slowest sample. */
export const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
};

export class SpeedTable {
  readonly rows: MeasureRow[] = [];
  readonly loadStart = loadavg();
  private readonly startedAt = new Date().toISOString();

  async time(step: string, via: MeasureRow['via'], reps: number, work: (rep: number) => Promise<void>, bytes?: number): Promise<MeasureRow> {
    const samples: number[] = [];
    for (let rep = 0; rep < reps; rep++) {
      const t0 = performance.now();
      await work(rep);
      samples.push(performance.now() - t0);
    }
    const medianMs = median(samples);
    const row: MeasureRow = {
      step, via, reps, medianMs, p95Ms: percentile(samples, 95),
      ...(bytes ? { megabytes: bytes / 1024 / 1024, mbPerSecond: bytes / 1024 / 1024 / (medianMs / 1000) } : {}),
    };
    this.rows.push(row);
    return row;
  }

  render(): string {
    const lines = ['step                              via      reps  median ms    p95 ms    MB/s   door/runtime'];
    const steps = [...new Set(this.rows.map((row) => row.step))];
    for (const step of steps) {
      const runtime = this.rows.find((row) => row.step === step && row.via === 'runtime');
      const door = this.rows.find((row) => row.step === step && row.via === 'door');
      for (const row of [runtime, door]) {
        if (!row) continue;
        const ratio = row.via === 'door' && runtime ? `${(row.medianMs / runtime.medianMs).toFixed(2)}x` : '';
        lines.push(`${row.step.padEnd(33)} ${row.via.padEnd(8)} ${String(row.reps).padStart(4)}  ${row.medianMs.toFixed(1).padStart(9)} ${row.p95Ms.toFixed(1).padStart(9)} ${(row.mbPerSecond === undefined ? '' : row.mbPerSecond.toFixed(1)).padStart(7)}   ${ratio}`);
      }
    }
    const end = loadavg();
    lines.push(`machine: ${cpus().length} cpus, load average at start ${this.loadStart.map((v) => v.toFixed(2)).join(' ')}, at end ${end.map((v) => v.toFixed(2)).join(' ')}`);
    return lines.join('\n');
  }

  toJSON() {
    return { startedAt: this.startedAt, cpus: cpus().length, loadAverageStart: this.loadStart, loadAverageEnd: loadavg(), note: 'reported, never judged; p95 equals the slowest sample when reps < 20', rows: this.rows };
  }
}
