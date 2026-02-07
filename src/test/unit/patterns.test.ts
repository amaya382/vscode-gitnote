import { describe, it, expect } from "vitest";
import { matchesPattern, formatCommitMessage } from "../../utils/patterns";

describe("matchesPattern", () => {
  it("should match all files with **/*", () => {
    expect(matchesPattern("src/index.ts", "**/*")).toBe(true);
    expect(matchesPattern("README.md", "**/*")).toBe(true);
  });

  it("should match specific extensions", () => {
    expect(matchesPattern("notes/todo.md", "**/*.md")).toBe(true);
    expect(matchesPattern("notes/todo.txt", "**/*.md")).toBe(false);
  });

  it("should match specific directories", () => {
    expect(matchesPattern("docs/guide.md", "docs/**")).toBe(true);
    expect(matchesPattern("src/index.ts", "docs/**")).toBe(false);
  });

  it("should match dotfiles when dot option is true", () => {
    expect(matchesPattern(".gitignore", "**/*")).toBe(true);
    expect(matchesPattern(".env", "**/*")).toBe(true);
  });
});

describe("formatCommitMessage", () => {
  it("should replace {branch} placeholder", () => {
    const result = formatCommitMessage("commit on {branch}", "main", []);
    expect(result).toBe("commit on main");
  });

  it("should replace {count} placeholder", () => {
    const result = formatCommitMessage("{count} files", "main", [
      "a.ts",
      "b.ts",
    ]);
    expect(result).toBe("2 files");
  });

  it("should replace {files} placeholder", () => {
    const result = formatCommitMessage("changed: {files}", "main", [
      "a.ts",
      "b.ts",
    ]);
    expect(result).toBe("changed: a.ts, b.ts");
  });

  it("should replace {timestamp} with ISO string", () => {
    const result = formatCommitMessage("GitNote: {timestamp}", "main", []);
    expect(result).toMatch(/^GitNote: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("should replace {date} with date only", () => {
    const result = formatCommitMessage("date: {date}", "main", []);
    expect(result).toMatch(/^date: \d{4}-\d{2}-\d{2}$/);
  });

  it("should replace {time} with time only", () => {
    const result = formatCommitMessage("time: {time}", "main", []);
    expect(result).toMatch(/^time: \d{2}:\d{2}:\d{2}$/);
  });

  it("should handle multiple placeholders", () => {
    const result = formatCommitMessage(
      "GitNote: {branch} ({count}) at {date}",
      "main",
      ["a.ts"],
    );
    expect(result).toMatch(/^GitNote: main \(1\) at \d{4}-\d{2}-\d{2}$/);
  });
});
