import * as vscode from "vscode";
import type { Repository } from "./git";
import type { IGitService } from "./types/gitService";
import type { IChangeDetector } from "./types/changeDetector";
import { ConfigService, type GitNoteConfig } from "./configService";
import { debounce, type DebouncedFunction } from "./utils/debounce";
import * as logger from "./utils/logger";

export type CoordinatorState =
  | "idle"
  | "watching"
  | "committing"
  | "pushing"
  | "pulling"
  | "error"
  | "paused";

export interface CoordinatorOptions {
  /** Pass Repository to enable onDidCommit/onDidCheckout listeners, pull, branch exclusion, conflict detection */
  repository?: Repository;
}

export class OperationCoordinator implements vscode.Disposable {
  private readonly _onDidChangeState =
    new vscode.EventEmitter<CoordinatorState>();
  readonly onDidChangeState = this._onDidChangeState.event;

  private readonly _onDidTickCountdown = new vscode.EventEmitter<number>();
  readonly onDidTickCountdown = this._onDidTickCountdown.event;

  private readonly gitService: IGitService;
  private readonly changeDetector: IChangeDetector;
  private readonly repository: Repository | undefined;
  private debouncedCommit: DebouncedFunction<() => void>;
  private countdownTimer: ReturnType<typeof setInterval> | undefined;

  private state: CoordinatorState = "idle";
  private locked = false;
  private isOwnCommit = false;
  private lastActivityTime = Date.now();
  private lastWindowFocusTime = Date.now();
  private config: GitNoteConfig;
  private disposables: vscode.Disposable[] = [];

