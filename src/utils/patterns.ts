import { minimatch } from "minimatch";

export function matchesPattern(filePath: string, pattern: string): boolean {
  return minimatch(filePath, pattern, { dot: true });
}

export function formatCommitMessage(
  format: string,
  branch: string,
  files: string[],
): string {
  const now = new Date();
  return format
    .replace(/\{timestamp\}/g, now.toISOString())
    .replace(/\{date\}/g, now.toISOString().split("T")[0])
    .replace(
      /\{time\}/g,
      now.toTimeString().split(" ")[0],
    )
    .replace(/\{branch\}/g, branch)
    .replace(/\{files\}/g, files.join(", "))
    .replace(/\{count\}/g, String(files.length));
}
