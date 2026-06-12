# Delete tab group — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users delete a tab group from the sidebar without losing the sessions inside it. Child sessions (open and soft-closed) are reparented to the top level of the same primary tab; the group row is removed.

**Architecture:** New WebSocket message `group:delete` sent from the sidebar's group-header hover X. Server-side `deleteGroup()` clears `group_id` on every child session, replaces the group's slot in the tab's `order` array with its open child ids (preserving in-group ordering), deletes the group row, then broadcasts the resulting patches in this order: group-delete → session-set (×N) → order-set.

**Tech Stack:** Bun (server), bun:sqlite, React + Zustand (client), TypeScript, WebSocket JSON messages, Tailwind, lucide-react icons.

**Project context this engineer needs:**
- No test framework is configured. Verification is `bunx tsc --noEmit` plus manual browser checks against `bun run dev`.
- Wire-protocol types live in `src/shared/types.ts` and are the source of truth for both sides.
- Server-side DB queries are prepared once in the `q` object at the top of `src/server/db.ts`. Add new ones there.
- Group rendering and delete UI live in `src/client/components/Sidebar.tsx`.
- Frequent commits per task, conventional-commit prefixes (`feat:` / `feat(server):` / `feat(client):`) — match `git log --oneline -5`.

---

### Task 1: Add `group:delete` to the wire protocol

**Files:**
- Modify: `src/shared/types.ts` (the `ClientMessage` union, currently ending at line 180)

- [ ] **Step 1: Add the new message variant**

Open `src/shared/types.ts`. Find the `ClientMessage` discriminated union (it starts around line 145 with `export type ClientMessage =`). Add a new variant right after the `group:toggle` line:

```ts
  | { type: "group:delete"; groupId: string }
```

Final ordering (the relevant slice):

```ts
  | { type: "group:create"; primaryTabId: string; label: string; color: GroupColor }
  | { type: "group:toggle"; groupId: string }
  | { type: "group:delete"; groupId: string }
  | { type: "tab:create"; label: string; cwd?: string; id?: string }
```

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit`

Expected: passes. (The server's `switch (msg.type)` is non-exhaustive — unknown branches just fall through — so adding a variant without a handler does not break typecheck. We'll wire the handler in Task 3.)

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(shared): add group:delete client message type"
```

---

### Task 2: Implement `deleteGroup()` in the server DB layer

**Files:**
- Modify: `src/server/db.ts` (add a query to the `q` object near line 295, add the function below `toggleGroup` near line 506)

- [ ] **Step 1: Add the new prepared query**

In `src/server/db.ts`, find the `q` object. Add this prepared query alongside the other group queries (next to `toggleGroup` at line 295):

```ts
  deleteGroup: db.query("DELETE FROM groups WHERE id = ?"),
  sessionsByGroup: db.query<SessionRow, [string]>(
    "SELECT * FROM sessions WHERE group_id = ? ORDER BY position",
  ),
```

Note: `setSessionGroupPos` already exists (line 302: `"UPDATE sessions SET group_id = ?, position = ? WHERE id = ?"`). We reuse it.

- [ ] **Step 2: Add the `deleteGroup` function**

In the same file, add this function immediately after `toggleGroup` (just below the closing brace of `toggleGroup` at line 506). The function signature, comment, and body:

