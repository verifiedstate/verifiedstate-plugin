#!/usr/bin/env node
// hooks/session-start.mjs — Load VerifiedState session on Claude Code start
// Fires on: startup, resume, clear, compact
// Injects the last session state as a system message for full context.
// Works in two modes:
//   - Cloud: loads from VerifiedState API (with API key)
//   - Local: reads recent timeline from ~/.vsync/timeline.jsonl (no signup)

import { mcpCall, formatOutput, getConfig, readLocalTimeline } from "./hook-env.mjs";

async function main() {
  const config = getConfig();

  // ── Cloud mode ────────────────────────────────────────────────────
  if (config.mode === "cloud") {
    const result = await mcpCall("session_load", { project: "verified-memory" });

    if (!result?.summary) {
      console.log(formatOutput("[VerifiedState] No previous session found."));
      return;
    }

    const parts = [`Last session (${result.saved_at || "?"}): ${result.summary}`];
    if (result.next_steps?.length > 0) {
      parts.push("Next: " + result.next_steps.slice(0, 3).join("; "));
    }
    if (result.blockers?.length > 0) {
      parts.push("Blockers: " + result.blockers.slice(0, 3).join("; "));
    }

    console.log(formatOutput(`[VerifiedState] ${parts.join(" | ")}`));
    return;
  }

  // ── Local mode (no API key) ───────────────────────────────────────
  const events = readLocalTimeline(20);
  if (events.length === 0) {
    console.log(formatOutput("[VerifiedState] Capturing session locally. Run `npx @verifiedstate/sync init` to enable cloud sync + search."));
    return;
  }

  // Summarize recent local activity
  const sessionEvents = events.filter((e) => e.type === "session_end");
  const toolEvents = events.filter((e) => e.type === "tool_use");

  const parts = [];
  if (sessionEvents.length > 0) {
    const last = sessionEvents[sessionEvents.length - 1];
    parts.push(`Last local session (${last.ts}): ${last.summary || "no summary"}`);
  }
  parts.push(`${toolEvents.length} tool calls captured locally`);
  parts.push("Run `npx @verifiedstate/sync init` to enable cloud sync + search");

  console.log(formatOutput(`[VerifiedState] ${parts.join(" | ")}`));
}

main().catch(() => {
  console.log(formatOutput("[VerifiedState] Session load failed"));
});
