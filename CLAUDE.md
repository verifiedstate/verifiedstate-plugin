# VerifiedState Plugin

Verified memory and audit trail for AI coding agents.

## How This Plugin Works

This plugin adds three hooks to Claude Code:

1. **SessionStart** — Loads the last saved session state from VerifiedState so you have full context before the user types anything.
2. **PostToolUse** — Captures every state-changing tool call (Edit, Write, Bash, Agent, Skill, MCP) in real-time and ingests it to the verified memory ledger. Read-only tools (Read, Glob, Grep) are skipped to reduce noise.
3. **SessionEnd** — Auto-saves session state as a fallback when the AI doesn't explicitly call `session_save`.

## MCP Server

The plugin bundles the VerifiedState MCP server (23 tools) for memory, metering, session management, working state, alerts, and team operations.

## Dedup with vsync Daemon

If the user also runs `vsync start` (the background daemon), both the plugin and daemon will see the same events. The plugin writes dedup markers to `~/.vsync/plugin-dedup.json` so the daemon can skip already-captured events. This means:
- Plugin installed + daemon running = plugin captures in real-time, daemon fills gaps
- Plugin installed + no daemon = plugin captures Claude Code, misses Cursor/Windsurf/terminal
- No plugin + daemon running = daemon captures everything (existing behavior)

## Configuration

The plugin reads credentials from `~/.vsync/config.json` (created by `npx @verifiedstate/sync init`). Falls back to `VERIFIEDSTATE_API_KEY` and `VERIFIEDSTATE_NAMESPACE_ID` env vars.
