# Changelog

All notable changes to the "GitNote" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-02-07

### Added

- Auto-commit with configurable delay after file save
- Auto-push with exponential backoff retry
- Auto-pull on startup and after idle detection
- File filtering via glob patterns
- Branch exclusion list
- Conflict detection with configurable behavior (pause / notify)
- Commit on VSCode close
- Customizable commit message format with template variables
- Status bar indicator with real-time state display
- Commands: Enable, Disable, Toggle, Sync Now