import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { SessionCommand } from "../shared/types.ts";

// What happens to the underlying tmux session + any program (e.g. claude) running
// in it when the user clicks the close button on a sidebar tab.
//   keep      — leave tmux + the inner program running, detached. Reopen drops you
//               straight back in. Soft-closed only at the DB level.
//   interrupt — send two Ctrl+C into the pane (cancel-then-exit) so claude exits
//               cleanly, then soft-close. Reopen lands on a shell prompt; resume
//               your conversation with `claude --resume`. Stops billable work.
//   purge     — full kill: tmux session destroyed and DB row deleted. No archive.
export type CloseAction = "keep" | "interrupt" | "purge";

// Prod (compiled binary or NODE_ENV=production) reads ~/.config/tabterm.json.
// Dev reads config.sample.json from the repo root, so iterating locally never
// touches the prod DB. Every field is optional and falls back to a default.
interface FileConfig {
  dbPath?: string;
  port?: number;
  gottyBin?: string;
  gottyBasePort?: number;
  sessionInit?: string;
  // "off" disables the tmux-backed durable-session layer (sessions then run as
  // direct child shells, as before). Any other value / unset = use tmux when available.
  tmux?: string;
  // Launch profiles surfaced as sidebar/palette buttons beyond the bare-shell
  // default. Each entry maps a session `kind` (DB column) to the binary that
  // runs on entry plus the label/icon/color shown in the UI.
  sessionCommands?: SessionCommand[];
  // See CloseAction above. Default "interrupt" — stop in-flight AI work on close
  // since the tmux session would otherwise keep the program running detached.
  closeAction?: CloseAction;
  // When true, the client asks for confirmation before closing a session whose
  // status is "running" (claude mid-turn, etc.).
  confirmCloseWhenRunning?: boolean;
  // Auto-purge soft-closed sessions older than N days. 0 = disabled.
  autoPurgeClosedAfterDays?: number;
}

// No baked-in launch profiles by default — a fresh install shows only the plain
// "+ shell" action. Define `sessionCommands` in the config file to add buttons
// that launch a custom command (e.g. an AI CLI) as a session.
const DEFAULT_SESSION_COMMANDS: SessionCommand[] = [];

const HOME = homedir();
const COMPILED = import.meta.dir.startsWith("/$bunfs/");
const IS_PROD = COMPILED || process.env.NODE_ENV === "production";
const CONFIG_PATH = IS_PROD
  ? join(HOME, ".config/tabterm.json")
  : join(dirname(import.meta.dir), "..", "config.sample.json");

function expandHome(p: string): string {
  if (p === "~") return HOME;
  if (p.startsWith("~/")) return join(HOME, p.slice(2));
  return p;
}

function loadFile(): FileConfig {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as FileConfig;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") return {};
    console.warn(`[config] ignoring ${CONFIG_PATH}: ${e.message}`);
    return {};
  }
}

const file = loadFile();
// Suppress the boot banner when the user is just asking for -h/--help; the
// help output should land clean. Server starts print this normally.
const IS_HELP = process.argv.slice(2).some((a) => a === "-h" || a === "--help");
if (!IS_HELP) console.log(`[config] ${IS_PROD ? "prod" : "dev"} → ${CONFIG_PATH}`);

const VALID_CLOSE_ACTIONS: CloseAction[] = ["keep", "interrupt", "purge"];
function pickCloseAction(v: string | undefined): CloseAction {
  return v && (VALID_CLOSE_ACTIONS as string[]).includes(v) ? (v as CloseAction) : "interrupt";
}

export const config = {
  dbPath: expandHome(file.dbPath ?? "~/.config/tabterm.db"),
  port: file.port ?? 3000,
  gottyBin: file.gottyBin ? expandHome(file.gottyBin) : undefined,
  gottyBasePort: file.gottyBasePort ?? 4001,
  sessionInit: file.sessionInit,
  tmux: file.tmux,
  sessionCommands: (file.sessionCommands ?? DEFAULT_SESSION_COMMANDS).map((c) => ({
    ...c,
    command: expandHome(c.command),
  })),
  closeAction: pickCloseAction(file.closeAction),
  confirmCloseWhenRunning: file.confirmCloseWhenRunning ?? false,
  autoPurgeClosedAfterDays: Math.max(0, file.autoPurgeClosedAfterDays ?? 0),
};

// Surfaced to clients (init payload) so the UI can confirm before closing a
// running session. Keep this minimal — server-side knobs stay server-side.
export interface ClientConfig {
  confirmCloseWhenRunning: boolean;
}
export function clientConfig(): ClientConfig {
  return { confirmCloseWhenRunning: config.confirmCloseWhenRunning };
}

// Used by `tabterm -h` to print the config schema.
export const CONFIG_DOC: { key: string; type: string; default: string; doc: string }[] = [
  { key: "dbPath", type: "string", default: "~/.config/tabterm.db", doc: "SQLite state file." },
  { key: "port", type: "number", default: "3000", doc: "HTTP/WebSocket port." },
  { key: "gottyBin", type: "string", default: "<bundled>", doc: "Override path to the gotty binary." },
  { key: "gottyBasePort", type: "number", default: "4001", doc: "Lowest port assigned to per-session GoTTY children." },
  { key: "sessionInit", type: "string", default: "<unset>", doc: "Extra shell snippet sourced inside every session." },
  { key: "tmux", type: '"auto"|"off"', default: "auto", doc: "Disable durable tmux backing with \"off\"." },
  { key: "sessionCommands", type: "SessionCommand[]", default: "[]", doc: "Launch-profile buttons (claude, opus, …)." },
  { key: "closeAction", type: '"keep"|"interrupt"|"purge"', default: "interrupt", doc: "What the X button does. interrupt = 2× Ctrl+C, then soft-close." },
  { key: "confirmCloseWhenRunning", type: "boolean", default: "false", doc: "Confirm in the UI before closing a session whose status is running." },
  { key: "autoPurgeClosedAfterDays", type: "number", default: "0", doc: "Auto-purge soft-closed sessions older than N days. 0 disables." },
];

export { CONFIG_PATH };
