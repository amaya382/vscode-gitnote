import * as vscode from "vscode";
import type { GitExtension, API, Repository } from "./git";
import { ConfigService } from "./configService";
import { OperationCoordinator } from "./operationCoordinator";
import { StatusBarManager } from "./statusBar";
import * as logger from "./utils/logger";

let coordinator: OperationCoordinator | undefined;
let statusBar: StatusBarManager | undefined;
let configService: ConfigService | undefined;

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  logger.info("GitNote activating...");

  configService = new ConfigService();
  statusBar = new StatusBarManager();
  context.subscriptions.push(configService, statusBar);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("gitnote.enable", async () => {
      await configService!.setEnabled(true);
    }),
    vscode.commands.registerCommand("gitnote.disable", async () => {
      await configService!.setEnabled(false);
      coordinator?.stop();
    }),
    vscode.commands.registerCommand("gitnote.toggle", async () => {
      const config = configService!.get();
      await configService!.setEnabled(!config.enabled);
      if (config.enabled) {
        coordinator?.stop();
      }
    }),
    vscode.commands.registerCommand("gitnote.syncNow", async () => {
      if (coordinator) {
        await coordinator.syncNow();
      } else {
        vscode.window.showWarningMessage(
          "GitNote: No Git repository available.",
        );
      }
    }),
  );

  if (vscode.env.uiKind === vscode.UIKind.Web) {
    initializeWeb(context);
  } else {
    await initializeDesktop(context);
  }
}

// --- Web mode (github.dev) ---

function initializeWeb(context: vscode.ExtensionContext): void {
  logger.info("Initializing in web mode (github.dev)");

  // Check if workspace is a Git repository
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    logger.info("No workspace folder found - GitNote will not activate");
    return;
  }

  // In github.dev, the URI scheme is "vscode-vfs" with authority "github..."
  // Only activate if this looks like a GitHub repository
  if (workspaceFolder.uri.scheme !== "vscode-vfs" ||
      !workspaceFolder.uri.authority.startsWith("github")) {
    logger.info(`Not a GitHub repository (scheme: ${workspaceFolder.uri.scheme}, authority: ${workspaceFolder.uri.authority}) - GitNote will not activate`);
    return;
  }

  logger.info(`GitHub repository detected: ${workspaceFolder.uri.toString()}`);

  // Dynamic imports to avoid bundling Node.js-dependent code in web build
  // when tree-shaking isn't enough. esbuild bundles everything, so we use
  // inline requires that only execute in the web path.
  const { WebChangeDetector } = require("./webChangeDetector") as typeof import("./webChangeDetector");
  const { WebGitService } = require("./webGitService") as typeof import("./webGitService");

  const config = configService!.get();
  logger.info(`Web mode initial config - enabled: ${config.enabled}`);

  const changeDetector = new WebChangeDetector(config.filePattern);
  const gitService = new WebGitService(changeDetector);

  coordinator = new OperationCoordinator(
    gitService,
    changeDetector,
    configService!,
  );
  context.subscriptions.push(coordinator);

  connectStatusBar(context);

  if (config.enabled) {
    logger.info("Auto-starting GitNote (enabled in settings)");
    coordinator.start();
  } else {
    logger.info("GitNote not auto-started (disabled in settings)");
  }
}

// --- Desktop mode ---

async function initializeDesktop(
  context: vscode.ExtensionContext,
): Promise<void> {
  logger.info("Initializing in desktop mode");

  const gitExtension =
    vscode.extensions.getExtension<GitExtension>("vscode.git");
  if (!gitExtension) {
    logger.error("Git extension not found");
    return;
  }

  if (!gitExtension.isActive) {
    await gitExtension.activate();
  }

  const git = gitExtension.exports;

  if (!git.enabled) {
    logger.info("Git extension disabled, waiting for enablement...");
    const disposable = git.onDidChangeEnablement((enabled) => {
      if (enabled) {
        disposable.dispose();
        initializeWithAPI(git.getAPI(1), context);
      }
    });
    context.subscriptions.push(disposable);
    return;
  }

  const api = git.getAPI(1);

  if (api.state === "uninitialized") {
    logger.info("Git API not ready, waiting for initialization...");
    const disposable = api.onDidChangeState((state) => {
      if (state === "initialized") {
        disposable.dispose();
        initializeWithAPI(api, context);
      }
    });
    context.subscriptions.push(disposable);
    return;
  }

  initializeWithAPI(api, context);
}

function initializeWithAPI(
  api: API,
  context: vscode.ExtensionContext,
): void {
  const repo = api.repositories[0];
  if (repo) {
    initializeWithRepository(repo, context);
  } else {
    logger.info("No repository found, waiting...");
    const disposable = api.onDidOpenRepository((repo) => {
      disposable.dispose();
      initializeWithRepository(repo, context);
    });
    context.subscriptions.push(disposable);
  }
}

function initializeWithRepository(
  repository: Repository,
  context: vscode.ExtensionContext,
): void {
  logger.info(
    `Initializing with repository: ${repository.rootUri.fsPath}`,
  );

  const { DesktopGitService } = require("./desktopGitService") as typeof import("./desktopGitService");
  const { DesktopChangeDetector } = require("./desktopChangeDetector") as typeof import("./desktopChangeDetector");

  const config = configService!.get();
  logger.info(`Desktop mode initial config - enabled: ${config.enabled}`);

  const gitService = new DesktopGitService(repository);
  const changeDetector = new DesktopChangeDetector(repository, config.filePattern);

  coordinator = new OperationCoordinator(
    gitService,
    changeDetector,
    configService!,
    { repository },
  );
  context.subscriptions.push(coordinator);

  connectStatusBar(context);

  if (config.enabled) {
    logger.info("Auto-starting GitNote (enabled in settings)");
    coordinator.start();
  } else {
    logger.info("GitNote not auto-started (disabled in settings)");
  }
}

function connectStatusBar(context: vscode.ExtensionContext): void {
  statusBar!.showCountdown = configService!.get().showCountdown;
  context.subscriptions.push(
    coordinator!.onDidChangeState((state) => {
      statusBar!.update(state);
    }),
    coordinator!.onDidTickCountdown((seconds) => {
      statusBar!.updateCountdown(seconds);
    }),
    configService!.onDidChange((config) => {
      statusBar!.showCountdown = config.showCountdown;
    }),
  );
}

export async function deactivate(): Promise<void> {
  logger.info("GitNote deactivating...");

  if (coordinator) {
    await coordinator.flushOnClose();
  }

  logger.dispose();
}
