#!/usr/bin/env node
// hooks/session-end.mjs — Auto-save session on Claude Code exit
//
// Safety net for crashed/exited sessions.
// Primary save is AI-authored session_save calls during conversation.
//
// Two modes:
//   - Cloud: saves to VerifiedState API (skips if recent AI save exists)
//   - Local: writes summary to ~/.vsync/timeline.jsonl

import { mcpCall, formatOutput, getConfig, gitInfo, writeLocalEvent } from "./hook-env.mjs";

const FRESHNESS_THRESHOLD_MS = 5 * 60 * 1000;

async function main() {
  const config = getConfig();
  const cwd = process.env.PWD || process.cwd();
  const git = gitInfo(cwd);

  // ── Always write locally ──────────────────────────────────────────
  writeLocalEvent({
    type: "session_end",
    summary: `${git.changedFiles.length} files touched on branch ${git.branch}. Last commit: ${git.lastCommit}`,
    branch: git.branch,
    files_changed: git.changedFiles,
  });

  // ── Cloud mode ────────────────────────────────────────────────────
  if (config.mode === "cloud") {
    // Freshness check — don't overwrite recent AI-authored save
    const existing = await mcpCall("session_load", { project: "verified-memory" });
    if (existing?.saved_at) {
      const diff = Date.now() - new Date(existing.saved_at.replace("Z", "+00:00")).getTime();
      if (diff < FRESHNESS_THRESHOLD_MS) {
        console.log(formatOutput("session auto-save skipped — recent AI-authored save exists"));
        return;
      }
    }

    const summary = `Hook fallback: ${git.changedFiles.length} files touched on branch ${git.branch}. Last commit: ${git.lastCommit}`;
    const nextSteps = git.changedFiles.length > 0
      ? ["Review and commit uncommitted changes", "Continue from last commit"]
      : ["No uncommitted changes — pick up from last commit"];

    await mcpCall("session_save", {
      project: "verified-memory",
      summary,
      files_changed: git.changedFiles,
      decisions: [],
      next_steps: nextSteps,
      blockers: [],
    });

    // Semantic ingest from git context
    if (git.changedFiles.length > 0 || git.lastCommit) {
      const content = [
        `Claude Code session ended on branch ${git.branch}.`,
        git.lastCommit ? `Last commit: ${git.lastCommit}` : "",
        git.changedFiles.length > 0 ? `Files changed (${git.changedFiles.length}): ${JSON.stringify(git.changedFiles.slice(0, 15))}` : "",
      ].filter(Boolean).join(" ");

      await mcpCall("memory_ingest", { content, source_type: "tool_output" });
    }
  }

  console.log(formatOutput(
    config.mode === "cloud"
      ? "session auto-saved to VerifiedState"
      : "session saved locally to ~/.vsync/timeline.jsonl"
  ));
}

main().catch(() => {
  console.log(formatOutput("session auto-save failed"));
});
