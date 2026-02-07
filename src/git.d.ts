/**
 * Subset of VSCode Git Extension API types used by GitNote.
 * Based on https://github.com/microsoft/vscode/blob/main/extensions/git/src/api/git.d.ts
 */

import { Uri, Event, Disposable } from "vscode";

export interface GitExtension {
  readonly enabled: boolean;
  readonly onDidChangeEnablement: Event<boolean>;
  getAPI(version: 1): API;
}

export type APIState = "uninitialized" | "initialized";

export interface API {
  readonly state: APIState;
  readonly onDidChangeState: Event<APIState>;
  readonly repositories: Repository[];
  readonly onDidOpenRepository: Event<Repository>;
  readonly onDidCloseRepository: Event<Repository>;
  getRepository(uri: Uri): Repository | null;
}

export interface Repository {
  readonly rootUri: Uri;
  readonly state: RepositoryState;
  readonly inputBox: InputBox;

  readonly onDidCommit: Event<void>;
  readonly onDidCheckout: Event<void>;

  add(resources: Uri[]): Promise<void>;
  revert(resources: Uri[]): Promise<void>;
  commit(message: string, opts?: CommitOptions): Promise<void>;
  fetch(options?: FetchOptions): Promise<void>;
  pull(unshallow?: boolean): Promise<void>;
  push(
    remoteName?: string,
    branchName?: string,
    setUpstream?: boolean,
    force?: ForcePushMode,
  ): Promise<void>;
  status(): Promise<void>;
  checkout(treeish: string): Promise<void>;
  getBranch(name: string): Promise<Branch>;
  createBranch(name: string, checkout: boolean, ref?: string): Promise<void>;
}

export interface InputBox {
  value: string;
}

export interface RepositoryState {
  readonly HEAD: Branch | undefined;
  readonly refs: Ref[];
  readonly remotes: Remote[];
  readonly rebaseCommit: string | undefined;
  readonly mergeChanges: Change[];
  readonly indexChanges: Change[];
  readonly workingTreeChanges: Change[];
  readonly untrackedChanges: Change[];
  readonly onDidChange: Event<void>;
}

export interface Branch extends Ref {
  readonly upstream?: UpstreamRef;
  readonly ahead?: number;
  readonly behind?: number;
}

export interface UpstreamRef {
  readonly remote: string;
  readonly name: string;
}

export interface Ref {
  readonly type: RefType;
  readonly name?: string;
  readonly commit?: string;
  readonly remote?: string;
}

export const enum RefType {
  Head = 0,
  RemoteHead = 1,
  Tag = 2,
}

export interface Remote {
  readonly name: string;
  readonly fetchUrl?: string;
  readonly pushUrl?: string;
  readonly isReadOnly: boolean;
}

export interface Change {
  readonly uri: Uri;
  readonly originalUri: Uri;
  readonly renameUri: Uri | undefined;
  readonly status: Status;
}

export const enum Status {
  INDEX_MODIFIED,
  INDEX_ADDED,
  INDEX_DELETED,
  INDEX_RENAMED,
  INDEX_COPIED,
  MODIFIED,
  DELETED,
  UNTRACKED,
  IGNORED,
  INTENT_TO_ADD,
  INTENT_TO_RENAME,
  TYPE_CHANGED,
  ADDED_BY_US,
  ADDED_BY_THEM,
  DELETED_BY_US,
  DELETED_BY_THEM,
  BOTH_ADDED,
  BOTH_DELETED,
  BOTH_MODIFIED,
}

export interface CommitOptions {
  all?: boolean | "tracked";
  amend?: boolean;
  signoff?: boolean;
  signCommit?: boolean;
  empty?: boolean;
  noVerify?: boolean;
  requireUserConfig?: boolean;
  useEditor?: boolean;
  verbose?: boolean;
  postCommitCommand?: string;
}

export interface FetchOptions {
  remote?: string;
  ref?: string;
  all?: boolean;
  prune?: boolean;
  depth?: number;
}

export const enum ForcePushMode {
  Force,
  ForceWithLease,
  ForceWithLeaseIfIncludes,
}
