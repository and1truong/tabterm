# TabTerm

A tabbed terminal workspace for your LAN. Open any device in a browser and get a
real, interactive shell — grouped into sessions with per-session notes, all
persisted to SQLite and synced live across every connected client.

Terminals are real PTYs (run `vim`, `htop`, `ssh`, `git` — anything), backed by
[GoTTY](https://github.com/sorenisanerd/gotty) subprocesses that TabTerm spawns
and proxies. No login, no cloud, no external services: just `bun start`.

## Features

- **Real shells in the browser** — one GoTTY-backed PTY per session, rendered
  with xterm.js (auto-fit, auto-reconnect).
- **Grouped sessions** — organize sessions under colored, collapsible groups,
  across multiple primary-tab workspaces.
- **Per-session notes** — free-text notes that auto-save and persist.
- **Live multi-device sync** — mutations broadcast over WebSocket; open the same
  layout on your desktop and laptop and stay in sync.
- **Persistent** — layout, groups, sessions, and notes are stored in SQLite
  (WAL) and restored on restart; GoTTY processes are re-spawned automatically.

## Requirements

- [Bun](https://bun.sh) ≥ 1.1
- GoTTY — fetched automatically via the `postinstall` script (`bun install`).

## Quick start

```bash
bun install        # installs deps + downloads the GoTTY binary
bun run dev        # server + Vite client with hot reload
```

Then open the printed URL (default http://localhost:3000).

### Production

```bash
bun run build      # build the React SPA into dist/
bun start          # NODE_ENV=production: Bun serves the SPA + API on one port
```

## Configuration

All configuration lives in a single JSON file. Every field is optional and falls
back to a sensible default.

- **Dev**: `config.sample.json` in the repo root (so local runs never touch your
  prod database). See that file for an example.
- **Prod** (compiled binary or `NODE_ENV=production`): `~/.config/tabterm.json`.

| Key | Default | Description |
|---|---|---|
| `dbPath` | `~/.config/tabterm.db` | Path to the SQLite database. |
| `port` | `3000` | HTTP + WebSocket server port. |
| `gottyBasePort` | `4001` | First port for dynamically-allocated GoTTY processes (one per session). |
| `gottyBin` | bundled binary | Path to the GoTTY binary. |
| `sessionInit` | _(none)_ | Path to a session-init script, or `"off"` to launch `$SHELL` directly. |
| `claudeCommand` | `claude` | Command launched for "Claude session". Use an absolute path if it's outside `$PATH`. |

Paths support `~` expansion. Example `~/.config/tabterm.json`:

```json
{
  "dbPath": "~/.config/tabterm.db",
  "port": 8080,
  "gottyBasePort": 4001
}
```

## Architecture

```
┌──────────────────────────────────────────────────┐
│  Browser — React + Zustand + xterm.js            │
│  - App WS:  session/group/note mutations         │
│  - PTY WS:  /gotty/ws/:sessionId (per terminal)  │
└───────────────────┬──────────────────────────────┘
                    │ HTTP + WS (one port)
┌───────────────────▼──────────────────────────────┐
│  Bun server (src/server/)                        │
│  - Serves the SPA + REST /api/*                  │
│  - App WS: broadcasts mutations to all clients   │
│  - PTY WS proxy: /gotty/ws/:id → GoTTY process   │
│  - Process manager: spawn/kill GoTTY per session │
└──────┬────────────────────┬──────────────────────┘
       │ bun:sqlite         │ spawn (one per session)
┌──────▼──────┐   ┌─────────▼───────┐
│  state.db   │   │ GoTTY → bash    │  ...
│  (WAL)      │   │ (real PTY)      │
└─────────────┘   └─────────────────┘
```

The browser never connects to GoTTY directly — every PTY stream is proxied
through the Bun server. App state (layout, groups, notes) lives in SQLite; the
terminal scrollback buffer is owned by GoTTY and is not persisted.

## Tech stack

| Layer | Technology |
|---|---|
| Runtime | Bun (HTTP, WS, SQLite, process management) |
| Frontend | React 18 + TypeScript, Vite |
| Terminal | xterm.js v5 + `@xterm/addon-fit` |
| PTY backend | GoTTY (one subprocess per session) |
| State (client) | Zustand |
| State (server) | `bun:sqlite` (WAL) |
| Styling | Tailwind CSS v4 |

## Project layout

```
src/
├── server/        # Bun.serve entry, SQLite, routes, app WS, GoTTY manager, config
└── client/        # React SPA: store, WS client, components (Sidebar, Terminal, NotesPanel)
scripts/           # install-gotty, embed-asset generation
config.sample.json # dev config
```

## Scripts

| Command | Description |
|---|---|
| `bun run dev` | Server + client with hot reload |
| `bun run build` | Build the SPA into `dist/` |
| `bun start` | Run the production server |
| `bun run typecheck` | `tsc --noEmit` |

## Scope

TabTerm assumes a **LAN-trust model**: there is no authentication or user
accounts — anyone who can reach the port gets a shell. Run it only on trusted
networks. It is a local/LAN tool, not a cloud service.
