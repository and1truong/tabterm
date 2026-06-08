import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// Prod (compiled binary or NODE_ENV=production) reads ~/.config/tabterm.json.
// Dev reads config.sample.json from the repo root, so iterating locally never
// touches the prod DB. Every field is optional; env vars still override.
interface FileConfig {
  dbPath?: string;
  port?: number;
  gottyBin?: string;
  gottyBasePort?: number;
  sessionInit?: string;
  // Command to launch for "claude" sessions. Defaults to "claude"; point at the
  // absolute path of your binary if it lives outside $PATH (e.g. "~/bin/opus").
  claudeCommand?: string;
}

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
console.log(`[config] ${IS_PROD ? "prod" : "dev"} → ${CONFIG_PATH}`);

function envStr(key: string): string | undefined {
  const v = process.env[key];
  return v && v.length > 0 ? v : undefined;
}
function envNum(key: string): number | undefined {
  const v = process.env[key];
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export const config = {
  dbPath: expandHome(file.dbPath ?? "~/.config/tabterm.db"),
  port: envNum("PORT") ?? file.port ?? 3000,
  gottyBin: envStr("GOTTY_BIN") ?? (file.gottyBin ? expandHome(file.gottyBin) : undefined),
  gottyBasePort: envNum("GOTTY_BASE_PORT") ?? file.gottyBasePort ?? 4001,
  sessionInit: envStr("SESSION_INIT") ?? file.sessionInit,
  claudeCommand:
    envStr("CLAUDE_COMMAND") ?? (file.claudeCommand ? expandHome(file.claudeCommand) : "claude"),
};
