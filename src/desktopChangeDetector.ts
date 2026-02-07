import * as vscode from "vscode";
import type { Repository } from "./git";
import { matchesPattern } from "./utils/patterns";
import { relativePath, isWithin } from "./utils/paths";
import * as logger from "./utils/logger";
import type { IChangeDetector } from "./types/changeDetector";

export class DesktopChangeDetector implements IChangeDetector {
  private readonly _onDidDetectChange = new vscode.EventEmitter<void>();
  readonly onDidDetectChange = this._onDidDetectChange.event;
  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly repository: Repository,
    private filePattern: string,
  ) {
    // Layer 1: File save events (primary trigger)
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        if (this.isRelevantFile(doc.uri)) {
          logger.info(`File saved: ${this.relativeToRepo(doc.uri)}`);
          this._onDidDetectChange.fire();
        }
      }),
    );

    // Layer 2: Repository state changes (secondary, detects manual commits etc.)
    this.disposables.push(
      this.repository.state.onDidChange(() => {
        // Fires on any repository state change (index, working tree, HEAD).
        // The OperationCoordinator decides what to do with this signal.
      }),
    );

    // Layer 3: Filesystem watcher for deletions/renames not captured by onDidSave
    const repoRoot = repository.rootUri;
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(repoRoot, "**/*"),
    );
    this.disposables.push(
      watcher.onDidDelete((uri) => {
        if (this.isRelevantFile(uri)) {
          logger.info(`File deleted: ${this.relativeToRepo(uri)}`);
          this._onDidDetectChange.fire();
        }
      }),
    );
    this.disposables.push(
      watcher.onDidCreate((uri) => {
        if (this.isRelevantFile(uri)) {
          logger.info(`File created: ${this.relativeToRepo(uri)}`);
          this._onDidDetectChange.fire();
        }
      }),
    );
    this.disposables.push(watcher);
  }

  updateFilePattern(pattern: string): void {
    this.filePattern = pattern;
  }

  private relativeToRepo(uri: vscode.Uri): string {
    return relativePath(this.repository.rootUri, uri);
  }

  private isRelevantFile(uri: vscode.Uri): boolean {
    if (!isWithin(this.repository.rootUri, uri)) {
      return false;
    }
    const rel = this.relativeToRepo(uri);
    if (rel.startsWith(".git/") || rel === ".git") {
      return false;
    }
    if (this.filePattern === "**/*") {
      return true;
    }
    return matchesPattern(rel, this.filePattern);
  }

  dispose(): void {
    this._onDidDetectChange.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
