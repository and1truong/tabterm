import { useStore } from "../store.ts";

function Dot() {
  return <span className="opacity-50">•</span>;
}

export function StatusBar() {
  const status = useStore((s) => s.status);
  const tab = useStore((s) => (s.activePrimaryTabId ? s.primaryTabs[s.activePrimaryTabId] : null));
  const session = useStore((s) => (s.activeSessionId ? s.sessions[s.activeSessionId] : null));
  const port = location.port || "3000";

  return (
    <footer
      className="flex items-center gap-2.5 px-4 h-7 text-[11px] mono shrink-0"
      style={{ background: "var(--statusbar)", color: "var(--statusbar-fg)" }}
    >
      <span className="font-semibold tracking-wide">{status === "open" ? "READY" : status.toUpperCase()}</span>
      <Dot />
      <span>main*</span>
      <Dot />
      <span>Node Dev Server: {port}</span>
      <Dot />
      <span className="truncate">
        Active: {tab?.label ?? "—"}
        {session ? ` › ${session.label}` : ""}
      </span>
      <div className="ml-auto flex items-center gap-2.5">
        <span
          className="px-1.5 py-0.5 rounded font-semibold tracking-wide"
          style={{ background: "var(--statusbar-chip)" }}
        >
          STATE PERSISTED
        </span>
        <span>UTF-8</span>
      </div>
    </footer>
  );
}
