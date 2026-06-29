# VerifiedState — Session History & Audit Trail for AI Coding Agents

Automatic session capture for Claude Code. Every tool call, file change, and decision — recorded into a searchable timeline.

**Works immediately — no signup, no API key.** Upgrade to cloud sync for cross-tool search and signed receipts.

## Install

```bash
claude plugin add verifiedstate
```

## What It Does

Once installed, VerifiedState captures your Claude Code sessions automatically:

- **SessionStart** — loads context from your last session so the AI knows what happened before
- **PostToolUse** — records every Edit, Write, Bash, Agent, and Skill call in real-time
- **SessionEnd** — saves a session summary with files changed and branch state

### Local mode (default, no signup)

Events are written to `~/.vsync/timeline.jsonl`. You get a local, append-only log of everything your AI agents did — searchable with `grep`, `jq`, or any tool.

### Cloud mode (with API key)

Run `npx @verifiedstate/sync init` to enable:
- Semantic search across all sessions ("what decisions were made about auth?")
- Cross-tool capture (Cursor + Windsurf + terminal + GitHub)
- Ed25519 signed receipts and Merkle-chained provenance
- Dashboard at verifiedstate.ai with live session viewer
- 23 MCP tools for memory, metering, alerts, and team operations

## Why Not Just Use Claude Code's Built-in Memory?

Claude Code memory works per-session. When sessions reset, compact, or you switch to Cursor, context is lost. VerifiedState captures *across* sessions and *across* tools into one timeline. The cloud layer adds cryptographic proof of what happened (signed receipts, tamper-evident chains).

## Skills

- **verifiedstate** — memory operations, session continuity, vsync CLI reference
- **audit-trail** — reviewing agent activity, verifying receipts, investigating decisions

## MCP Server

The plugin bundles the [VerifiedState MCP server](https://mcp.verifiedstate.ai) with 23 tools for memory, metering, session management, and team operations.

## Links

- [verifiedstate.ai](https://verifiedstate.ai)
- [npm: @verifiedstate/sync](https://www.npmjs.com/package/@verifiedstate/sync)
- [GitHub: verifiedstate](https://github.com/verifiedstate)
