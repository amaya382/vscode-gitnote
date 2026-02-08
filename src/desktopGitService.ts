import * as vscode from "vscode";
import type { Repository, Change } from "./git";
import * as logger from "./utils/logger";
import { matchesPattern, formatCommitMessage } from "./utils/patterns";
import { relativePath } from "./utils/paths";
import type { GitNoteConfig } from "./configService";
import type { IGitService } from "./types/gitService";

const MAX_RETRIES = 3;
const BASE_RETRY_DELAY = 30000;

export class DesktopGitService implements IGitService {
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private pendingPush = false;

  constructor(private readonly repository: Repository) {}

  get hasRemote(): boolean {
    return this.repository.state.remotes.length > 0;
  }

  get currentBranch(): string | undefined {
    return this.repository.state.HEAD?.name;
  }

  get hasConflicts(): boolean {
    return this.repository.state.mergeChanges.length > 0;
  }

  get isRebasing(): boolean {
    return this.repository.state.rebaseCommit !== undefined;
  }

  private relativeToRepo(uri: vscode.Uri): string {
    return relativePath(this.repository.rootUri, uri);
  }

  hasChanges(config: GitNoteConfig): boolean {
    return this.getMatchingChanges(config).length > 0;
  }

  getMatchingChanges(config: GitNoteConfig): Change[] {
    const untrackedChanges = this.repository.state.untrackedChanges ?? [];
    const allChanges = [
      ...this.repository.state.workingTreeChanges,
      ...untrackedChanges,
    ];

    if (config.filePattern === "**/*") {
      return allChanges;
    }

    return allChanges.filter((change) => {
      const relativePath = this.relativeToRepo(change.uri);
      return matchesPattern(relativePath, config.filePattern);
    });
  }

  private isAllFilesMatch(config: GitNoteConfig): boolean {
    if (config.filePattern === "**/*") {
      return true;
    }
    const untrackedChanges = this.repository.state.untrackedChanges ?? [];
    const allChanges = [
      ...this.repository.state.workingTreeChanges,
      ...untrackedChanges,
    ];
    const matching = this.getMatchingChanges(config);
    return matching.length === allChanges.length;
  }

  async stageAndCommit(config: GitNoteConfig, changes: Change[]): Promise<void> {
    const branch = this.currentBranch ?? "unknown";
    const files = changes.map((c) => this.relativeToRepo(c.uri));
    const message = formatCommitMessage(
      config.commitMessageFormat,
      branch,
      files,
    );

    if (this.isAllFilesMatch(config)) {
      // All changes match the pattern — use commit --all (no explicit add needed)
      logger.info(
        `Committing all changes (${files.length} file(s)): ${files.join(", ")}`,
      );
      await this.repository.commit(message, { all: true });
    } else {
      // Only a subset matches — need to stage specific files first
      const uris = changes.map((c) => vscode.Uri.file(c.uri.fsPath));
      logger.info(
        `Staging ${uris.length} file(s): ${files.join(", ")}`,
      );
      await this.repository.add(uris);
      logger.info(`Staged, committing...`);
      await this.repository.commit(message);
    }

    logger.info(`Committed: ${message}`);
  }

  async push(): Promise<void> {
    if (!this.hasRemote) {
      logger.info("No remote configured, skipping push");
      return;
    }
    await this.pushWithRetry(0);
  }

  private async pushWithRetry(attempt: number): Promise<void> {
    try {
      await this.repository.push();
      this.pendingPush = false;
      logger.info("Pushed to remote");
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        const delay = BASE_RETRY_DELAY * Math.pow(2, attempt);
        logger.warn(
          `Push failed (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${delay / 1000}s`,
        );
        this.pendingPush = true;
        this.retryTimer = setTimeout(() => {
          this.retryTimer = undefined;
          this.pushWithRetry(attempt + 1);
        }, delay);
      } else {
        this.pendingPush = false;
        logger.error("Push failed after all retries", err);
        vscode.window.showWarningMessage(
          `GitNote: Push failed after ${MAX_RETRIES} retries. Manual push may be required.`,
        );
      }
    }
  }

  async pull(): Promise<void> {
    if (!this.hasRemote) {
      logger.info("No remote configured, skipping pull");
      return;
    }
    try {
      await this.repository.pull();
      logger.info("Pulled from remote");
    } catch (err) {
      logger.error("Pull failed", err);
      throw err;
    }
  }

  async fetchBranch(): Promise<void> {
    // No-op: desktop branch is always available via repository.state.HEAD
  }

  cancelRetry(): void {
    if (this.retryTimer !== undefined) {
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
      this.pendingPush = false;
    }
  }

  get hasPendingPush(): boolean {
    return this.pendingPush;
  }

  dispose(): void {
    this.cancelRetry();
  }
}
