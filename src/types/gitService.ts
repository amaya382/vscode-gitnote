import type * as vscode from "vscode";
import type { Change } from "../git";
import type { GitNoteConfig } from "../configService";

export interface IGitService extends vscode.Disposable {
  readonly hasRemote: boolean;
  readonly currentBranch: string | undefined;
  readonly hasConflicts: boolean;
  readonly isRebasing: boolean;
  readonly hasPendingPush: boolean;
  hasChanges(config: GitNoteConfig): boolean;
  getMatchingChanges(config: GitNoteConfig): Change[];
  stageAndCommit(config: GitNoteConfig, changes: Change[]): Promise<void>;
  push(): Promise<void>;
  pull(): Promise<void>;
  cancelRetry(): void;
  /** Fetch and cache the current branch name. No-op if already known. */
  fetchBranch(): Promise<void>;
}
