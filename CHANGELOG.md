# Changelog

All notable changes to the "GitNote" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.3]

### Fixed

- github.dev: improved UI refresh timing with optimized command sequencing and strategic delays (500ms after git.fetch, 300ms after remoteHub refresh, 200ms after git.refresh)
- github.dev: added `git.fetch` command before other refresh operations to ensure remote state synchronization
- github.dev: added SCM view focus (`workbench.view.scm`) to trigger UI decoration updates

### Added

- github.dev: commit verification mechanism that confirms HEAD OID matches the committed OID
- github.dev: SCM input box clearing after successful commits (when available)
- github.dev: enhanced logging for all refresh operations with clear step-by-step progress

### Changed

- github.dev: refresh command execution now uses sequential timing with delays instead of parallel execution to allow VSCode's internal caches to update properly

### Technical Notes

- Due to VSCode API limitations in github.dev (web environment), complete file decoration updates cannot be guaranteed. The current implementation represents the optimal approach using publicly available APIs.
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
