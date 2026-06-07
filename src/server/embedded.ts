import { chmodSync, existsSync, mkdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { GOTTY_EMBED, SESSION_INIT_EMBED, SPA_FILES } from "./embedded.generated.ts";

// When the compiled binary runs, embedded.generated.ts holds /$bunfs/ paths
// for every SPA asset, the gotty binary, and session-init.bash. We extract the
// executable + bash script to ~/.cache/tabterm/ on demand (the OS can't exec
// directly out of the bunfs virtual fs) and serve SPA assets straight from it.

const CACHE_DIR = join(homedir(), ".cache/tabterm");

export function hasEmbeddedSpa(): boolean {
  return Object.keys(SPA_FILES).length > 0;
}

export function getSpaFile(urlPath: string): import("bun").BunFile | null {
  const embedded = SPA_FILES[urlPath];
  return embedded ? Bun.file(embedded) : null;
}

async function extract(embeddedPath: string, name: string, exec: boolean): Promise<string> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const target = join(CACHE_DIR, name);
  const src = Bun.file(embeddedPath);
  const expectedSize = src.size;
  if (!existsSync(target) || statSync(target).size !== expectedSize) {
    await Bun.write(target, src);
  }
  if (exec) chmodSync(target, 0o755);
  return target;
}

let gottyPromise: Promise<string> | null = null;
export function extractGotty(): Promise<string> | null {
  if (!GOTTY_EMBED) return null;
  if (!gottyPromise) gottyPromise = extract(GOTTY_EMBED, "gotty", true);
  return gottyPromise;
}

let initPromise: Promise<string> | null = null;
export function extractSessionInit(): Promise<string> | null {
  if (!SESSION_INIT_EMBED) return null;
  if (!initPromise) initPromise = extract(SESSION_INIT_EMBED, "session-init.bash", false);
  return initPromise;
}
