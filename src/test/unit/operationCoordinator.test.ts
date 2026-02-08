import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { CoordinatorState } from "../../operationCoordinator";

// Mock vscode module
vi.mock("vscode", () => {
  const EventEmitter = class {
    private listeners: Function[] = [];
    event = (listener: Function) => {
      this.listeners.push(listener);
      return { dispose: () => {} };
    };
    fire(data: any) {
      this.listeners.forEach((l) => l(data));
    }
    dispose() {
      this.listeners = [];
    }
  };

  return {
    EventEmitter,
    window: {
      createStatusBarItem: () => ({
        show: vi.fn(),
        dispose: vi.fn(),
        text: "",
        tooltip: "",
        command: "",
        backgroundColor: undefined,
      }),
      showWarningMessage: vi.fn(),
      onDidChangeActiveTextEditor: vi.fn(() => ({ dispose: vi.fn() })),
      onDidChangeWindowState: vi.fn(() => ({ dispose: vi.fn() })),
    },
    workspace: {
      getConfiguration: () => ({
        get: (key: string, defaultValue: any) => defaultValue,
        update: vi.fn(),
      }),
      onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
      onDidSaveTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
      onDidChangeTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
      createFileSystemWatcher: () => ({
        onDidDelete: vi.fn(() => ({ dispose: vi.fn() })),
        onDidCreate: vi.fn(() => ({ dispose: vi.fn() })),
        dispose: vi.fn(),
      }),
    },
    RelativePattern: class {
      constructor(
        public base: any,
        public pattern: string,
      ) {}
    },
    StatusBarAlignment: { Left: 1, Right: 2 },
    ThemeColor: class {
      constructor(public id: string) {}
    },
    ConfigurationTarget: { Workspace: 2 },
    Uri: {
      file: (path: string) => ({ fsPath: path, path }),
    },
    env: {
      uiKind: 1, // Desktop
    },
    UIKind: { Desktop: 1, Web: 2 },
  };
});

// Mock logger
vi.mock("../../utils/logger", () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  dispose: vi.fn(),
}));

import { OperationCoordinator } from "../../operationCoordinator";
import { ConfigService } from "../../configService";
import type { IGitService } from "../../types/gitService";
import type { IChangeDetector } from "../../types/changeDetector";

function createMockGitService(): IGitService {
  return {
    hasRemote: true,
    currentBranch: "main",
    hasConflicts: false,
    isRebasing: false,
    hasPendingPush: false,
    hasChanges: vi.fn().mockReturnValue(false),
    getMatchingChanges: vi.fn().mockReturnValue([]),
    stageAndCommit: vi.fn().mockResolvedValue(undefined),
    push: vi.fn().mockResolvedValue(undefined),
    pull: vi.fn().mockResolvedValue(undefined),
    cancelRetry: vi.fn(),
    dispose: vi.fn(),
  };
}

function createMockChangeDetector(): IChangeDetector {
  const listeners: Function[] = [];
  return {
    onDidDetectChange: (listener: Function) => {
      listeners.push(listener);
      return { dispose: () => {} };
    },
    updateFilePattern: vi.fn(),
    dispose: vi.fn(),
    _fireChange: () => listeners.forEach((l) => l()),
  } as any;
}

function createMockRepository() {
  const commitListeners: Function[] = [];
  const checkoutListeners: Function[] = [];

  return {
    rootUri: { fsPath: "/test/repo", path: "/test/repo" },
    state: {
      HEAD: { name: "main", type: 0 },
      refs: [],
      remotes: [{ name: "origin", fetchUrl: "https://example.com", pushUrl: "https://example.com", isReadOnly: false }],
      rebaseCommit: undefined,
      mergeChanges: [],
      indexChanges: [],
      workingTreeChanges: [],
      untrackedChanges: [],
      onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
    },
    inputBox: { value: "" },
    onDidCommit: (listener: Function) => {
      commitListeners.push(listener);
      return { dispose: () => {} };
    },
    onDidCheckout: (listener: Function) => {
      checkoutListeners.push(listener);
      return { dispose: () => {} };
    },
    _fireCommit: () => commitListeners.forEach((l) => l()),
    _fireCheckout: () => checkoutListeners.forEach((l) => l()),
  };
}

describe("OperationCoordinator", () => {
  let coordinator: OperationCoordinator;
  let mockGitService: IGitService;
  let mockChangeDetector: IChangeDetector;
  let mockRepo: ReturnType<typeof createMockRepository>;
  let configService: ConfigService;

  beforeEach(() => {
    vi.useFakeTimers();
    mockGitService = createMockGitService();
    mockChangeDetector = createMockChangeDetector();
    mockRepo = createMockRepository();
    configService = new ConfigService();
    coordinator = new OperationCoordinator(
      mockGitService,
      mockChangeDetector,
      configService,
      { repository: mockRepo as any },
    );
  });

  afterEach(() => {
    coordinator.dispose();
    configService.dispose();
    vi.useRealTimers();
  });

  it("should start in idle state", () => {
    expect(coordinator.currentState).toBe("idle");
  });

  it("should transition to watching when started with enabled config", async () => {
    const states: CoordinatorState[] = [];
    coordinator.onDidChangeState((s) => states.push(s));

    vi.spyOn(configService, "get").mockReturnValue({
      enabled: true,
      commitDelay: 30000,
      autoPush: true,
      pullOnStartup: false,
      pullAfterIdle: false,
      idleThreshold: 300000,
      filePattern: "**/*",
      excludeBranches: [],
      commitMessageFormat: "GitNote: {timestamp}",
      commitOnClose: true,
      conflictBehavior: "pause",
      showCountdown: true,
    });

    await coordinator.start();
    expect(coordinator.currentState).toBe("watching");
  });

  it("should not start when disabled", async () => {
    vi.spyOn(configService, "get").mockReturnValue({
      enabled: false,
      commitDelay: 30000,
      autoPush: true,
      pullOnStartup: false,
      pullAfterIdle: false,
      idleThreshold: 300000,
      filePattern: "**/*",
      excludeBranches: [],
      commitMessageFormat: "GitNote: {timestamp}",
      commitOnClose: true,
      conflictBehavior: "pause",
      showCountdown: true,
    });

    await coordinator.start();
    expect(coordinator.currentState).toBe("idle");
  });

  it("should transition to idle when stopped", async () => {
    vi.spyOn(configService, "get").mockReturnValue({
      enabled: true,
      commitDelay: 30000,
      autoPush: true,
      pullOnStartup: false,
      pullAfterIdle: false,
      idleThreshold: 300000,
      filePattern: "**/*",
      excludeBranches: [],
      commitMessageFormat: "GitNote: {timestamp}",
      commitOnClose: true,
      conflictBehavior: "pause",
      showCountdown: true,
    });

    await coordinator.start();
    coordinator.stop();
    expect(coordinator.currentState).toBe("idle");
  });

  it("should pause when branch is excluded", async () => {
    vi.spyOn(configService, "get").mockReturnValue({
      enabled: true,
      commitDelay: 30000,
      autoPush: true,
      pullOnStartup: false,
      pullAfterIdle: false,
      idleThreshold: 300000,
      filePattern: "**/*",
      excludeBranches: ["main"],
      commitMessageFormat: "GitNote: {timestamp}",
      commitOnClose: true,
      conflictBehavior: "pause",
      showCountdown: true,
    });

    await coordinator.start();
    expect(coordinator.currentState).toBe("paused");
  });
});
