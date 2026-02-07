import type * as vscode from "vscode";

export interface IChangeDetector extends vscode.Disposable {
  readonly onDidDetectChange: vscode.Event<void>;
  updateFilePattern(pattern: string): void;
}
