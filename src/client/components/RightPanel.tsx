import { useState } from "react";
import { BookOpen, ChevronRight, Sparkles } from "lucide-react";
import { useStore } from "../store.ts";
import { AssistantPanel } from "./AssistantPanel.tsx";
import { NotesPanel } from "./NotesPanel.tsx";

type Tab = "notes" | "assistant";

export function RightPanel({ sessionId }: { sessionId: string }) {
  const [tab, setTab] = useState<Tab>("notes");
  const toggleNotes = useStore((s) => s.toggleNotes);

  const tabBtn = (id: Tab, label: string) => (
    <button
      onClick={() => setTab(id)}
      className={`flex-1 text-xs font-medium py-2 rounded-lg ${
        tab === id ? "bg-[var(--panel)] border border-[var(--border-2)] text-[var(--text)]" : "text-[var(--muted)] hover:text-[var(--text)]"
      }`}
    >
      {label}
    </button>
  );

  return (
    <aside className="w-80 shrink-0 my-3 mr-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-4 h-11 border-b border-[var(--border)] shrink-0">
        {tab === "notes" ? (
          <BookOpen size={15} className="text-[var(--accent-soft)]" />
        ) : (
          <Sparkles size={15} className="text-[var(--accent-soft)]" />
        )}
        <span className="text-xs font-semibold tracking-wide text-[var(--text)] flex-1">
          {tab === "notes" ? "NOTES WORKSPACE" : "ASSISTANT"}
        </span>
        <button onClick={toggleNotes} className="text-[var(--muted)] hover:text-[var(--text)]" title="Hide panel">
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="flex gap-1 p-2 border-b border-[var(--border)] bg-[var(--bg)]">
        {tabBtn("notes", "Notes")}
        {tabBtn("assistant", "Assistant")}
      </div>

      <div className="flex-1 min-h-0">
        {tab === "notes" ? (
          <NotesPanel key={sessionId} sessionId={sessionId} />
        ) : (
          <AssistantPanel key={sessionId} sessionId={sessionId} />
        )}
      </div>
    </aside>
  );
}
