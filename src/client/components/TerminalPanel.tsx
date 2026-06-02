import { ChevronRight, HelpCircle } from "lucide-react";
import type { Session } from "../../shared/types.ts";
import { useStore } from "../store.ts";
import { Terminal } from "./Terminal.tsx";

export function TerminalPanel({ session }: { session: Session }) {
  const online = useStore((s) => s.status === "open");

  return (
    <div className="flex-1 min-w-0 m-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-4 h-11 border-b border-[var(--border)] shrink-0">
        <ChevronRight size={15} className="text-[var(--accent-soft)]" />
        <span className="mono text-xs font-semibold tracking-wider uppercase text-[var(--accent-soft)] truncate">
          {session.label} Terminal Console
        </span>
        <div className="ml-auto flex items-center gap-3 mono text-[11px]">
          <span style={{ color: online ? "var(--green)" : "var(--orange)" }} className="font-semibold tracking-wide">
            {online ? "READY" : "OFFLINE"}
          </span>
          <span className="text-[var(--accent-soft)]/80">guest@sandbox</span>
        </div>
      </div>

      <div className="flex-1 min-h-0" style={{ background: "var(--term-bg)" }}>
        <Terminal key={session.id} sessionId={session.id} />
      </div>

      <div className="flex items-center gap-2 px-4 h-9 border-t border-[var(--border)] shrink-0 mono text-[11px] text-[var(--muted)]">
        <HelpCircle size={13} />
        <span>
          Quick tips: <span className="text-[var(--accent-soft)]">help</span> ·{" "}
          <span className="text-[var(--accent-soft)]">notes</span> ·{" "}
          <span className="text-[var(--accent-soft)]">view</span> ·{" "}
          <span className="text-[var(--accent-soft)]">status</span>
        </span>
      </div>
    </div>
  );
}
