<h1 align="center"><img src="images/icon.png" alt="" width="32" height="32"> GitNote</h1>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=amaya382.gitnote"><img src="https://img.shields.io/visual-studio-marketplace/v/amaya382.gitnote" alt="VS Marketplace Version"></a>
  <a href="https://github.com/amaya382/vscode-gitnote/blob/main/LICENSE"><img src="https://img.shields.io/github/license/amaya382/vscode-gitnote" alt="License"></a>
</p>

A simple, stable VSCode extension that keeps your notes in sync with Git. Automatically commits, pushes, and pulls — so you can focus on writing.

Works on both **desktop VSCode** and **github.dev** (browser).

## Features

- **Auto-commit** — Commits changes after file save with configurable delay (default: 10s)
- **Auto-push** — Pushes to remote after each commit with retry on failure
- **Auto-pull** — Pulls on startup, on window focus return after idle, and on first file change after idle
- **File filtering** — Target specific files using glob patterns
- **Branch exclusion** — Skip automation on specific branches
- **Conflict safety** — Pauses when merge conflicts or rebase are detected
- **Commit on focus loss** — Commits and pushes pending changes when the window loses focus
- **Minimal dependencies** — Only `minimatch`; uses VSCode's built-in Git API

### Feature comparison

| Feature                     | Desktop |        github.dev        |
| --------------------------- | :-----: | :----------------------: |
| Auto-commit                 |   Yes   |           Yes            |
| Auto-push                   |   Yes   | Yes (atomic with commit) |
| Auto-pull (startup)         |   Yes   |           Yes            |
| Auto-pull (after idle)      |   Yes   |           Yes            |
| Conflict / rebase detection |   Yes   |            —             |
| File filtering              |   Yes   |           Yes            |
| Branch exclusion            |   Yes   |           Yes            |
| Commit on focus loss        |   Yes   |           Yes            |
| Countdown timer             |   Yes   |           Yes            |

## Installation

### From Marketplace (recommended)

Install from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=amaya382.gitnote), or search **"GitNote"** in the VSCode Extensions panel.

### From source

```bash
git clone https://github.com/amaya382/vscode-gitnote.git
cd vscode-gitnote
npm install
npm run compile
```

Press `F5` in VSCode to launch the Extension Development Host.

## Quick start

1. Open a workspace containing a Git repository
2. Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) → **GitNote: Enable**
3. Edit and save files — they will be automatically committed and pushed

The status bar shows the current state: Watching, Committing, Pushing, Pulling, Paused, or Error.

## Commands

| Command             | Description                        |
| ------------------- | ---------------------------------- |
| `GitNote: Enable`   | Enable auto-commit/push/pull       |
| `GitNote: Disable`  | Disable automation                 |
| `GitNote: Toggle`   | Toggle on/off                      |
| `GitNote: Sync Now` | Immediately pull, commit, and push |

## Configuration

| Setting                       | Default                  | Description                                          |
| ----------------------------- | ------------------------ | ---------------------------------------------------- |
| `gitnote.enabled`             | `false`                  | Enable GitNote                                       |
| `gitnote.commitDelay`         | `10`                     | Delay (seconds) before auto-commit after save        |
| `gitnote.autoPush`            | `true`                   | Push to remote after commit                          |
| `gitnote.pullOnStartup`       | `true`                   | Pull on startup                                      |
| `gitnote.pullAfterIdle`       | `true`                   | Pull on window focus or first interaction after idle |
| `gitnote.idleThreshold`       | `30`                     | Idle threshold in seconds                            |
| `gitnote.filePattern`         | `"**/*"`                 | Glob pattern for target files                        |
| `gitnote.excludeBranches`     | `[]`                     | Branches to exclude                                  |
| `gitnote.commitMessageFormat` | `"GitNote: {timestamp}"` | Commit message template                              |
| `gitnote.commitOnFocusLost`   | `true`                   | Commit and push pending changes on window focus loss |
| `gitnote.showCountdown`       | `true`                   | Show countdown timer in status bar                   |
| `gitnote.conflictBehavior`    | `"pause"`                | `"pause"` or `"notify"` on conflicts (desktop only)  |

### Commit message variables

`{timestamp}` `{date}` `{time}` `{branch}` `{files}` `{count}`

### Example: Markdown-only notes repo

```json
{
  "gitnote.enabled": true,
  "gitnote.filePattern": "**/*.md",
  "gitnote.commitDelay": 10,
  "gitnote.commitMessageFormat": "note: {date} ({count} files)"
}
```

## How it works

### Desktop

```
File save → Debounce (10s) → Safety checks → Commit → Push
```

- **Change detection** — three layers: file save events, repository state changes, and filesystem watcher (for deletions/renames)
- **Idle detection** — tracks user activity and window focus; if idle for 30s (configurable), regaining window focus or saving a file triggers a pull first
- **Safety** — mutex-locked operations prevent concurrent git commands; automation pauses during conflicts and rebase; branch checkout cancels pending commits
- **Push retry** — exponential backoff on failure (30s → 60s → 120s, max 3 attempts)

### Browser (github.dev)

```
File save → Debounce (10s) → Commit (includes push)
```

- **Change detection** — file save events only (`createFileSystemWatcher` is not available in github.dev)
- **Atomic commit+push** — uses the `remoteHub.commit` command provided by the GitHub Repositories extension; commit and push happen as a single operation
- **Auto-pull** — pulls on startup and after idle via `remoteHub.pull` (if available)

## Development

### Build

```bash
npm install
npm run compile
```

### Test

```bash
npm run test          # Unit tests
npm run lint          # Lint

# Test web extension locally in browser
npx @vscode/test-web --browserType=chromium --extensionDevelopmentPath=./
```

### Publish

```bash
# 1. Bump version
npm version patch  # or minor / major

# 2. Package
npx @vscode/vsce package

# 3. Publish to VS Marketplace
npx @vscode/vsce publish

# 4. Publish to Open VSX (optional)
npx ovsx publish gitnote-*.vsix -p $OVSX_TOKEN
```

## Compatibility

Works with standard Git repositories and [baretree](https://github.com/amaya382/baretree) worktree setups. Requires VSCode 1.85.0+.

## Acknowledgements

Inspired by [GitDoc](https://github.com/lostintangent/gitdoc).
