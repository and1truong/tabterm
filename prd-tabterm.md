# PRD: TabTerm — Tabbed Terminal Workspace

**Version**: 0.2  
**Status**: Draft  
**Author**: Engineering  
**Date**: 2026-06-02  
**Changelog**: v0.2 — replaced simulated command set with real PTY via GoTTY subprocess (Option 4); removed the embedded AI assistant panel and Anthropic integration

---

## Problem Statement

Developers managing multiple projects, servers, or contexts must juggle multiple terminal windows and scattered notes. There is no unified tool that combines grouped terminal sessions and contextual note-taking — all persisted, cross-device, and shareable within a team or personal LAN. The cost of not solving this is constant context-switching overhead and lost session state across reboots or device changes.

---

## Goals

1. A developer can open any device on the LAN and get a real, interactive shell — not a simulated command runner.
2. Session groups reduce navigation time — finding the right terminal session takes under 3 seconds.
3. The server is runnable as a single `bun start` command with zero external services required (GoTTY spawned as a managed subprocess).
4. Notes survive server restarts.

---

## Non-Goals

- **Not a multi-user auth system**: No login, no user accounts. LAN-trust model only. Adding auth is a separate initiative.
- **Not a cloud SaaS**: Designed for local/LAN deployment. No cloud sync, no remote DB, no CDN.
- **Not a mobile-native app**: Responsive web is the target; no React Native or Capacitor wrapper in v1.
- **Not a GoTTY replacement**: GoTTY is used as a PTY subprocess only. Its own UI is never exposed directly to users; it is fully proxied and embedded.

---

## User Stories

### Primary Persona: Solo Developer (personal workstation + laptop)

- As a developer, I want a real shell in the browser so that I can run any command (`vim`, `ssh`, `htop`, `git`) without limitation.
- As a developer, I want my terminal sessions and notes to persist across reboots so that I don't lose context when I restart my machine.
- As a developer, I want to group related sessions (e.g. "backend", "infra") under a colored label so that I can navigate between contexts quickly.
- As a developer, I want to collapse a group I'm not currently working on so that the sidebar stays clean.
- As a developer, I want per-session notes so that I can capture observations, commands to remember, or TODO items next to the relevant terminal.

### Secondary Persona: Developer on multiple devices (desktop + laptop)

- As a developer, I want to open a browser on my laptop and see the same session layout I had on my desktop so that switching devices has zero setup cost.
- As a developer, I want changes I make on one device to reflect on my other device within a few seconds so that the two are never out of sync.

---

## Requirements

### P0 — Must Have

**1. Bun HTTP + WebSocket server**
- `Bun.serve` handles HTTP (serving the React SPA) and app-level WS on the same port.
- On mutation (session create, note write, group change), server persists to SQLite and broadcasts a diff payload to all connected clients.
- Acceptance:
  - Given two browsers connected to the server, when browser A creates a session, browser B receives the update within 500ms without refreshing.

**2. SQLite persistence via `bun:sqlite`**
- WAL mode enabled.
- Schema covers: `primary_tabs`, `sessions`, `groups`, `sidebar_order`, `notes`.
- Terminal scrollback is NOT stored in SQLite — GoTTY owns the PTY buffer. See Open Questions.
- All app state (layout, groups, notes) is loaded from SQLite on server start.
- Acceptance:
  - Given a server restart, when the client reconnects, all sessions, groups, and notes are fully restored.

**3. React SPA with Vite + Bun**
- Vite dev server proxies `/api`, `/ws`, and `/gotty/*` to the Bun backend during development.
- Production: `vite build` outputs static assets; Bun serves them directly.
- No SSR required in v1.

**4. Primary tabs + grouped session sidebar**
- Primary tabs represent workspaces (e.g. "workspace", "server", "logs").
- Each primary tab has its own sidebar order: a flat array of `groupId | sessionId`.
- Groups have: `label`, `color` (8 presets), `open: boolean`.
- Sessions inside a group show a tinted dot. Ungrouped sessions render as plain items.
- Collapse/expand is persisted per group in SQLite.
- Acceptance:
  - Given a group is collapsed, when the server restarts and client reconnects, the group remains collapsed.

**5. Real PTY terminal via GoTTY**

GoTTY is an open-source Go binary that exposes any shell command as a WebSocket-backed terminal over HTTP. The Bun server manages GoTTY as a subprocess.

Architecture:
```
xterm.js (browser)
    │ WS /gotty/ws/:sessionId
    ▼
Bun server (WS proxy)
    │ WS localhost:GOTTY_PORT/ws
    ▼
GoTTY process (one per session)
    │ PTY
    ▼
bash / zsh (real shell)
```

