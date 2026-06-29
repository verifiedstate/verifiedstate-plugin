---
name: audit-trail
description: "Use when reviewing what AI agents did, verifying work provenance, investigating decision history, checking receipts, reviewing session handoffs, or auditing agent activity. Triggers: 'what changed', 'who did this', 'show me the trail', 'verify receipt', 'audit', 'provenance', 'what happened', 'decision history'."
metadata:
  author: verifiedstate
  version: "0.1.0"
  priority: 6
  promptSignals:
    phrases:
      - "what changed"
      - "who did this"
      - "show the trail"
      - "audit trail"
      - "verify receipt"
      - "decision history"
      - "what happened"
      - "provenance"
      - "session handoff"
---

# Audit Trail — What Your Agents Did

## Reviewing Agent Activity

Use VerifiedState MCP tools to investigate what happened:

```
memory_query: "what decisions were made about [topic]"
memory_query_events: filter by time range, event type
```

## Verifying Receipts

Every assertion can be verified with a cryptographic receipt:
- Ed25519 signature on the claim hash
- Merkle chain linking to previous assertions by the same writer
- SCITT COSE_Sign1 export for interoperability

```
memory_verify: { assertion_id: "..." }
```

## vsync CLI for Local Audit

```bash
vsync trail              # full decision timeline
vsync why <file>         # who touched this file, when, why
vsync audit              # view local hash chain
vsync audit verify       # check hash chain integrity
vsync diff               # changes since last session
vsync last --agent claude  # recent activity by agent
```

## Session History

```
session_list: shows all saved sessions with timestamps
session_load: { project: "..." } restores context
```

## Trust Levels

Events captured through different paths have different integrity:
- **Plugin hooks (PostToolUse)**: Real-time capture during the session, inline signed
- **vsync daemon**: Passive capture from transcript files, slight delay
- **GitHub Action**: CI/CD capture from commits and PRs
- **Manual ingest**: Explicit `memory_ingest` calls

The dashboard shows provenance for each assertion so you can assess trust.