  constructor(
    gitService: IGitService,
    changeDetector: IChangeDetector,
    private readonly configService: ConfigService,
    options?: CoordinatorOptions,
  ) {
    this.config = configService.get();
    this.gitService = gitService;
    this.changeDetector = changeDetector;
    this.repository = options?.repository;

    this.debouncedCommit = debounce(() => this.executeCommitPipeline(), this.config.commitDelay);

    // Listen for detected changes
    this.disposables.push(
      this.changeDetector.onDidDetectChange(() => {
        this.onChangeDetected();
      }),
    );

    // Repository-specific listeners (desktop only)
    if (this.repository) {
      // Listen for manual commits by user (to avoid re-triggering)
      this.disposables.push(
        this.repository.onDidCommit(() => {
          if (this.isOwnCommit) {
            this.isOwnCommit = false;
            return;
          }
          logger.info("External commit detected, resetting debounce");
          this.debouncedCommit.cancel();
        }),
      );

      // Listen for branch checkout (cancel pending operations)
      this.disposables.push(
        this.repository.onDidCheckout(() => {
          logger.info("Branch checkout detected, cancelling pending operations");
          this.debouncedCommit.cancel();
          this.gitService.cancelRetry();
          this.checkBranchExclusion();
        }),
      );
    }

    // Listen for config changes
    this.disposables.push(
      configService.onDidChange((newConfig) => {
        this.onConfigChanged(newConfig);
      }),
    );

    // Track user activity for idle detection
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(() => {
        this.lastActivityTime = Date.now();
      }),
    );
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => {
        this.lastActivityTime = Date.now();
      }),
    );

    // Track window focus for pull-on-idle
    this.disposables.push(
      vscode.window.onDidChangeWindowState((e) => {
        this.onWindowStateChanged(e);
      }),
    );
  }

  get currentState(): CoordinatorState {
    return this.state;
  }

  private get supportsFullGit(): boolean {
    return this.repository !== undefined;
  }

  async start(): Promise<void> {
    this.config = this.configService.get();
    if (!this.config.enabled) {
      return;
    }

    await this.gitService.fetchBranch();
    if (this.isBranchExcluded()) {
      logger.info(
        `Branch '${this.gitService.currentBranch}' is excluded, pausing`,
      );
      this.setState("paused");
      return;
    }

    this.setState("watching");
    logger.info("GitNote started");

    // Pull on startup if configured
    if (this.config.pullOnStartup && this.gitService.hasRemote) {
      await this.executePull();
    }
  }

  stop(): void {
    this.debouncedCommit.cancel();
    this.stopCountdown();
    this.gitService.cancelRetry();
    this.setState("idle");
    logger.info("GitNote stopped");
  }

  async syncNow(): Promise<void> {
    logger.info("Sync Now triggered");
    if (this.locked) {
      logger.warn("Operation in progress, skipping sync");
      return;
    }

    this.debouncedCommit.cancel();
    this.stopCountdown();

    if (this.gitService.hasRemote) {
      await this.executePull();
    }

    const changes = this.gitService.getMatchingChanges(this.config);
    if (changes.length === 0) {
      logger.info("Sync Now: No pending changes to commit");
      return;
    }

    await this.executeCommitPipeline();
  }

  async flushOnClose(): Promise<void> {
    if (!this.config.enabled || !this.config.commitOnClose) {
      return;
    }

    // Cancel debounce and commit immediately
    this.debouncedCommit.cancel();

    const changes = this.gitService.getMatchingChanges(this.config);
    if (changes.length === 0) {
      return;
    }

    logger.info("Committing pending changes on close");
    try {
      await this.acquireLock();
      this.isOwnCommit = true;
      await this.gitService.stageAndCommit(this.config, changes);
      // Best-effort push on close
      if (this.config.autoPush) {
        try {
          await this.gitService.push();
        } catch {
          logger.warn("Push on close failed (best-effort)");
        }
      }
    } catch (err) {
      logger.error("Commit on close failed", err);
    } finally {
      this.releaseLock();
    }
  }

  private onWindowStateChanged(e: vscode.WindowState): void {
    if (!this.config.pullAfterIdle) {
      return;
    }

    if (!e.focused) {
      logger.info("Window lost focus, idle timer started");
      return;
    }

    const now = Date.now();
    const idleDuration = now - this.lastActivityTime;
    const timeSinceLastFocus = now - this.lastWindowFocusTime;

    this.lastWindowFocusTime = now;

    // Skip if we just regained focus recently (prevent duplicate pulls)
    const MIN_FOCUS_INTERVAL = 10000; // 10 seconds
    if (timeSinceLastFocus < MIN_FOCUS_INTERVAL) {
      return;
    }

    if (idleDuration >= this.config.idleThreshold) {
      logger.info(
        `Window regained focus after ${Math.round(idleDuration / 1000)}s idle, pulling`,
      );
      // Reset activity time to prevent onChangeDetected pullAfterIdle from also triggering
      this.lastActivityTime = Date.now();
      void this.executePullOnFocus();
    }
  }

  private async executePullOnFocus(): Promise<void> {
    if (this.locked) {
      return;
    }

    if (this.state !== "watching" && this.state !== "idle") {
      logger.info(`Skipping pull-on-focus, current state: ${this.state}`);
      return;
    }

    if (!this.gitService.hasRemote) {
      return;
    }

    await this.executePull();
  }

  private onChangeDetected(): void {
    if (this.state !== "watching") {
      return;
    }

    // Idle detection: if pull after idle is enabled, check if we were idle
    if (this.config.pullAfterIdle) {
      const idleDuration = Date.now() - this.lastActivityTime;
      if (idleDuration >= this.config.idleThreshold) {
        logger.info(
          `Idle for ${Math.round(idleDuration / 1000)}s, pulling before processing`,
        );
        this.lastActivityTime = Date.now();
        this.executePull().then(() => {
          this.debouncedCommit();
          this.startCountdown();
        });
        return;
      }
    }

    this.lastActivityTime = Date.now();
    this.debouncedCommit();
    this.startCountdown();
  }

  private async executeCommitPipeline(): Promise<void> {
    this.stopCountdown();
    if (!this.config.enabled || this.state === "paused" || this.state === "idle") {
      return;
    }

    if (this.locked) {
      // Reschedule if locked
      logger.info("Locked, rescheduling commit");
      this.debouncedCommit();
      return;
    }

    // Safety checks (desktop only)
    if (this.supportsFullGit) {
      if (this.gitService.hasConflicts) {
        this.handleConflicts();
        return;
      }
      if (this.gitService.isRebasing) {
        logger.warn("Rebase in progress, skipping auto-commit");
        this.setState("paused");
        return;
      }
      if (this.isBranchExcluded()) {
        return;
      }
    }

    const changes = this.gitService.getMatchingChanges(this.config);
    if (changes.length === 0) {
      return;
    }

    try {
      await this.acquireLock();
      this.setState("committing");

      this.isOwnCommit = true;
      await this.gitService.stageAndCommit(this.config, changes);

      if (this.config.autoPush && this.supportsFullGit) {
        this.setState("pushing");
        await this.gitService.push();
      }

      this.setState("watching");

      // Check for new changes that arrived during commit
      const newChanges = this.gitService.getMatchingChanges(this.config);
      if (newChanges.length > 0) {
        logger.info("New changes detected during commit, rescheduling");
        this.debouncedCommit();
      }
    } catch (err) {
      const detail =
        err instanceof Error
          ? `${err.message}${err.stack ? `\n${err.stack}` : ""}`
          : String(err);
      logger.error(`Commit pipeline failed: ${detail}`);
      this.setState("error");
      // Recover to watching after a short delay
      setTimeout(() => {
        if (this.state === "error") {
          this.setState("watching");
        }
      }, 5000);
    } finally {
      this.releaseLock();
    }
  }

  private async executePull(): Promise<void> {
    if (this.locked) {
      logger.warn("Locked, skipping pull");
      return;
    }
    if (!this.gitService.hasRemote) {
      return;
    }

    try {
      await this.acquireLock();
      this.setState("pulling");
      await this.gitService.pull();
      if (this.config.enabled && !this.isBranchExcluded()) {
        this.setState("watching");
      }
    } catch (err) {
      logger.error("Pull failed", err);
      if (this.gitService.hasConflicts) {
        this.handleConflicts();
      } else {
        this.setState("error");
        setTimeout(() => {
          if (this.state === "error") {
            this.setState("watching");
          }
        }, 5000);
      }
    } finally {
      this.releaseLock();
    }
  }

  private handleConflicts(): void {
    if (this.config.conflictBehavior === "pause") {
      logger.warn("Merge conflicts detected, pausing automation");
      this.setState("paused");
      vscode.window.showWarningMessage(
        "GitNote: Merge conflicts detected. Auto-commit is paused until conflicts are resolved.",
      );
    } else {
      logger.warn("Merge conflicts detected, notifying user");
      this.setState("watching");
      vscode.window.showWarningMessage(
        "GitNote: Merge conflicts detected. Please resolve them manually.",
      );
    }
  }

  private isBranchExcluded(): boolean {
    const branch = this.gitService.currentBranch;
    if (!branch) {
      return false;
    }
    return this.config.excludeBranches.includes(branch);
  }

  private checkBranchExclusion(): void {
    if (this.isBranchExcluded()) {
      logger.info(
        `Branch '${this.gitService.currentBranch}' is excluded, pausing`,
      );
      this.setState("paused");
    } else if (this.state === "paused" && this.config.enabled) {
      // Resume if we switched away from an excluded branch
      this.setState("watching");
    }
  }

  private onConfigChanged(newConfig: GitNoteConfig): void {
    const wasEnabled = this.config.enabled;
    this.config = newConfig;

    // Recreate debounce with new delay
    this.debouncedCommit.cancel();
    this.debouncedCommit = debounce(
      () => this.executeCommitPipeline(),
      newConfig.commitDelay,
    );

    // Update change detector
    this.changeDetector.updateFilePattern(newConfig.filePattern);

    if (!wasEnabled && newConfig.enabled) {
      this.start();
    } else if (wasEnabled && !newConfig.enabled) {
      this.stop();
    }
  }

  private startCountdown(): void {
    this.stopCountdown();
    this.countdownTimer = setInterval(() => {
      const remaining = this.debouncedCommit.remainingMs();
      if (remaining > 0) {
        this._onDidTickCountdown.fire(Math.ceil(remaining / 1000));
      } else {
        this.stopCountdown();
      }
    }, 1000);
    // Fire immediately
    const remaining = this.debouncedCommit.remainingMs();
    if (remaining > 0) {
      this._onDidTickCountdown.fire(Math.ceil(remaining / 1000));
    }
  }

  private stopCountdown(): void {
    if (this.countdownTimer !== undefined) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = undefined;
    }
    this._onDidTickCountdown.fire(0);
  }

  private async acquireLock(): Promise<void> {
    // Simple lock: wait if locked
    while (this.locked) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    this.locked = true;
  }

  private releaseLock(): void {
    this.locked = false;
  }

  private setState(newState: CoordinatorState): void {
    if (this.state !== newState) {
      this.state = newState;
      this._onDidChangeState.fire(newState);
    }
  }

  dispose(): void {
    this.debouncedCommit.cancel();
    this.stopCountdown();
    this.gitService.dispose();
    this.changeDetector.dispose();
    this._onDidChangeState.dispose();
    this._onDidTickCountdown.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
