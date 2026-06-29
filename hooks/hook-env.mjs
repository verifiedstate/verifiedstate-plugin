// hooks/hook-env.mjs — shared runtime for VerifiedState plugin hooks
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, chmodSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const pluginRoot = join(__dirname, "..");

// ── Config ──────────────────────────────────────────────────────────
const VSYNC_DIR = join(process.env.HOME || "", ".vsync");
const CONFIG_PATH = join(VSYNC_DIR, "config.json");
const DEDUP_PATH = join(VSYNC_DIR, "plugin-dedup.json");
const TIMELINE_PATH = join(VSYNC_DIR, "timeline.jsonl");
const MAX_STDIN_BYTES = 256 * 1024; // 256KB max input

// ── Secret scrubbing ────────────────────────────────────────────────
// Redact common secret patterns before writing to timeline or API.
const SECRET_PATTERNS = [
  /(?:sk|pk|rk|vs|vm)[-_](?:live|test|prod|anon|secret)[_-][\w]{16,}/gi,  // API keys
  /ghp_[\w]{36,}/gi,                               // GitHub PATs
  /gho_[\w]{36,}/gi,                               // GitHub OAuth
  /github_pat_[\w]{20,}/gi,                         // GitHub fine-grained
  /glpat-[\w-]{20,}/gi,                             // GitLab PATs
  /AKIA[\w]{16}/g,                                  // AWS access keys
  /eyJ[\w-]{20,}\.eyJ[\w-]{20,}\.[\w-]{20,}/g,     // JWTs
  /Bearer\s+[\w.-]{20,}/gi,                         // Bearer tokens
  /(?:password|passwd|pwd|secret|token|api_key|apikey|auth)\s*[:=]\s*['"]?[\w!@#$%^&*()-]{8,}/gi,
  /-----BEGIN\s[\w\s]+KEY-----/g,                   // PEM headers
  /(?:postgres|mysql|mongodb|redis):\/\/[^\s'"]+/gi, // Connection strings
  /xox[bpras]-[\w-]{10,}/gi,                        // Slack tokens
  /sk-[\w]{20,}/gi,                                 // OpenAI keys
  /SG\.[\w-]{22,}/gi,                               // SendGrid keys
];

export function scrubSecrets(text) {
  if (!text || typeof text !== "string") return text;
  let scrubbed = text;
  for (const pattern of SECRET_PATTERNS) {
    scrubbed = scrubbed.replace(pattern, "[REDACTED]");
  }
  return scrubbed;
}

// ── Safe directory + file creation ──────────────────────────────────
function ensureVsyncDir() {
  if (!existsSync(VSYNC_DIR)) {
    mkdirSync(VSYNC_DIR, { recursive: true, mode: 0o700 });
  }
}

function safeWriteFile(filePath, data) {
  ensureVsyncDir();
  writeFileSync(filePath, data, { mode: 0o600 });
}

function safeAppendFile(filePath, data) {
  ensureVsyncDir();
  appendFileSync(filePath, data, { mode: 0o600 });
}

const MCP_ENDPOINT = "https://mcp.verifiedstate.ai/mcp";

let _config = null;
export function getConfig() {
  if (_config) return _config;
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    _config = {
      api_key: raw.api_key || "",
      namespace_id: raw.namespace_id || "",
      endpoint: MCP_ENDPOINT,
      mode: raw.api_key ? "cloud" : "local",
    };
  } catch {
    _config = {
      api_key: process.env.VERIFIEDSTATE_API_KEY || "",
      namespace_id: process.env.VERIFIEDSTATE_NAMESPACE_ID || "",
      endpoint: process.env.VERIFIEDSTATE_ENDPOINT || MCP_ENDPOINT,
      mode: process.env.VERIFIEDSTATE_API_KEY ? "cloud" : "local",
    };
  }
  return _config;
}

// ── Local timeline (works without API key) ──────────────────────────
// Appends JSONL events to ~/.vsync/timeline.jsonl so the plugin has
// value even without signup. Users can upgrade to cloud sync later.
export function writeLocalEvent(event) {
  try {
    const entry = {
      ...event,
      // Scrub any secrets from summary or other string fields
      summary: scrubSecrets(event.summary),
      ts: new Date().toISOString(),
      cwd: process.env.PWD || process.cwd(),
    };
    safeAppendFile(TIMELINE_PATH, JSON.stringify(entry) + "\n");
  } catch {
    // Non-fatal
  }
}

export function readLocalTimeline(limit = 50) {
  try {
    const lines = readFileSync(TIMELINE_PATH, "utf-8").trim().split("\n");
    return lines.slice(-limit).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch {
    return [];
  }
}

// ── MCP JSON-RPC call ───────────────────────────────────────────────
export async function mcpCall(method, args) {
  const config = getConfig();
  if (!config.api_key) return null;

  const payload = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: method, arguments: args },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.api_key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await res.json();
    // MCP response has multiple content blocks — find the one with structured JSON
    const contents = data?.result?.content || [];
    for (const c of contents) {
      if (c.text) {
        try {
          const parsed = JSON.parse(c.text);
          // Prefer the block with structured session data (has "found" or "summary")
          if (parsed.found !== undefined || parsed.summary || parsed.artifact_id) {
            return parsed;
          }
        } catch {
          // Not JSON, skip
        }
      }
    }
    // Fallback: try first content block
    if (contents[0]?.text) {
      try { return JSON.parse(contents[0].text); } catch {}
    }
    return data?.result || null;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

// ── Dedup against vsync daemon ──────────────────────────────────────
// The daemon watches .jsonl transcript files. The plugin fires during
// the session. To avoid double-capture, we write a dedup marker that
// the daemon checks before ingesting the same turn.
export function writeDedupMarker(eventId) {
  try {
    let markers = {};
    try {
      markers = JSON.parse(readFileSync(DEDUP_PATH, "utf-8"));
    } catch {}

    // Keep only last 500 markers, expire entries older than 24h
    const now = Date.now();
    const DAY_MS = 86400000;
    const keys = Object.keys(markers);
    for (const k of keys) {
      if (now - markers[k] > DAY_MS) delete markers[k];
    }
    if (Object.keys(markers).length > 500) {
      const sorted = Object.entries(markers).sort((a, b) => a[1] - b[1]);
      for (const [k] of sorted.slice(0, sorted.length - 400)) {
        delete markers[k];
      }
    }

    markers[eventId] = now;
    safeWriteFile(DEDUP_PATH, JSON.stringify(markers));
  } catch {
    // Non-fatal — dedup is best-effort
  }
}

export function isDuplicate(eventId) {
  try {
    const markers = JSON.parse(readFileSync(DEDUP_PATH, "utf-8"));
    return !!markers[eventId];
  } catch {
    return false;
  }
}

// ── Git helpers ─────────────────────────────────────────────────────
export function gitInfo(cwd) {
  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd, encoding: "utf-8" }).trim();
    const lastCommit = execSync("git log --oneline -1 --no-decorate", { cwd, encoding: "utf-8" }).trim();
    const changedFiles = execSync("git diff --name-only HEAD", { cwd, encoding: "utf-8" })
      .trim()
      .split("\n")
      .filter(Boolean)
      .slice(0, 20);
    const untrackedFiles = execSync("git ls-files --others --exclude-standard", { cwd, encoding: "utf-8" })
      .trim()
      .split("\n")
      .filter(Boolean)
      .slice(0, 10);
    return {
      branch,
      lastCommit,
      changedFiles: [...new Set([...changedFiles, ...untrackedFiles])].slice(0, 30),
    };
  } catch {
    return { branch: "unknown", lastCommit: "", changedFiles: [] };
  }
}

// ── Output formatting ───────────────────────────────────────────────
export function formatOutput(systemMessage) {
  return JSON.stringify({ systemMessage });
}

// ── Input parsing ───────────────────────────────────────────────────
export function parseInput() {
  try {
    const raw = readFileSync("/dev/stdin", "utf-8");
    if (!raw || raw.length > MAX_STDIN_BYTES) return {};
    return JSON.parse(raw.trim());
  } catch {
    return {};
  }
}
