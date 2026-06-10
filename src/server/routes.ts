import { readdirSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize } from "node:path";
import { homedir, tmpdir } from "node:os";
import { getSession, loadState } from "./db.ts";
import { setStatus } from "./status.ts";
import { broadcastNotify } from "./ws.ts";

// Minimal REST surface for v0.1. The app's live data flows over the WS;
// these endpoints are for health checks and non-WS state inspection.
export function handleApi(url: URL): Response | null {
  if (url.pathname === "/api/health") {
    return Response.json({ ok: true });
  }
  if (url.pathname === "/api/state") {
    return Response.json(loadState());
  }
  if (url.pathname === "/api/fs/ls") {
    return handleFsLs(url);
  }
  return null;
}

// List immediate child directories of `path` (or $HOME when omitted) so the
// client can render a tree-walking folder picker for the workspace cwd.
// Hidden directories (dotfiles) are excluded by default.
function handleFsLs(url: URL): Response {
  const raw = url.searchParams.get("path") ?? "";
  const showHidden = url.searchParams.get("hidden") === "1";

  let path = raw.trim();
  if (!path || path === "~") path = homedir();
  else if (path.startsWith("~/")) path = join(homedir(), path.slice(2));
  if (!isAbsolute(path)) return Response.json({ error: "path must be absolute" }, { status: 400 });
  path = normalize(path);

  let stat;
  try {
    stat = statSync(path);
  } catch {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  if (!stat.isDirectory()) {
    return Response.json({ error: "not a directory" }, { status: 400 });
  }

  let entries: { name: string; isDir: boolean }[] = [];
  try {
    entries = readdirSync(path, { withFileTypes: true })
      .filter((e) => (showHidden ? true : !e.name.startsWith(".")))
      .filter((e) => e.isDirectory())
      .map((e) => ({ name: e.name, isDir: true }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return Response.json({ error: "permission denied" }, { status: 403 });
  }

  const parent = path === "/" ? null : dirname(path);
  return Response.json({ path, parent, home: homedir(), entries });
}

// Update a session's running/idle indicator. Posted by claude-code hooks
// (UserPromptSubmit → running, Stop → idle) and available to anything else
// that wants to flag activity from inside a session.
export async function handleStatusUpdate(req: Request, sessionId: string): Promise<Response> {
  if (!getSession(sessionId)) {
    return Response.json({ error: "unknown session" }, { status: 404 });
  }
  let body: { status?: string };
  try {
    body = (await req.json()) as { status?: string };
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const next = body.status;
  if (next !== "running" && next !== "idle") {
    return Response.json({ error: "status must be 'running' or 'idle'" }, { status: 400 });
  }
  setStatus(sessionId, next);
  return new Response(null, { status: 204 });
}

// Ephemeral attention ping. Posted by the claude Notification hook, which pipes
// its stdin (Claude's hook payload, including `message`) straight here. We pull
// the message out and broadcast it; the client decides whether to badge/notify.
export async function handleNotify(req: Request, sessionId: string): Promise<Response> {
  if (!getSession(sessionId)) {
    return Response.json({ error: "unknown session" }, { status: 404 });
  }
  let body: { message?: unknown };
  try {
    body = (await req.json()) as { message?: unknown };
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const message =
    typeof body.message === "string" && body.message.trim()
      ? body.message.trim()
      : "Claude needs your attention";
  broadcastNotify(sessionId, message);
  return new Response(null, { status: 204 });
}

// Browsers don't expose the original filesystem path of a dropped file. When
// the drop carries no `text/uri-list`, the client uploads the File blobs here
// and we hand back absolute paths the terminal can splice in like typed input.
export async function handleUpload(req: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "invalid form" }, { status: 400 });
  }
  const files = form.getAll("file").filter((v): v is File => v instanceof File);
  if (!files.length) return Response.json({ error: "no files" }, { status: 400 });

  const dir = join(tmpdir(), "tabterm-uploads", crypto.randomUUID());
  await mkdir(dir, { recursive: true });
  const paths: string[] = [];
  for (const f of files) {
    const safe = f.name.replace(/[/\\]/g, "_") || "upload";
    const p = join(dir, safe);
    await writeFile(p, new Uint8Array(await f.arrayBuffer()));
    paths.push(p);
  }
  return Response.json({ paths });
}
