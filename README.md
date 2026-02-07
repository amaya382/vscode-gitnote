<h1 align="center"><img src="images/icon.png" alt="" width="32" height="32"> GitNote</h1>

A simple, stable VSCode extension that keeps your notes in sync with Git. Automatically commits, pushes, and pulls — so you can focus on writing.

Works on both **desktop VSCode** and **github.dev** (browser).

## Features

- **Auto-commit** — Commits changes after file save with configurable delay (default: 30s)
- **Auto-push** — Pushes to remote after each commit with retry on failure
- **Auto-pull** — Pulls on startup and after returning from idle (e.g., sleep/resume)
- **File filtering** — Target specific files using glob patterns
- **Branch exclusion** — Skip automation on specific branches
- **Conflict safety** — Pauses when merge conflicts or rebase are detected
- **Commit on close** — Saves pending changes when VSCode closes
- **Minimal dependencies** — Only `minimatch`; uses VSCode's built-in Git API

> [!NOTE]
> Pull, conflict detection, rebase detection, branch exclusion, and push retry are not available in github.dev due to platform limitations.

### Feature comparison

| Feature | Desktop | github.dev |
|---------|:---:|:---:|
| Auto-commit | Yes | Yes |
| Auto-push | Yes | Yes (atomic with commit) |
| Auto-pull | Yes | — |
| Conflict / rebase detection | Yes | — |
| Idle-after-pull | Yes | — |
| File filtering | Yes | Yes |
| Branch exclusion | Yes | — |
| Commit on close | Yes | Yes |
| Countdown timer | Yes | Yes |
| Push retry | Yes | — |

## Installation

### From source

```bash
git clone https://github.com/amaya382/gitnote.git
cd gitnote
npm install
npm run compile
```

Press `F5` in VSCode to launch the Extension Development Host.

### From VSIX

```bash
npm run package
code --install-extension gitnote-0.1.0.vsix
```

## Quick start

1. Open a workspace containing a Git repository
2. Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) → **GitNote: Enable**
3. Edit and save files — they will be automatically committed and pushed

The status bar shows the current state: Watching, Committing, Pushing, Pulling, Paused, or Error.

## Commands

| Command | Description |
|---------|-------------|
| `GitNote: Enable` | Enable auto-commit/push/pull |
| `GitNote: Disable` | Disable automation |
| `GitNote: Toggle` | Toggle on/off |
| `GitNote: Sync Now` | Immediately pull, commit, and push |

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `gitnote.enabled` | `false` | Enable GitNote |
| `gitnote.commitDelay` | `30` | Delay (seconds) before auto-commit after save |
| `gitnote.autoPush` | `true` | Push to remote after commit |
| `gitnote.pullOnStartup` | `true` | Pull on startup (desktop only) |
| `gitnote.pullAfterIdle` | `true` | Pull on first interaction after idle (desktop only) |
| `gitnote.idleThreshold` | `300` | Idle threshold in seconds (desktop only) |
| `gitnote.filePattern` | `"**/*"` | Glob pattern for target files |
| `gitnote.excludeBranches` | `[]` | Branches to exclude (desktop only) |
| `gitnote.commitMessageFormat` | `"GitNote: {timestamp}"` | Commit message template |
| `gitnote.commitOnClose` | `true` | Commit pending changes on close |
| `gitnote.showCountdown` | `true` | Show countdown timer in status bar |
| `gitnote.conflictBehavior` | `"pause"` | `"pause"` or `"notify"` on conflicts (desktop only) |

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
File save → Debounce (30s) → Safety checks → Commit → Push
```

- **Change detection** — three layers: file save events, repository state changes, and filesystem watcher (for deletions/renames)
- **Idle detection** — tracks user activity; if idle for 5 min (configurable), the next save triggers a pull first
- **Safety** — mutex-locked operations prevent concurrent git commands; automation pauses during conflicts and rebase; branch checkout cancels pending commits
- **Push retry** — exponential backoff on failure (30s → 60s → 120s, max 3 attempts)

### Browser (github.dev)

```
File save → Debounce (30s) → Commit (includes push)
```

- **Change detection** — file save events only (`createFileSystemWatcher` is not available in github.dev)
- **Atomic commit+push** — uses the `remoteHub.commit` command provided by the GitHub Repositories extension; commit and push happen as a single operation
- **No pull** — auto-pull is not available in github.dev

## Compatibility

Works with standard Git repositories and [baretree](https://github.com/amaya382/baretree) worktree setups. Requires VSCode 1.85.0+.

## Acknowledgements

Inspired by [GitDoc](https://github.com/lostintangent/gitdoc).
