# Changelog

All notable changes to this project will be documented in this file.

## [0.1.8] - 2026-04-08

### Added

- **Rescue prompt enrichment** — `/kiro:rescue` 现在会让 Claude Code 先分析用户意图、收集 git 上下文，构建结构化 prompt 再委托给 kiro-cli，大幅减少 Kiro 的探索成本。借鉴自 codex-plugin-cc 的 prompt 构建模式。`--raw` 标志可跳过 enrichment 走原始直通模式。详见 [docs/changes/2026-04-08-rescue-prompt-enrichment.md](docs/changes/2026-04-08-rescue-prompt-enrichment.md)
