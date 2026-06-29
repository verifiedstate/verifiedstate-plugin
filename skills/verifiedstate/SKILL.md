---
name: verifiedstate
description: "Use when doing ANY task involving VerifiedState, verified memory, session continuity, decision traces, or audit trails. Triggers: MCP tools (memory_ingest, memory_query, memory_verify, session_save, session_load), vsync CLI, cryptographic receipts, Merkle chains, Ed25519 signing, Proof Meter, assertion lifecycle (ingest/extract/verify/retract), namespace management, API keys."
metadata:
  author: verifiedstate
  version: "0.1.0"
  priority: 8
  pathPatterns:
    - ".verifiedstate*"
    - ".vsync/**"
    - "packages/sync/**"
    - "packages/mcp/**"
    - "workers/mcp/**"
    - "workers/ingest/**"
    - "workers/verify/**"
    - "workers/query/**"
  importPatterns:
    - "@verifiedstate/sync"
    - "@verifiedstate/mcp"
---

# VerifiedState — Verified Memory for AI Agents

## What It Is

VerifiedState is a cryptographic event ledger for AI systems. It stores assertions (subject-predicate-object triples with confidence scores), signs them with Ed25519, Merkle-chains them into verifiable receipts, and exposes them via 23 MCP tools.

## Session Continuity

At the start of every session, session state is automatically loaded via the SessionStart hook. At the end, it's saved via the SessionEnd hook. The AI can also call `session_save` during work to create richer checkpoints.

**MCP tools available:**
- `session_save` — persist session state (summary, files_changed, decisions, next_steps, blockers)
- `session_load` — restore last session for a project
- `session_list` — list all saved sessions
- `session_end` — end session with auto-generated summary

## Memory Operations

- `memory_ingest` — store content as a verified artifact
- `memory_query` — semantic search across assertions and artifacts
- `memory_verify` — run verification ladder, produce signed receipt
- `memory_health` — namespace health stats

## Proof Meter (Cost Tracking)

- `meter_authorize` — grant agent a spend budget
- `meter_spend` — record a usage event with signed receipt
- `meter_budget` — check remaining budget
- `meter_settle` — finalize receipts into Merkle-rooted batch
- `meter_verify` — verify receipt integrity

## vsync CLI

The `vsync` daemon auto-captures sessions from Claude Code, Cursor, and Windsurf:

```bash
npx @verifiedstate/sync init    # setup
vsync start                      # start daemon
vsync status                     # check status
vsync recap --since 2h           # session summary
vsync why <file>                 # who touched this file and why
vsync trail                      # full decision timeline
vsync handoff                    # create context for next session
```

## Core Rules

1. Assertions are append-only — never UPDATE or DELETE. Retract or supersede only.
2. Receipts are first-class queryable objects with Ed25519 signatures.
3. All policy evaluation: system > legal_hold > regulatory > org > namespace > user > agent.
4. Deny beats allow. Shorter retention wins unless legal_hold = true.