- On session create, Bun spawns a GoTTY process: `gotty --port <dynamic> --permit-write bash`
- GoTTY port is allocated dynamically (start from `gottyBasePort` in config, increment per session).
- Bun proxies the GoTTY WS connection at `/gotty/ws/:sessionId` — browser never connects to GoTTY directly.
- GoTTY process is tracked in a server-side `Map<sessionId, GoTTYProcess>`.
- On session delete, the corresponding GoTTY process is killed and its port freed.
- On server restart, GoTTY processes are re-spawned for all sessions stored in SQLite.
- `xterm.js` in the `Terminal` React component connects to `/gotty/ws/:sessionId`.
- Terminal resize (`xterm.js` `onResize`) sends a resize message proxied to GoTTY.

Acceptance:
  - Given a session is active, the user can run `vim`, `htop`, `ssh`, and `git` with full interactive behavior.
  - Given the server restarts, GoTTY processes are re-spawned and the browser reconnects automatically.
  - Given a session is deleted, its GoTTY process is terminated within 1 second.

**6. xterm.js terminal renderer**
- `xterm.js` v5 with `@xterm/addon-fit` for responsive resize.
- Connects to `/gotty/ws/:sessionId` on mount.
- Reconnects automatically on WS drop (exponential backoff, max 5 retries).
- Fit addon resizes PTY on container resize via `ResizeObserver`.
- Acceptance:
  - Given the browser window is resized, the PTY reflows correctly within 200ms.
  - Given the WS drops, xterm.js reconnects without user intervention.

**7. Sidebar: Notes panel**
- Per-session notes, multiple notes per session.
- Each note is a free-text textarea, auto-saved on `input` event with 300ms debounce.
- Acceptance:
  - Given a note is typed, when the user closes and reopens the browser, the note content is present.

**8. State broadcast via WebSocket**
- Server maintains a set of active app-level WS connections (separate from GoTTY proxy WS).
- On any app mutation, server persists first, then broadcasts to all other connected clients.
- Client merges incoming diff into Zustand store without full re-render.
- GoTTY WS streams are per-session point-to-point, not broadcast.
- Message protocol:
```typescript
// Server → Client (app state)
type ServerMessage =
  | { type: 'init'; state: AppState }
  | { type: 'patch'; entity: Entity; op: 'set'; data: any }
  | { type: 'patch'; entity: Entity; op: 'delete'; id: string }

// Client → Server (app mutations)
type ClientMessage =
  | { type: 'note:update'; noteId: string; content: string }
  | { type: 'session:create'; primaryTabId: string; groupId?: string; label: string }
  | { type: 'session:delete'; sessionId: string }
  | { type: 'group:create'; primaryTabId: string; label: string; color: string }
  | { type: 'group:toggle'; groupId: string }
  | { type: 'reorder'; primaryTabId: string; order: string[] }
```

---

### P1 — Nice to Have

- **Drag-to-reorder** sessions and groups within the sidebar.
- **Rename** primary tabs, groups, and sessions inline (double-click to edit).
- **Session delete confirmation** modal instead of immediate delete.
- **Keyboard shortcuts**: `Cmd+T` new session, `Cmd+W` close session, `Cmd+[1-9]` switch primary tab.
- **Note deletion** (× button per note).
- **Group color picker** extended to custom hex input.
- **Sidebar resizable** via drag handle.
- **Dark/light mode toggle** persisted per client in `localStorage`.
- **cwd tracking**: Parse shell prompt output (`$PS1` with embedded cwd) to keep cwd current without user input.
- **Session reconnect indicator**: Show a visual badge when GoTTY WS is reconnecting.
- **GoTTY health check**: Ping each GoTTY process every 30s; restart if unresponsive.

---

### P2 — Future

- **LAN auth**: Simple shared secret or passphrase gate before accessing the UI.
- **Scrollback persistence**: Serialize xterm.js buffer to SQLite on session suspend, restore on reconnect.
- **Export**: Download session scrollback as `.txt` or notes as `.md`.
- **Multiple shells**: Let user choose `bash`, `zsh`, or `fish` per session at creation time.
- **Split panes**: Horizontal/vertical terminal splits within a single session view.
- **Mobile-responsive layout**: Collapsible sidebar, touch-friendly input.
- **`bun build --compile`**: Single binary distribution bundling static assets.

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│  Browser                                         │
│  React + Zustand + xterm.js                      │
│  - App WS: session/group/note mutations          │
│  - PTY WS: /gotty/ws/:sessionId (per terminal)  │
└───────────────────┬──────────────────────────────┘
                    │ HTTP + WS (port 3000)
