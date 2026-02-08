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
 * Uses GitHub GraphQL API (createCommitOnBranch) for committing directly.
 * In github.dev, commit and push are an atomic operation via the API.
 */
export class WebGitService implements IGitService {
  private _branch: string | undefined;
  private lastCommitOid: string | undefined;

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

    const token = await this.getAuthToken();
    const { owner, repo } = this.getRepoInfo();

    // Detect branch (cached after first call)
    if (!this._branch) {
      this._branch = await this.detectBranch(token, owner, repo);
    }
    const branch = this._branch;

    // Get current HEAD OID (always fresh to avoid stale OID errors)
    const headOid = await this.getHeadOid(token, owner, repo, branch);

    // Build file additions and deletions
    const additions: Array<{ path: string; contents: string }> = [];
    const deletions: Array<{ path: string }> = [];

    for (const change of changes) {
      const filePath = relativePath(workspaceRoot, change.uri);
      // Status.DELETED = 6
      if ((change.status as number) === 6) {
        deletions.push({ path: filePath });
        continue;
      }
      try {
        const content = await vscode.workspace.fs.readFile(change.uri);
        additions.push({
          path: filePath,
          contents: uint8ArrayToBase64(content),
        });
      } catch (err) {
        logger.warn(`Failed to read file ${filePath}, skipping: ${err}`);
      }
    }

    if (additions.length === 0 && deletions.length === 0) {
      logger.info("No file contents to commit");
      return;
    }

    const files = [
      ...additions.map((a) => a.path),
      ...deletions.map((d) => `(deleted) ${d.path}`),
    ];
    const message = formatCommitMessage(
      config.commitMessageFormat,
      branch,
      files,
    );

    logger.info(`Web commit (${files.length} file(s)): ${files.join(", ")}`);

