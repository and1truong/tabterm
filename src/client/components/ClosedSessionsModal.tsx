import { useEffect } from "react";
import { Archive, Eye, RotateCcw, Trash2, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../store.ts";
import { sendMessage } from "../ws.ts";

function relTime(ts: number): string {
  const secs = Math.max(0, Math.floor(Date.now() / 1000 - ts));
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export function ClosedSessionsModal() {
  const show = useStore((s) => s.showClosedSessions);
  const toggle = useStore((s) => s.toggleClosedSessions);
  const primaryTabId = useStore((s) => s.activePrimaryTabId);
  const closed = useStore(
    useShallow((s) =>
      Object.values(s.sessions)
        .filter((sess) => sess.primaryTabId === s.activePrimaryTabId && sess.closedAt != null)
        .sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0)),
    ),
  );
  const cmdByKind = useStore(
    useShallow((s) => Object.fromEntries(s.sessionCommands.map((c) => [c.type, c]))),
  );
  const setActiveSession = useStore((s) => s.setActiveSession);

  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [show, toggle]);

  if (!show || !primaryTabId) return null;

  const view = (id: string) => {
    setActiveSession(id);
    toggle();
  };
  const reopen = (id: string) => {
    sendMessage({ type: "session:reopen", sessionId: id });
    setActiveSession(id);
    toggle();
  };
  const purge = (id: string, label: string) => {
    if (!confirm(`Delete "${label}" forever? Notes and AI history will be erased.`)) return;
    sendMessage({ type: "session:purge", sessionId: id });
  };

  return (
    <div
      onClick={toggle}
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-xl border border-[var(--border)] bg-[var(--panel)] shadow-2xl"
      >
        <div className="flex items-center gap-2 px-4 h-12 border-b border-[var(--border)]">
          <Archive size={15} className="text-[var(--muted)]" />
          <span className="text-sm font-semibold text-[var(--text)] flex-1">Closed sessions</span>
          <button
            onClick={toggle}
            className="w-7 h-7 grid place-items-center rounded-md text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--hover)]"
            title="Close"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {closed.length === 0 && (
            <div className="text-sm text-[var(--faint)] px-3 py-6 text-center">
              No closed sessions in this workspace.
            </div>
          )}
          {closed.map((s) => {
            const cmd = cmdByKind[s.kind];
            return (
            <div
              key={s.id}
              className="group flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[var(--hover)]"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm text-[var(--text)] truncate">{s.label}</div>
                <div className="flex items-center gap-1.5 text-xs text-[var(--faint)] mono">
                  {cmd && (
                    <span
                      className="inline-flex items-center gap-1 px-1.5 h-4 rounded text-[10px] uppercase tracking-wide bg-[var(--bg)] border border-[var(--border)]"
                      style={{ color: cmd.color ?? "var(--muted)" }}
                      title={cmd.label}
                    >
                      <span>{cmd.icon}</span>
                      <span>{cmd.type}</span>
                    </span>
                  )}
                  <span>closed {relTime(s.closedAt ?? 0)}</span>
                </div>
              </div>
              <button
                onClick={() => view(s.id)}
                className="flex items-center gap-1 px-2 h-7 text-xs rounded-md text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--bg)]"
                title="View notes + AI history"
              >
                <Eye size={13} />
                View
              </button>
              <button
                onClick={() => reopen(s.id)}
                className="flex items-center gap-1 px-2 h-7 text-xs rounded-md text-[var(--accent)] hover:bg-[var(--bg)]"
                title="Reopen subtab"
              >
                <RotateCcw size={13} />
                Reopen
              </button>
              <button
                onClick={() => purge(s.id, s.label)}
                className="w-7 h-7 grid place-items-center rounded-md text-[var(--faint)] hover:text-red-400 hover:bg-[var(--bg)]"
                title="Delete forever"
              >
                <Trash2 size={13} />
              </button>
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
