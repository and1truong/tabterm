# Delete tab group

## Problem

Tab groups can be created from the sidebar header (`+` folder icon) but once created they cannot be deleted. The only way to get rid of a group today is to purge its entire parent primary tab, which also discards every session inside. Users need a surgical "delete this group" action that preserves the work it contains.

## Decision

Add a hover-revealed `X` button on the group header. Clicking it sends a new `group:delete` WebSocket message. The server removes the group row, reparents its child sessions to the top-level flat order of the same primary tab (preserving their in-group ordering), and broadcasts the resulting patches.

Sessions are **orphaned, not destroyed.** Both open and soft-closed sessions in the group have their `group_id` cleared so the closed ones, when later reopened from the Archive, behave the same as any other ungrouped session.

## UI

In `src/client/components/Sidebar.tsx`, the group header row currently ends with a `+` button that creates a new session inside the group. Add an `X` button immediately after it:

- Class pattern mirrors `SessionRow`'s close button: `opacity-0 group-hover:opacity-100 text-[var(--faint)] hover:text-red-400`.
- `lucide-react`'s `X` icon, `size={13}`.
- `title="Delete group (sessions move to top level)"`.
- `onClick` calls `e.stopPropagation()` so it does not trigger the group expand/collapse toggle.

Click handler logic:

```ts
const childCount = (tree.groups[group.id] ?? []).length;
const closedCount = Object.values(sessions).filter(
  (s) => s.groupId === group.id && s.closedAt != null,
).length;
const total = childCount + closedCount;
if (total > 0 && !window.confirm(
  `Delete group "${group.label}"? Its ${total} session${total === 1 ? "" : "s"} will move to the top level.`,
)) return;
sendMessage({ type: "group:delete", groupId: group.id });
```

Empty groups delete immediately with no prompt.

## Wire protocol

`src/shared/types.ts` — add one variant to `ClientMessage`:

```ts
| { type: "group:delete"; groupId: string }
```

No new server-to-client message types — the server reuses existing `patch group delete`, `patch session set`, and `patch order set` envelopes.

## Server

### `src/server/db.ts`

New function:

```ts
export function deleteGroup(
  groupId: string,
): { primaryTabId: string; order: string[]; sessions: Session[] } | null
```

Algorithm:

1. `q.getGroup.get(groupId)` — if missing, return `null`.
2. Read the primary tab id from the group row.
3. Find every session with `group_id = groupId`, both open and soft-closed, ordered by their current in-group `position`.
4. For each, assign a fresh `position` (next available after `maxSessionPos` for the primary tab, incrementing per session) and update `group_id = NULL, position = <new>`. The actual sidebar ordering is driven by `order` (step 6) — `position` is just bookkeeping so the row is sortable if `order` ever has to be rebuilt from scratch.
5. Delete the group row.
6. Read the tab's current `order`. Find the slot containing `groupId` and **replace that slot in place** with the ids of the **open** orphaned sessions, in their original in-group order. This keeps the orphans where the group used to be visually, rather than dumping them at the bottom. Drop any stray duplicates. Write the new order back.
7. Return `{ primaryTabId, order, sessions }` where `sessions` is the full list of updated session rows (open and closed).

Soft-closed sessions get their `group_id` cleared but are **not** inserted into `order`, matching how closed sessions are excluded from the sidebar everywhere else.

### `src/server/ws.ts`

New case in the `switch (msg.type)`:

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

Broadcast order: delete the group first so any client that reads `groups[id]` during the session patches will not find a stale row.

## Data flow

```
User clicks X on group header
  → confirm() if group has any sessions
  → sendMessage({ type: "group:delete", groupId })
  → server deleteGroup():
      orphan children (group_id = NULL, append position)
      delete group row
      rebuild tab order: replace groupId with its open children
  → server broadcasts:
      group delete patch
      one session set patch per orphaned session
      order set patch
  → every client's Zustand store applies patches; sidebar re-renders
```

## What stays the same

- No DB migration. `sessions.group_id` is already nullable.
- No change to `reopenSession`'s fallback path — it still handles the "group is gone" case for legacy soft-closed sessions whose group was purged with their tab. The new delete path makes that case unreachable for groups deleted this way, but the fallback stays as defensive coverage.
- No change to `closeSession`, `purgeSession`, `applyLayout`, or the layout drag handlers.

## Out of scope

- No undo / soft-delete of groups. Groups carry no state worth preserving beyond their label and color; both are cheap to recreate.
- No bulk "delete group and all its sessions" option. If the user wants that, they close each session individually first or purge the parent tab.
- No keyboard shortcut for group delete.
- No change to the command palette.

## Testing

Manual verification:

1. Create a group with two open sessions. Click X, confirm. Sessions appear at the slot where the group used to be, in their prior order; group is gone.
2. Create an empty group. Click X. Group is deleted without confirmation.
3. Create a group with one open session and one soft-closed session (close one from inside the group). Click X. The open session orphans into the group's old slot; the closed one stays in Archive. Reopen it from Archive — it appears at the bottom of the top-level list (no group to fall back to), not under any group.
4. Delete a group while another browser tab is open. The second tab updates without reload.
5. Delete a collapsed group (`isOpen = false`). Same behavior as the open case.