    try {
      const newOid = await this.createCommit(
        token,
        owner,
        repo,
        branch,
        headOid,
        message,
        additions,
        deletions,
      );
      this.lastCommitOid = newOid;
      this.changeDetector.clearPendingSaves();
      logger.info(`Web committed: ${message} (${newOid})`);

      // Refresh GitHub Repositories extension's view to reflect the new commit
      await this.refreshVirtualFileSystem();

      // Verify commit sync (optional)
      await this.verifyCommitSync(newOid);
    } catch (err) {
      // Retry once on HEAD OID mismatch (concurrent edit)
      if (
        err instanceof Error &&
        err.message.includes("expectedHeadOid")
      ) {
        logger.warn("Head OID mismatch, retrying with fresh OID");
        const freshOid = await this.getHeadOid(token, owner, repo, branch);
        const newOid = await this.createCommit(
          token,
          owner,
          repo,
          branch,
          freshOid,
          message,
          additions,
          deletions,
        );
        this.lastCommitOid = newOid;
        this.changeDetector.clearPendingSaves();
        logger.info(`Web committed (retry): ${message} (${newOid})`);

        // Refresh after retry as well
        await this.refreshVirtualFileSystem();

        // Verify commit sync (optional)
        await this.verifyCommitSync(newOid);
      } else {
        throw err;
      }
    }
  }

  async push(): Promise<void> {
    // No-op: GraphQL createCommitOnBranch commits directly to remote
  }

  async pull(): Promise<void> {
    // No-op: not supported in web mode
  }

  cancelRetry(): void {
    // No-op: no retry mechanism in web mode
  }

  // --- Private helpers ---

  /**
   * Clear the SCM input box after commit by executing the clear command.
   * Note: Direct access to SCM provider input box may not be available in all VSCode versions.
   */
  private async clearCommitInput(): Promise<void> {
    try {
      // Try to clear the input box via command if available
      const commands = await vscode.commands.getCommands(true);
      if (commands.includes("git.inputBox.clear")) {
        await vscode.commands.executeCommand("git.inputBox.clear");
        logger.info("Cleared SCM input box via command");
      }
    } catch (err) {
      // Fallback: input box clearing is not critical, just log
      logger.info(`SCM input box clear not available: ${err}`);
    }
  }

  /**
   * Delay utility for waiting between refresh commands.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Verify that the commit is reflected in the UI.
   * Returns true if the HEAD OID matches the expected OID.
   */
  private async verifyCommitSync(expectedOid: string): Promise<boolean> {
    // Wait for UI to refresh
    await this.delay(1000);

    try {
      const token = await this.getAuthToken();
      const { owner, repo } = this.getRepoInfo();
      const currentHeadOid = await this.getHeadOid(
        token,
        owner,
        repo,
        this._branch!,
      );

      if (currentHeadOid === expectedOid) {
        logger.info("Commit sync verified: UI should be up to date");
        return true;
      } else {
        logger.warn(
          `Commit sync mismatch: expected ${expectedOid}, got ${currentHeadOid}`,
        );
        return false;
      }
    } catch (err) {
      logger.info(`Commit verification failed: ${err}`);
      return false;
    }
  }

  /**
   * Refresh the GitHub Repositories extension's virtual filesystem after a commit.
   * Tries multiple refresh commands with appropriate delays to ensure the UI reflects the new state.
   * Note: Due to VSCode API limitations, complete decoration updates are not guaranteed.
   */
  private async refreshVirtualFileSystem(): Promise<void> {
    const commands = await vscode.commands.getCommands(true);

    // Step 1: Clear SCM Input Box
    await this.clearCommitInput();

    // Step 2: Sync remote state (git fetch)
    if (commands.includes("git.fetch")) {
      try {
        await vscode.commands.executeCommand("git.fetch");
        logger.info("Executed git.fetch to sync remote state");
        await this.delay(500);
      } catch (err) {
        logger.warn(`git.fetch failed: ${err}`);
      }
    }

    // Step 3: Refresh RemoteHub Workspace View
    if (commands.includes("remoteHub.views.workspaceRepositories.refresh")) {
      try {
        await vscode.commands.executeCommand(
          "remoteHub.views.workspaceRepositories.refresh",
        );
        logger.info("Refreshed remoteHub workspace view");
        await this.delay(300);
      } catch (err) {
        logger.warn(`remoteHub refresh failed: ${err}`);
      }
    }

    // Step 4: Refresh Git SCM View
    if (commands.includes("git.refresh")) {
      try {
        await vscode.commands.executeCommand("git.refresh");
        logger.info("Refreshed git SCM view");
        await this.delay(200);
      } catch (err) {
        logger.warn(`git.refresh failed: ${err}`);
      }
    }

    // Step 5: Execute Git Sync (pull + push check)
    if (commands.includes("git.sync")) {
      try {
        await vscode.commands.executeCommand("git.sync");
        logger.info("Executed git.sync");
      } catch (err) {
        logger.warn(`git.sync failed: ${err}`);
      }
    }

    // Step 6: Focus SCM View to trigger UI refresh
    if (commands.includes("workbench.view.scm")) {
      try {
        await vscode.commands.executeCommand("workbench.view.scm");
        logger.info("Focused SCM view to trigger UI refresh");
      } catch (err) {
        logger.info(`SCM focus failed: ${err}`);
      }
    }
  }

  private async getAuthToken(): Promise<string> {
    const session = await vscode.authentication.getSession(
      "github",
      ["repo"],
      { createIfNone: true },
    );
    if (!session) {
      throw new Error(
        "GitHub authentication required. Please sign in to GitHub.",
      );
    }
    return session.accessToken;
  }

  private getRepoInfo(): { owner: string; repo: string } {
    const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!workspaceUri) {
      throw new Error("No workspace folder found");
    }

    // In github.dev, URI is: vscode-vfs://github[+hex]/<owner>/<repo>/...
    const pathParts = workspaceUri.path.split("/").filter(Boolean);
    if (pathParts.length < 2) {
      throw new Error(
        `Cannot parse repository from workspace URI: ${workspaceUri.toString()}`,
      );
    }

    return { owner: pathParts[0], repo: pathParts[1] };
  }

  private async detectBranch(
    token: string,
    owner: string,
    repo: string,
  ): Promise<string> {
    // Try to extract branch from URI authority
    // In github.dev, non-default branches encode ref info in authority:
    //   github+<hex-encoded-json> where JSON is {"v":1,"ref":{"type":...,"id":"branch-name"}}
    const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (workspaceUri) {
      const authority = workspaceUri.authority;
      const plusIndex = authority.indexOf("+");
      if (plusIndex !== -1) {
        const hex = authority.substring(plusIndex + 1);
        try {
          const json = hexToString(hex);
          const parsed = JSON.parse(json);
          if (parsed?.ref?.id) {
            logger.info(`Detected branch from URI: ${parsed.ref.id}`);
            return parsed.ref.id;
          }
        } catch {
          logger.warn("Failed to parse branch from URI authority");
        }
      }
    }

    // Fallback: query default branch via GitHub API
    const data = await this.graphqlRequest<{
      repository: {
        defaultBranchRef: { name: string };
      };
    }>(
      token,
      `query($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          defaultBranchRef { name }
        }
      }`,
      { owner, repo },
    );

    const branch = data.repository.defaultBranchRef.name;
    logger.info(`Using default branch: ${branch}`);
    return branch;
  }

  private async getHeadOid(
    token: string,
    owner: string,
    repo: string,
    branch: string,
  ): Promise<string> {
    const data = await this.graphqlRequest<{
      repository: {
        ref: { target: { oid: string } } | null;
      };
    }>(
      token,
      `query($owner: String!, $repo: String!, $ref: String!) {
        repository(owner: $owner, name: $repo) {
          ref(qualifiedName: $ref) {
            target { oid }
          }
        }
      }`,
      { owner, repo, ref: `refs/heads/${branch}` },
    );

    if (!data.repository.ref) {
      throw new Error(`Branch '${branch}' not found in ${owner}/${repo}`);
    }

    return data.repository.ref.target.oid;
  }

  private async createCommit(
    token: string,
    owner: string,
    repo: string,
    branch: string,
    expectedHeadOid: string,
    message: string,
    additions: Array<{ path: string; contents: string }>,
    deletions: Array<{ path: string }>,
  ): Promise<string> {
    const fileChanges: Record<string, unknown> = {};
    if (additions.length > 0) {
      fileChanges.additions = additions;
    }
    if (deletions.length > 0) {
      fileChanges.deletions = deletions;
    }

    const data = await this.graphqlRequest<{
      createCommitOnBranch: {
        commit: { oid: string };
      };
    }>(
      token,
      `mutation($input: CreateCommitOnBranchInput!) {
        createCommitOnBranch(input: $input) {
          commit { oid }
        }
      }`,
      {
        input: {
          branch: {
            repositoryNameWithOwner: `${owner}/${repo}`,
            branchName: branch,
          },
          expectedHeadOid,
          message: { headline: message },
          fileChanges,
        },
      },
    );

    return data.createCommitOnBranch.commit.oid;
  }

  private async graphqlRequest<T>(
    token: string,
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    const response = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "GitNote-VSCode-Extension",
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub API error (${response.status}): ${text}`);
    }

    const json = (await response.json()) as {
      data?: T;
      errors?: Array<{ message: string }>;
    };
    if (json.errors && json.errors.length > 0) {
      throw new Error(
        `GitHub GraphQL error: ${json.errors.map((e) => e.message).join("; ")}`,
      );
    }
    if (!json.data) {
      throw new Error("GitHub GraphQL returned no data");
    }

    return json.data;
  }

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

/** Decode hex string to UTF-8 string (browser-safe) */
function hexToString(hex: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substring(i, i + 2), 16));
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

/** Base64-encode a Uint8Array (browser-safe, no Buffer needed) */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    for (let j = 0; j < chunk.length; j++) {
      binary += String.fromCharCode(chunk[j]);
    }
  }
  return btoa(binary);
}
