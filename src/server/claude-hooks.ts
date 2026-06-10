import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Ensure ~/.claude/settings.json carries UserPromptSubmit + Stop hooks that
// notify tabterm when claude starts/finishes a turn. Idempotent: re-runs at
// every boot but only touches the file if our marker is missing, so user-
// customized hooks are preserved across upgrades.

const TAG = "__tabterm_status_hook__";
const NOTIFY_TAG = "__tabterm_notify_hook__";

function curlCommand(status: "running" | "idle"): string {
  // The hook fires inside the claude process, which inherits TABTERM_BASE_URL
  // and TABTERM_SESSION_ID from gotty.ts:sessionEnv. `|| true` so a failed
  // POST never breaks claude's turn flow. `# __tabterm_status_hook__` is the
  // dedupe marker we grep for to decide whether to re-inject.
  return (
    `curl -fsS -m 1 -X POST -H 'Content-Type: application/json' ` +
    `-d '{"status":"${status}"}' ` +
    `"$TABTERM_BASE_URL/api/sessions/$TABTERM_SESSION_ID/status" >/dev/null 2>&1 || true` +
    ` # ${TAG}`
  );
}

function notifyCommand(): string {
  // Notification hooks receive Claude's event JSON (including `message`) on
  // stdin; `--data-binary @-` forwards it verbatim so the server can pull the
  // message out — no jq dependency. Same env-gating + `|| true` as above; the
  // POST is a harmless no-op outside tabterm (TABTERM_* unset).
  return (
    `curl -fsS -m 1 -X POST -H 'Content-Type: application/json' --data-binary @- ` +
    `"$TABTERM_BASE_URL/api/sessions/$TABTERM_SESSION_ID/notify" >/dev/null 2>&1 || true` +
    ` # ${NOTIFY_TAG}`
  );
}

interface HookEntry { type: string; command: string }
interface HookGroup { hooks: HookEntry[] }
interface ClaudeSettings {
  hooks?: Record<string, HookGroup[]>;
  [k: string]: unknown;
}

function ensureHook(settings: ClaudeSettings, event: string, command: string, marker: string): boolean {
  settings.hooks ??= {};
  settings.hooks[event] ??= [];
  for (const group of settings.hooks[event]) {
    for (const h of group.hooks ?? []) {
      if (h.command?.includes(marker)) return false;
    }
  }
  settings.hooks[event].push({ hooks: [{ type: "command", command }] });
  return true;
}

export function ensureClaudeHooks(): void {
  const dir = join(homedir(), ".claude");
  const path = join(dir, "settings.json");
  let settings: ClaudeSettings = {};
  try {
    settings = JSON.parse(readFileSync(path, "utf8")) as ClaudeSettings;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code !== "ENOENT") {
      console.warn(`[claude-hooks] skipping: ${path} is not valid JSON (${e.message})`);
      return;
    }
  }

  const a = ensureHook(settings, "UserPromptSubmit", curlCommand("running"), TAG);
  const b = ensureHook(settings, "Stop", curlCommand("idle"), TAG);
  const c = ensureHook(settings, "Notification", notifyCommand(), NOTIFY_TAG);
  if (!a && !b && !c) return;

  mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(settings, null, 2) + "\n");
  console.log(`[claude-hooks] installed UserPromptSubmit + Stop + Notification hooks at ${path}`);
}