```ts
// Hard-delete a group. Its child sessions (open and soft-closed) are reparented
// to the top level: group_id cleared, fresh top-level positions assigned, and
// the open ones slotted into `order` where the group used to live (so the
// user's mental layout is preserved). Soft-closed children get their group_id
// cleared too but stay out of `order` — they're hidden from the sidebar.
export function deleteGroup(
  groupId: string,
): { primaryTabId: string; order: string[]; sessions: Session[] } | null {
  const existing = q.getGroup.get(groupId);
  if (!existing) return null;
  const primaryTabId = existing.primary_tab_id;

  // Children in their original in-group order (closed_at is NULL for open ones).
  const childRows = q.sessionsByGroup.all(groupId);

  // Reparent every child. Position is a monotonically increasing scratch value
  // — actual sidebar ordering comes from `order` below.
  let nextPos = (q.maxSessionPos.get(primaryTabId)?.p ?? -1) + 1;
  const updatedSessions: Session[] = [];
  const openChildIds: string[] = [];
  for (const row of childRows) {
    q.setSessionGroupPos.run(null, nextPos, row.id);
    nextPos += 1;
    updatedSessions.push(toSession(q.getSession.get(row.id)!));
    if (row.closed_at == null) openChildIds.push(row.id);
  }

  // Drop the group row before rewriting `order`, so any reader looking up
  // groups[id] during the broadcast won't find a stale entry.
  q.deleteGroup.run(groupId);

  // Replace the group's slot in `order` with its open children, in their
  // original in-group order. Filter duplicates defensively.
  const prev = readOrder(primaryTabId);
  const idx = prev.indexOf(groupId);
  const seen = new Set<string>();
  const next: string[] = [];
  const push = (id: string) => {
    if (!seen.has(id)) {
      seen.add(id);
      next.push(id);
    }
  };
  if (idx === -1) {
    // Group wasn't in order for some reason — just append the orphans.
    for (const id of prev) push(id);
    for (const id of openChildIds) push(id);
  } else {
    for (let i = 0; i < idx; i++) push(prev[i]);
    for (const id of openChildIds) push(id);
    for (let i = idx + 1; i < prev.length; i++) push(prev[i]);
  }
  writeOrder(primaryTabId, next);

  return { primaryTabId, order: next, sessions: updatedSessions };
}
```

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit`

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/server/db.ts
git commit -m "feat(server): add deleteGroup that orphans children to top level"
```

---

### Task 3: Wire the `group:delete` WebSocket handler

**Files:**
- Modify: `src/server/ws.ts` (the `switch (msg.type)` block; add a case alongside the other `group:*` cases near line 107, and add `deleteGroup` to the existing db import at the top of the file)

- [ ] **Step 1: Import `deleteGroup` from the db module**

Open `src/server/ws.ts`. Find the existing import from `./db.ts` (it lists `createGroup`, `toggleGroup`, etc.). Add `deleteGroup` to that import list. Example shape:

```ts
import {
  createGroup,
  toggleGroup,
  deleteGroup,
  // ...rest unchanged
} from "./db.ts";
```

Keep whatever ordering the file already uses — just add the symbol.

- [ ] **Step 2: Add the handler case**

In the `switch (msg.type)` block, add this case immediately after the existing `group:toggle` case (which currently ends at line 111). The handler:

```ts
    case "group:delete": {
      const result = deleteGroup(msg.groupId);
      if (!result) break;
      broadcast({ type: "patch", entity: "group", op: "delete", id: msg.groupId });
      for (const session of result.sessions) broadcast(setPatch("session", session));
      broadcast(setPatch("order", { primaryTabId: result.primaryTabId, order: result.order }));
      break;
    }
```

Broadcast order matters: delete the group first so clients don't render a stale group row during the session-set patches; the order patch goes last so the sidebar layout settles in one final repaint.

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit`

Expected: passes.

- [ ] **Step 4: Smoke test the server compiles and starts**

Run: `bun run dev:server` (let it boot, watch for errors, then Ctrl-C).

Expected: no runtime errors on startup; the server logs its listening port.

- [ ] **Step 5: Commit**

```bash
git add src/server/ws.ts
git commit -m "feat(server): handle group:delete WS message"
```

---

### Task 4: Add the delete button to the group header in the sidebar

**Files:**
- Modify: `src/client/components/Sidebar.tsx` (import line for lucide icons; group-header JSX block near lines 222-251)

- [ ] **Step 1: Make sure the `X` icon is in the lucide import**

Open `src/client/components/Sidebar.tsx`. The current import at line 2 is:

```ts
import { FolderPlus, FolderTree, PanelLeftClose, Plus, X } from "lucide-react";
```

`X` is already imported (used by `SessionRow`). No change needed. Confirm by reading that line; if a future edit dropped it, re-add it.

- [ ] **Step 2: Add a `deleteGroup` helper near the other group helpers**

Inside the `Sidebar` component, just above the `addGroup` definition (around line 80), add:

```ts
  const deleteGroup = (group: { id: string; label: string }) => {
    const total = Object.values(sessions).filter((s) => s.groupId === group.id).length;
    if (
      total > 0 &&
      !window.confirm(
        `Delete group "${group.label}"? Its ${total} session${total === 1 ? "" : "s"} will move to the top level.`,
      )
    ) {
      return;
    }
    sendMessage({ type: "group:delete", groupId: group.id });
  };
