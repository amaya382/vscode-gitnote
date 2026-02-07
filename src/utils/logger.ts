import * as vscode from "vscode";

let outputChannel: vscode.OutputChannel | undefined;

function getChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel("GitNote");
  }
  return outputChannel;
}

function timestamp(): string {
  return new Date().toISOString();
}

export function info(message: string): void {
  getChannel().appendLine(`[${timestamp()}] [INFO] ${message}`);
}

export function warn(message: string): void {
  getChannel().appendLine(`[${timestamp()}] [WARN] ${message}`);
}

export function error(message: string, err?: unknown): void {
  const errorDetail =
    err instanceof Error ? `: ${err.message}` : err ? `: ${String(err)}` : "";
  getChannel().appendLine(`[${timestamp()}] [ERROR] ${message}${errorDetail}`);
}

export function dispose(): void {
  outputChannel?.dispose();
  outputChannel = undefined;
}
