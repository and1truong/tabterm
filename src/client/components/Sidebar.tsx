import type { GroupColor } from "../../shared/types.ts";
import { GROUP_COLORS } from "../../shared/types.ts";
import { useStore } from "../store.ts";
import { sendMessage } from "../ws.ts";

const COLOR_HEX: Record<GroupColor, string> = {
  slate: "#94a3b8",
  red: "#ef4444",
  amber: "#f59e0b",
  green: "#22c55e",
  cyan: "#06b6d4",
  blue: "#3b82f6",
  violet: "#8b5cf6",
  pink: "#ec4899",
};

export function Sidebar() {
  const primaryTabId = useStore((s) => s.activePrimaryTabId);
  const groups = useStore((s) => s.groups);
  const sessions = useStore((s) => s.sessions);
  const order = useStore((s) => s.order);
  const activeSessionId = useStore((s) => s.activeSessionId);
  const setActiveSession = useStore((s) => s.setActiveSession);

  if (!primaryTabId) {
    return <aside className="w-60 border-r border-[var(--color-border)] bg-[var(--color-panel)]" />;
  }

  const refs = order[primaryTabId] ?? [];

  function addGroup() {
    const label = prompt("Group name?");
    if (!label) return;
    const color = GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)];
    sendMessage({ type: "group:create", primaryTabId: primaryTabId!, label, color });
  }

  function addSession(groupId?: string) {
    const label = prompt("Session name?");
    if (!label) return;
    sendMessage({ type: "session:create", primaryTabId: primaryTabId!, groupId, label });
  }

  function deleteSession(id: string) {
    sendMessage({ type: "session:delete", sessionId: id });
  }

  const SessionItem = ({ id, dot }: { id: string; dot?: string }) => {
    const s = sessions[id];
    if (!s) return null;
    return (
      <div
        className={`group flex items-center gap-2 pl-2 pr-1 py-1 rounded cursor-pointer text-sm ${
          id === activeSessionId ? "bg-[var(--color-bg)] text-white" : "text-gray-300 hover:bg-[var(--color-bg)]/50"
        }`}
        onClick={() => setActiveSession(id)}
      >
        <span
          className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: dot ?? "#4b5563" }}
        />
        <span className="truncate flex-1">{s.label}</span>
        <button
          className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 px-1"
          onClick={(e) => {
            e.stopPropagation();
            deleteSession(id);
          }}
          title="Delete session"
        >
          ×
        </button>
      </div>
    );
  };

  return (
    <aside className="w-60 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-panel)] flex flex-col">
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {refs.map((ref) => {
          const group = groups[ref];
          if (group) {
            const children = Object.values(sessions)
              .filter((s) => s.groupId === group.id)
              .sort((a, b) => a.position - b.position);
            return (
              <div key={group.id}>
                <div className="flex items-center gap-1.5 px-1 py-1 text-xs uppercase tracking-wide text-gray-400">
                  <button
                    onClick={() => sendMessage({ type: "group:toggle", groupId: group.id })}
                    className="w-4 text-gray-500 hover:text-gray-200"
                    title={group.isOpen ? "Collapse" : "Expand"}
                  >
                    {group.isOpen ? "▾" : "▸"}
                  </button>
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ background: COLOR_HEX[group.color] }}
                  />
                  <span className="flex-1 truncate">{group.label}</span>
                  <button
                    onClick={() => addSession(group.id)}
                    className="text-gray-500 hover:text-gray-200 px-1"
                    title="New session in group"
                  >
                    +
                  </button>
                </div>
                {group.isOpen &&
                  children.map((s) => (
                    <div key={s.id} className="ml-3">
                      <SessionItem id={s.id} dot={COLOR_HEX[group.color]} />
                    </div>
                  ))}
              </div>
            );
          }
          // ungrouped session
          return <SessionItem key={ref} id={ref} />;
        })}
      </div>

      <div className="border-t border-[var(--color-border)] p-2 flex gap-2">
        <button
          onClick={() => addSession()}
          className="flex-1 text-xs py-1.5 rounded bg-[var(--color-bg)] text-gray-300 hover:text-white"
        >
          + Session
        </button>
        <button
          onClick={addGroup}
          className="flex-1 text-xs py-1.5 rounded bg-[var(--color-bg)] text-gray-300 hover:text-white"
        >
          + Group
        </button>
      </div>
    </aside>
  );
}
