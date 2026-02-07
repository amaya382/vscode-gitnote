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
 * Uses vscode.commands.executeCommand('remoteHub.commit') for committing.
 * In github.dev, commit and push are an atomic operation.
 */
export class WebGitService implements IGitService {
  constructor(private readonly changeDetector: WebChangeDetector) {}

  get hasRemote(): boolean {
    // github.dev always has a remote
    return true;
  }

  get currentBranch(): string | undefined {
    // Not available in web mode
    return undefined;
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
    return changes;
  }

  async stageAndCommit(config: GitNoteConfig, changes: Change[]): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
    const files = changes.map((c) =>
      workspaceRoot ? relativePath(workspaceRoot, c.uri) : c.uri.path,
    );
    const branch = this.currentBranch ?? "unknown";
    const message = formatCommitMessage(
      config.commitMessageFormat,
      branch,
      files,
    );

    logger.info(`Web commit (${files.length} file(s)): ${files.join(", ")}`);

    // Set SCM input box message and execute commit
    // remoteHub.commit commits and pushes atomically in github.dev
    const commands = await vscode.commands.getCommands(true);
    if (commands.includes("remoteHub.commit")) {
      // Try to set the commit message via the SCM input box
      const gitExt = vscode.extensions.getExtension("vscode.git-base");
      if (gitExt) {
        try {
          const api = gitExt.exports;
          if (api?.inputBox) {
            api.inputBox.value = message;
          }
        } catch {
          // Ignore - inputBox may not be available
        }
      }
      await vscode.commands.executeCommand("remoteHub.commit");
      this.changeDetector.clearPendingSaves();
      logger.info(`Web committed: ${message}`);
    } else {
      throw new Error(
        "remoteHub.commit command not available. Is this running in github.dev?",
      );
    }
  }

  async push(): Promise<void> {
    // No-op: in github.dev, commit includes push
  }

  async pull(): Promise<void> {
    // No-op: not supported in web mode
  }

  cancelRetry(): void {
    // No-op: no retry mechanism in web mode
  }

  private createChange(uri: vscode.Uri): Change {
    return {
      uri,
      originalUri: uri,
      renameUri: undefined,
      status: 5 as Status, // Status.MODIFIED
    };
  }

  dispose(): void {
    // No resources to dispose
  }
}
