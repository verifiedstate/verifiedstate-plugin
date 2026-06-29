#!/usr/bin/env node
// hooks/post-tool-use.mjs — Real-time tool call capture with dedup
//
// Fires after EVERY tool call in Claude Code. Captures:
// - Tool name, input summary, output summary
// - Files changed (for Edit/Write)
// - Commands run (for Bash)
//
// Two modes:
//   - Cloud: ingests to VerifiedState API (with API key)
//   - Local: appends to ~/.vsync/timeline.jsonl (no signup needed)
//
// Dedup: writes markers so vsync daemon skips already-captured events.
//
// Only captures "interesting" tools to avoid noise:
// - Edit, Write, Bash, Agent, Skill, NotebookEdit → always capture
// - Read, Glob, Grep → skip (read-only, high volume, low signal)
// - MCP calls → capture (cross-tool coordination)

import { mcpCall, writeDedupMarker, writeLocalEvent, getConfig, parseInput, scrubSecrets } from "./hook-env.mjs";
import { createHash } from "crypto";

const CAPTURE_TOOLS = new Set([
  "Edit", "Write", "Bash", "Agent", "Skill",
  "NotebookEdit", "WebFetch", "WebSearch",
]);

function isMcpTool(name) {
  return name?.startsWith("mcp__") || false;
}

function summarizeInput(tool, input) {
  if (!input) return "";
  switch (tool) {
    case "Edit":
      return `${input.file_path || "?"}: replace ${(input.old_string || "").slice(0, 60)}...`;
    case "Write":
      return `${input.file_path || "?"}: ${(input.content || "").length} chars`;
    case "Bash":
      return (input.command || "").slice(0, 120);
    case "Agent":
      return `${input.subagent_type || "general"}: ${(input.description || input.prompt || "").slice(0, 80)}`;
    case "Skill":
      return `/${input.skill || "?"}${input.args ? " " + input.args.slice(0, 60) : ""}`;
    default:
      const keys = Object.keys(input).slice(0, 3);
      return keys.map((k) => `${k}=${String(input[k]).slice(0, 40)}`).join(", ");
  }
}

function extractFilesChanged(tool, input) {
  if (tool === "Edit" || tool === "Write") {
    return input?.file_path ? [input.file_path] : [];
  }
  return [];
}

async function main() {
  const config = getConfig();
  const input = parseInput();
  const toolName = input.tool_name || input.tool || "";
  const toolInput = input.tool_input || input.input || {};
  const toolResult = input.tool_result || input.output || "";

  // Skip read-only, high-volume tools
  if (!CAPTURE_TOOLS.has(toolName) && !isMcpTool(toolName)) return;

  // Skip failed bash commands that are just checks
  if (toolName === "Bash" && toolResult?.includes?.("command not found")) return;

  // Build dedup key
  const inputStr = JSON.stringify(toolInput).slice(0, 500);
  const dedupKey = createHash("sha256")
    .update(`${toolName}:${inputStr}:${Date.now().toString().slice(0, -3)}`)
    .digest("hex")
    .slice(0, 16);

  writeDedupMarker(dedupKey);

  const summary = scrubSecrets(summarizeInput(toolName, toolInput));
  const filesChanged = extractFilesChanged(toolName, toolInput);
  const resultPreview = scrubSecrets(
    typeof toolResult === "string"
      ? toolResult.slice(0, 200)
      : JSON.stringify(toolResult).slice(0, 200)
  );

  // ── Always write locally ──────────────────────────────────────────
  writeLocalEvent({
    type: "tool_use",
    tool: toolName,
    summary,
    files_changed: filesChanged,
    dedup_key: dedupKey,
  });

  // ── Cloud mode: also ingest to API ────────────────────────────────
  if (config.mode === "cloud") {
    const content = scrubSecrets([
      `[PostToolUse] ${toolName}: ${summary}`,
      filesChanged.length > 0 ? `Files: ${filesChanged.join(", ")}` : "",
      resultPreview ? `Result: ${resultPreview}` : "",
    ].filter(Boolean).join("\n"));

    // Fire and forget — don't block the session
    mcpCall("memory_ingest", {
      content,
      source_type: "tool_output",
      metadata: {
        hook: "PostToolUse",
        tool: toolName,
        files_changed: filesChanged,
        dedup_key: dedupKey,
      },
    }).catch(() => {});
  }
}

main().catch(() => {});
