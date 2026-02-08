import * as vscode from "vscode";
import { matchesPattern } from "./utils/patterns";
import { relativePath } from "./utils/paths";
import * as logger from "./utils/logger";
import type { IChangeDetector } from "./types/changeDetector";

/**
 * Web-compatible change detector. Uses only onDidSaveTextDocument
 * since createFileSystemWatcher does not work in github.dev.
 */
export class WebChangeDetector implements IChangeDetector {
  private readonly _onDidDetectChange = new vscode.EventEmitter<void>();
  readonly onDidDetectChange = this._onDidDetectChange.event;
  private disposables: vscode.Disposable[] = [];
  private readonly workspaceRoot: vscode.Uri | undefined;
  /** URIs of files saved since last commit, used by WebGitService */
  readonly pendingSaves: Set<string> = new Set();
  /** URIs of files deleted since last commit, used by WebGitService */
  readonly pendingDeletions: Set<string> = new Set();

  constructor(private filePattern: string) {
    const folders = vscode.workspace.workspaceFolders;
    this.workspaceRoot = folders?.[0]?.uri;

    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        if (this.isRelevantFile(doc.uri)) {
          const rel = this.workspaceRoot
            ? relativePath(this.workspaceRoot, doc.uri)
            : doc.uri.path;
          logger.info(`File saved: ${rel}`);
          this.pendingSaves.add(doc.uri.toString());
          this._onDidDetectChange.fire();
        }
      }),
    );

    this.disposables.push(
      vscode.workspace.onDidDeleteFiles((e) => {
        for (const uri of e.files) {
          if (this.isRelevantFile(uri)) {
            const rel = this.workspaceRoot
              ? relativePath(this.workspaceRoot, uri)
              : uri.path;
            logger.info(`File deleted: ${rel}`);
            this.pendingDeletions.add(uri.toString());
            this.pendingSaves.delete(uri.toString());
            this._onDidDetectChange.fire();
          }
        }
      }),
    );
  }

  clearPendingSaves(): void {
    this.pendingSaves.clear();
    this.pendingDeletions.clear();
  }

  updateFilePattern(pattern: string): void {
    this.filePattern = pattern;
  }

  private isRelevantFile(uri: vscode.Uri): boolean {
    if (!this.workspaceRoot) {
      return false;
    }
    // Check if within workspace
    if (!uri.path.startsWith(this.workspaceRoot.path)) {
      return false;
    }
    const rel = relativePath(this.workspaceRoot, uri);
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
