import * as vscode from "vscode";
import type { Change, Status } from "./git";
import * as logger from "./utils/logger";
import { matchesPattern, formatCommitMessage } from "./utils/patterns";
import { relativePath } from "./utils/paths";
import type { GitNoteConfig } from "./configService";
import type { IGitService } from "./types/gitService";
import type { WebChangeDetector } from "./webChangeDetector";

/**
 * Web-compatible Git service for github.dev.
 * Uses remoteHub.commit command for committing, which internally handles
 * both the GraphQL push and changeStore cleanup.
 */
export class WebGitService implements IGitService {
  private _branch: string | undefined;

  constructor(private readonly changeDetector: WebChangeDetector) {}

  get hasRemote(): boolean {
    // github.dev always has a remote
    return true;
  }

  get currentBranch(): string | undefined {
    return this._branch;
  }

  get hasConflicts(): boolean {
    return false;
  }

  get isRebasing(): boolean {
    return false;
  }

  get hasPendingPush(): boolean {
    return false;
  }

  hasChanges(config: GitNoteConfig): boolean {
    return this.getMatchingChanges(config).length > 0;
  }

  getMatchingChanges(config: GitNoteConfig): Change[] {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!workspaceRoot) {
      return [];
    }

    const changes: Change[] = [];
    for (const uriStr of this.changeDetector.pendingSaves) {
      const uri = vscode.Uri.parse(uriStr);
      if (config.filePattern === "**/*") {
        changes.push(this.createChange(uri));
      } else {
        const rel = relativePath(workspaceRoot, uri);
        if (matchesPattern(rel, config.filePattern)) {
          changes.push(this.createChange(uri));
        }
      }
    }
    for (const uriStr of this.changeDetector.pendingDeletions) {
      const uri = vscode.Uri.parse(uriStr);
      if (config.filePattern === "**/*") {
        changes.push(this.createChange(uri, 6 as Status)); // DELETED
      } else {
        const rel = relativePath(workspaceRoot, uri);
        if (matchesPattern(rel, config.filePattern)) {
          changes.push(this.createChange(uri, 6 as Status));
        }
      }
    }
    return changes;
  }

  async stageAndCommit(
    config: GitNoteConfig,
    changes: Change[],
  ): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!workspaceRoot) {
      throw new Error("No workspace folder found");
    }

    // Get repository context from remoteHub. Returns { uri, ref, name }
    // where ref is the current branch name.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repoContext = await vscode.commands.executeCommand<any>(
      "remoteHub.api.getRepositoryContext",
      workspaceRoot,
    );

    const branch = repoContext.ref as string;
    this._branch = branch;

    // Build commit message
    const files = changes.map((c) => relativePath(workspaceRoot, c.uri));
    const message = formatCommitMessage(
      config.commitMessageFormat,
      branch,
      files,
    );

    logger.info(`Web commit (${files.length} file(s)): ${files.join(", ")}`);

    // Construct a repository-like object with rootUri and inputBox.
    // remoteHub.commit reads inputBox.value as the commit message and
    // internally calls createAndPushCommit + changeStore.acceptAll,
    // so no separate sync/discard is needed.
    const repoArg = {
      ...repoContext,
      rootUri: workspaceRoot,
      inputBox: { value: message },
    };

    await vscode.commands.executeCommand("remoteHub.commit", repoArg);
    logger.info("remoteHub.commit completed successfully");
    this.changeDetector.clearPendingSaves();
  }

  async push(): Promise<void> {
    // No-op: remoteHub.commit pushes directly to remote
  }

  async pull(): Promise<void> {
    const commands = await vscode.commands.getCommands(true);

    if (commands.includes("remoteHub.pull")) {
      try {
        logger.info("Executing remoteHub.pull");
        await vscode.commands.executeCommand("remoteHub.pull");
        logger.info("remoteHub.pull completed");
      } catch (err) {
        logger.warn(`remoteHub.pull failed: ${err}`);
        throw err;
      }
    } else {
      logger.warn("remoteHub.pull not available in web mode");
    }
  }

  cancelRetry(): void {
    // No-op: no retry mechanism in web mode
  }

  // --- Private helpers ---

  private createChange(
    uri: vscode.Uri,
    status: Status = 5 as Status,
  ): Change {
    return {
      uri,
      originalUri: uri,
      renameUri: undefined,
      status, // Status.MODIFIED = 5, Status.DELETED = 6
    };
  }

  dispose(): void {
    // No resources to dispose
  }
}
