import { SlidersHorizontal } from "lucide-react";
import { buildTree } from "../layout.ts";
import { useStore } from "../store.ts";

// Horizontal breadcrumb of the active workspace's sessions, mirroring the
// left "NESTED TABS" list. Click selects a session.
export function SubTabs() {
  const tabId = useStore((s) => s.activePrimaryTabId);
  const groups = useStore((s) => s.groups);
  const sessions = useStore((s) => s.sessions);
  const order = useStore((s) => s.order);
  const activeSessionId = useStore((s) => s.activeSessionId);
  const setActiveSession = useStore((s) => s.setActiveSession);

  if (!tabId) return <div className="h-10 bg-[var(--bg)] border-b border-[var(--border)]" />;

  const tree = buildTree(order[tabId] ?? [], groups, sessions);
  // flatten to the same visual order as the sidebar
  const flat: string[] = [];
  for (const ref of tree.top) {
    if (groups[ref]) flat.push(...(tree.groups[ref] ?? []));
    else flat.push(ref);
  }

  return (
    <div className="flex items-center gap-1 px-3 h-10 bg-[var(--bg)] border-b border-[var(--border)] overflow-x-auto select-none">
      <span className="w-7 h-7 grid place-items-center text-[var(--accent-soft)] shrink-0">
        <SlidersHorizontal size={15} />
      </span>
      {flat.map((sid, i) => {
        const s = sessions[sid];
        if (!s) return null;
        const active = sid === activeSessionId;
        return (
          <button
            key={sid}
            onClick={() => setActiveSession(sid)}
            className={`shrink-0 mono text-xs px-2.5 py-1 rounded-full whitespace-nowrap ${
              active
                ? "text-[var(--text)] border border-[var(--border-2)] bg-[var(--panel)]"
                : "text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            {i + 1}. {s.label}
          </button>
        );
      })}
    </div>
  );
}
