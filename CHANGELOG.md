# Changelog

All notable changes to the "GitNote" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.6]

### Fixed

- github.dev: UI refresh after commit now works reliably by using `remoteHub.sync` command

## [0.1.5]

### Fixed

- github.dev: increased delays after RemoteHub refresh commands (800ms after workspace refresh, 500ms after general refresh) to allow more time for cache updates
- github.dev: removed `workbench.action.files.revert` strategy as it was reverting file contents instead of refreshing decorations

### Added

- github.dev: automatic close and reopen of active editor after commit to force TextDocument cache invalidation
- github.dev: extended delay (500ms) after final SCM focus to allow UI to settle

### Changed

- github.dev: reordered refresh strategies to prioritize RemoteHub commands over git commands (which are not available in github.dev)

## [0.1.3]

### Fixed

- github.dev: improved UI refresh with multiple fallback strategies to maximize update success rate
- github.dev: added comprehensive logging to identify which refresh commands are available and executed

### Added

- github.dev: commit verification mechanism that confirms HEAD OID matches the committed OID after commit
- github.dev: multiple refresh strategies tried sequentially with appropriate delays:
  - `remoteHub.views.workspaceRepositories.refresh` (500ms delay)
  - `workbench.scm.focus` (200ms delay)
  - `git.refresh` (300ms delay)
  - `git.sync` (200ms delay)
  - `git.fetch` (200ms delay)
  - `remoteHub.refresh` (200ms delay)
  - `workbench.action.files.revert` (100ms delay)
- github.dev: diagnostic logging of available refresh commands to aid troubleshooting
- github.dev: SCM input box clearing after successful commits (when command is available)

### Changed

- github.dev: refresh command execution now tries multiple strategies with fallback support
- github.dev: improved logging granularity - each refresh command logs its execution status

### Technical Notes

- Due to VSCode API limitations in github.dev (web environment), complete file decoration updates cannot be guaranteed. The current implementation tries multiple refresh strategies to maximize success rate.
- Not all VSCode commands are available in github.dev. The extension logs which commands are available and actually executed.
- Multiple independent cache layers (TextDocument, FileSystemProvider, SCM Provider, Decorations) exist in VSCode without public invalidation APIs.

## [0.1.2]

### Fixed

- github.dev: UI not updating after commit; added automatic refresh commands (`remoteHub.views.workspaceRepositories.refresh`, `git.sync`, `git.refresh`)
- Sync Now command: added logging when triggered and when no changes are pending (previously silent)

### Added

- github.dev: automatic virtual filesystem refresh after successful commits

## [0.1.1]

### Fixed

- github.dev: commits were silently failing due to `remoteHub.commit` not receiving a commit message; replaced with direct GitHub GraphQL API (`createCommitOnBranch` mutation)

### Added

- github.dev: branch detection from workspace URI (supports non-default branches)
- github.dev: file deletion tracking via `onDidDeleteFiles`
- Development section in README (build, test, publish instructions)

## [0.1.0] - 2026-02-07

### Added

- Auto-commit with configurable delay after file save
- Auto-push with exponential backoff retry
- Auto-pull on startup and after idle detection
- File filtering via glob patterns
- Branch exclusion list
- Conflict detection with configurable behavior (pause / notify)
- Rebase detection with automatic pause
- External commit detection to prevent interference with manual commits
- Branch switch detection with automatic pause/resume on excluded branches
- Commit on VSCode close
- Customizable commit message format with template variables (`{timestamp}`, `{date}`, `{time}`, `{branch}`, `{files}`, `{count}`)
- Status bar indicator with real-time state display
- Countdown timer display in status bar (toggleable)
- Configuration changes applied in real-time without restart
- Output channel logging for diagnostics
- github.dev (Web environment) support with atomic commit and push
- Commands: Enable, Disable, Toggle, Sync Now
