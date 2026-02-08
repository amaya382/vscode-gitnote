import * as vscode from "vscode";

export interface GitNoteConfig {
  enabled: boolean;
  commitDelay: number;
  autoPush: boolean;
  pullOnStartup: boolean;
  pullAfterIdle: boolean;
  idleThreshold: number;
  filePattern: string;
  excludeBranches: string[];
  commitMessageFormat: string;
  commitOnClose: boolean;
  showCountdown: boolean;
  conflictBehavior: "pause" | "notify";
}

export class ConfigService implements vscode.Disposable {
  private readonly _onDidChange = new vscode.EventEmitter<GitNoteConfig>();
  readonly onDidChange = this._onDidChange.event;
  private disposable: vscode.Disposable;

  constructor() {
    this.disposable = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("gitnote")) {
        this._onDidChange.fire(this.get());
      }
    });
  }

  get(): GitNoteConfig {
    const cfg = vscode.workspace.getConfiguration("gitnote");
    return {
      enabled: cfg.get<boolean>("enabled", false),
      commitDelay: cfg.get<number>("commitDelay", 10) * 1000,
      autoPush: cfg.get<boolean>("autoPush", true),
      pullOnStartup: cfg.get<boolean>("pullOnStartup", true),
      pullAfterIdle: cfg.get<boolean>("pullAfterIdle", true),
      idleThreshold: cfg.get<number>("idleThreshold", 30) * 1000,
      filePattern: cfg.get<string>("filePattern", "**/*"),
      excludeBranches: cfg.get<string[]>("excludeBranches", []),
      commitMessageFormat: cfg.get<string>(
        "commitMessageFormat",
        "GitNote: {timestamp}",
      ),
      commitOnClose: cfg.get<boolean>("commitOnClose", true),
      showCountdown: cfg.get<boolean>("showCountdown", true),
      conflictBehavior: cfg.get<"pause" | "notify">("conflictBehavior", "pause"),
    };
  }

  async setEnabled(value: boolean): Promise<void> {
    await vscode.workspace
      .getConfiguration("gitnote")
      .update("enabled", value, vscode.ConfigurationTarget.Workspace);
  }

  dispose(): void {
    this._onDidChange.dispose();
    this.disposable.dispose();
  }
}
