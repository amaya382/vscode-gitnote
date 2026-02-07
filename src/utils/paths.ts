import * as vscode from "vscode";

/**
 * Compute relative path from base URI to target URI.
 * Works in both Node (desktop) and browser (github.dev) environments.
 */
export function relativePath(base: vscode.Uri, target: vscode.Uri): string {
  const basePath = base.path.endsWith("/") ? base.path : base.path + "/";
  const targetPath = target.path;

  if (targetPath.startsWith(basePath)) {
    return targetPath.slice(basePath.length);
  }

  // Fallback: return the target path as-is
  return targetPath;
}

/**
 * Check if a URI is within the base URI's subtree.
 */
export function isWithin(base: vscode.Uri, target: vscode.Uri): boolean {
  const basePath = base.path.endsWith("/") ? base.path : base.path + "/";
  return target.path.startsWith(basePath);
}