┌───────────────────▼──────────────────────────────┐
│  Bun server (src/server/)                        │
│  - HTTP: serve static SPA + REST /api/*          │
│  - App WS: broadcast mutations to all clients   │
│  - PTY WS proxy: /gotty/ws/:id → GoTTY process  │
│  - Process manager: spawn/kill GoTTY per session │
└──────┬────────────────────┬────────────────────┬─┘
       │ bun:sqlite         │ spawn              │ spawn
┌──────▼──────┐   ┌─────────▼───────┐  ┌────────▼──────┐
│  state.db   │   │ GoTTY :4001     │  │ GoTTY :4002   │  ...
│  (WAL mode) │   │ → bash (PTY)    │  │ → bash (PTY)  │
└─────────────┘   └─────────────────┘  └───────────────┘
```

---

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Runtime | Bun ≥ 1.1 | HTTP, WS, SQLite, process management |
| Frontend | React 18 + TypeScript | Vite for dev/build |
| Terminal renderer | xterm.js v5 + addon-fit | Connects to GoTTY WS proxy |
| PTY backend | GoTTY (Go binary) | One process per session, managed by Bun |
| State (client) | Zustand | Lightweight store |
| State (server) | `bun:sqlite` WAL | App state only; PTY buffer not persisted |
| Styling | Tailwind CSS v4 | Vite plugin |
| Dev proxy | Vite `server.proxy` | `/api` + `/ws` + `/gotty` → Bun port |

---

## Project Structure

```
tabterm/
├── bin/
│   └── gotty              # GoTTY binary (committed or downloaded on install)
├── src/
│   ├── server/
│   │   ├── index.ts       # Bun.serve entry
│   │   ├── db.ts          # bun:sqlite schema + queries
│   │   ├── routes.ts      # REST handlers
│   │   ├── ws.ts          # App WS pool + broadcast
│   │   └── gotty.ts       # GoTTY process manager (spawn/kill/proxy)
│   └── client/
│       ├── main.tsx
│       ├── store.ts       # Zustand
│       ├── ws.ts          # App WS client + reconnect
│       ├── components/
│       │   ├── App.tsx
│       │   ├── TitleBar.tsx
│       │   ├── Sidebar.tsx
│       │   ├── Terminal.tsx       # xterm.js + GoTTY WS
│       │   └── NotesPanel.tsx
│       └── types.ts
├── data/                  # state.db (gitignored)
├── vite.config.ts
├── tsconfig.json
├── package.json
└── config.sample.json     # dev config (port, gottyBasePort, …)
```

---

## SQLite Schema

```sql
CREATE TABLE primary_tabs (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  position INTEGER NOT NULL
);

CREATE TABLE groups (
  id TEXT PRIMARY KEY,
  primary_tab_id TEXT NOT NULL,
  label TEXT NOT NULL,
  color TEXT NOT NULL,
  is_open INTEGER NOT NULL DEFAULT 1,
  position INTEGER NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  primary_tab_id TEXT NOT NULL,
  group_id TEXT,
  label TEXT NOT NULL,
  cwd TEXT NOT NULL DEFAULT '~',
  gotty_port INTEGER,
  position INTEGER NOT NULL
);

CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

Note: `session_history` table from v0.1 is removed — PTY output is not stored in SQLite.

---

## Open Questions

| # | Question | Owner | Blocking? |
|---|---|---|---|
| 1 | GoTTY binary distribution: commit to repo, or `postinstall` script downloads for current OS/arch? | Engineering | Yes |
| 2 | When the server restarts mid-session, the PTY process is killed. Should the client show a "session ended" message in xterm.js rather than a blank reconnect? | Engineering | Yes |
| 3 | GoTTY supports `--permit-write` flag to allow input. Without it the terminal is read-only. Should write be always on, or togglable per session? | Engineering | Yes |
| 4 | cwd tracking: rely on user manually updating label, or parse `$PROMPT_COMMAND` / `$PS1`? Parsing is fragile across shells. | Engineering | No |
| 5 | Max concurrent GoTTY processes: should there be a hard cap (e.g. 20) to prevent resource exhaustion? | Engineering | No |
| 6 | When two clients view the same session simultaneously, both get the same PTY stream — is that the intended behavior (shared terminal), or should each client get its own shell? | Product | Yes |

---

## Success Metrics

### Leading (measure within 1 week of first use)
- Server cold start to usable browser terminal in under 5 seconds (`bun start` → xterm.js connected).
- GoTTY process re-spawned and terminal reconnected after server restart within 3 seconds.
- WS app-state delta arrives on second client within 500ms of mutation on first client.
- `vim` and `htop` render and respond correctly in xterm.js.

### Lagging (measure over first month)
- Daily usage across at least 2 devices without manually re-entering session context.

---

## Timeline

| Phase | Scope | Target |
|---|---|---|
| v0.1 | Bun server + SQLite schema + WS scaffold + React shell | Week 1 |
| v0.2 | GoTTY process manager + xterm.js integration + PTY proxy | Week 2 |
| v0.3 | Sidebar (groups + sessions) + multi-client WS sync | Week 3 |
| v0.4 | Notes panel | Week 4 |
| v0.5 | Polish, error states, reconnect UX, GoTTY health check | Week 5 |
| v1.0 | Stable, dog-fooded daily, P1 items triaged | Week 6 |

