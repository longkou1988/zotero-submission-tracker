const DEFAULT_STARTUP_DELAY_MS = 45 * 1000;
const DEFAULT_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;

export interface SchedulerDeps {
  listEligibleSubmissionIds(): Promise<number[]>;
  syncOne(submissionId: number, options?: { force?: boolean }): Promise<void>;
  setTimeout(callback: () => void, ms: number): number;
  clearTimeout(id: number): void;
  startupDelayMs?: number;
  syncIntervalMs?: number;
}

export class StatusSyncScheduler {
  private readonly deps: SchedulerDeps;
  private startupTimer: number | null = null;
  private regularTimer: number | null = null;
  private running: Promise<void> | null = null;
  private stopped = true;

  constructor(deps: SchedulerDeps) {
    this.deps = deps;
  }

  start(): void {
    if (!this.stopped) {
      return;
    }
    this.stopped = false;
    this.startupTimer = this.deps.setTimeout(() => {
      this.startupTimer = null;
      void this.syncIfDue().finally(() => this.scheduleNext());
    }, this.deps.startupDelayMs ?? DEFAULT_STARTUP_DELAY_MS);
  }

  stop(): void {
    this.stopped = true;
    if (this.startupTimer != null) {
      this.deps.clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }
    if (this.regularTimer != null) {
      this.deps.clearTimeout(this.regularTimer);
      this.regularTimer = null;
    }
  }

  syncIfDue(): Promise<void> {
    return this.runSingleFlight(false);
  }

  syncAllNow(): Promise<void> {
    return this.runSingleFlight(true);
  }

  private runSingleFlight(force: boolean): Promise<void> {
    if (this.running) {
      return this.running;
    }
    const run = this.runQueue(force);
    this.running = run.finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async runQueue(force: boolean): Promise<void> {
    const ids = await this.deps.listEligibleSubmissionIds();
    for (const submissionId of ids) {
      await this.deps.syncOne(submissionId, { force });
    }
  }

  private scheduleNext(): void {
    if (this.stopped || this.regularTimer != null) {
      return;
    }
    this.regularTimer = this.deps.setTimeout(() => {
      this.regularTimer = null;
      void this.syncIfDue().finally(() => this.scheduleNext());
    }, this.deps.syncIntervalMs ?? DEFAULT_SYNC_INTERVAL_MS);
  }
}