```

This counts every session whose `groupId` matches — open and soft-closed alike — so the confirm reflects everything that will be reparented.

- [ ] **Step 3: Add the X button to the group header JSX**

Find the group header block. Today its trailing `+` button looks like this (around lines 241-250):

```tsx
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      addSession(group.id);
                    }}
                    className="hover:text-[var(--text)]"
                    title="New subtab in group"
                  >
                    <Plus size={13} />
                  </button>
```

Add a second button immediately after it, before the closing `</div>` of the header row:

```tsx
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteGroup(group);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-[var(--faint)] hover:text-red-400"
                    title="Delete group (sessions move to top level)"
                  >
                    <X size={13} />
                  </button>
```

- [ ] **Step 4: Add the `group` class to the header so `group-hover:opacity-100` actually triggers**

The hover-reveal pattern needs Tailwind's `group` class on the parent that the hover applies to. Look at the header `<div>` that wraps the icon, label, and buttons (around line 234 — the one with `flex items-center gap-1.5 px-2 py-1.5 ...`). Its current className starts with `flex`. Prepend `group ` to that className string:

Before:
```tsx
                  className={`flex items-center gap-1.5 px-2 py-1.5 text-xs uppercase tracking-wide text-[var(--faint)] cursor-pointer hover:text-[var(--muted)] ${insertBar(
                    `top:${group.id}`,
                  )}`}
```

After:
```tsx
                  className={`group flex items-center gap-1.5 px-2 py-1.5 text-xs uppercase tracking-wide text-[var(--faint)] cursor-pointer hover:text-[var(--muted)] ${insertBar(
                    `top:${group.id}`,
                  )}`}
```

Without this, the X button stays at `opacity-0` forever because no ancestor carries the `group` class.

- [ ] **Step 5: Typecheck**

Run: `bunx tsc --noEmit`

Expected: passes.

- [ ] **Step 6: Manual verification in the browser**

Run: `bun run dev` (starts server + Vite). Open the app in the browser.

Walk through every case from the spec's Testing section:

1. Create a group with two open sessions. Hover the group header — an `X` appears next to the `+`. Click X, confirm the prompt. Expected: both sessions appear where the group used to sit, in their previous in-group order; the group is gone.
2. Create an empty group, click X. Expected: no confirm prompt; group disappears immediately.
3. Create a group with one open session and one soft-closed session (close one with its row's X). Click the group's X, confirm. Expected: confirm text says "Its 2 sessions will move to the top level." The open session orphans into the group's old slot. Open the closed-sessions modal and reopen the closed one — it lands at the bottom of the top-level list, not under any group (since the group is gone).
4. Open the app in two browser tabs. Delete a group in one. Expected: the second tab's sidebar updates without reload.
5. Collapse a group (click its header to toggle), then delete it. Expected: same as the open case — children orphan in place.

If any case fails, fix the bug before committing.

- [ ] **Step 7: Commit**

```bash
git add src/client/components/Sidebar.tsx
git commit -m "feat(client): delete tab group from the sidebar header"
```

---

## Done

After Task 4, run a final `bunx tsc --noEmit` and `git status` to confirm a clean tree. The feature is shippable.
