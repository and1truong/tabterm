import { useEffect, useRef, useState } from "react";
import { Copy, Download, Plus, Trash2, X } from "lucide-react";
import type { Note } from "../../shared/types.ts";
import { useStore } from "../store.ts";
import { sendMessage } from "../ws.ts";

// One note: controlled but focus-aware so a remote edit appears live except
// while you're typing in it. Local edits auto-save with a 300ms debounce.
function NoteItem({ note }: { note: Note }) {
  const [value, setValue] = useState(note.content);
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!focused.current) setValue(note.content);
  }, [note.content]);

  const onChange = (content: string) => {
    setValue(content);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => sendMessage({ type: "note:update", noteId: note.id, content }), 300);
  };

  return (
    <div className="relative group">
      <textarea
        value={value}
        onFocus={() => (focused.current = true)}
        onBlur={() => (focused.current = false)}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Write a note…"
        className="w-full h-32 resize-y rounded-lg bg-[var(--bg)] border border-[var(--border)] p-2.5 mono text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
      />
      <button
        onClick={() => sendMessage({ type: "note:delete", noteId: note.id })}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-[var(--faint)] hover:text-red-400"
        title="Delete note"
      >
        <X size={13} />
      </button>
    </div>
  );
}

const footBtn = "w-7 h-7 grid place-items-center rounded-md text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--hover)]";

export function NotesPanel({ sessionId }: { sessionId: string }) {
  const notes = useStore((s) => s.notes);
  const label = useStore((s) => s.sessions[sessionId]?.label ?? "—");

  const sessionNotes = Object.values(notes)
    .filter((n) => n.sessionId === sessionId)
    .sort((a, b) => a.position - b.position);

  const text = sessionNotes.map((n) => n.content).join("\n\n");
  const chars = text.length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  const exportMd = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `notes-${label}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const clearAll = () => {
    if (sessionNotes.length && confirm("Delete all notes for this subtab?")) {
      for (const n of sessionNotes) sendMessage({ type: "note:delete", noteId: n.id });
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)] text-xs">
        <span className="text-[var(--muted)]">
          Assigned to secondary tab: <span className="font-semibold text-[var(--text)]">{label}</span>
        </span>
        <span className="mono text-[var(--faint)]">{chars} char(s)</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {sessionNotes.length === 0 && <div className="text-sm text-[var(--faint)]">No notes yet.</div>}
        {sessionNotes.map((note) => (
          <NoteItem key={note.id} note={note} />
        ))}
        <button
          onClick={() => sendMessage({ type: "note:create", sessionId })}
          className="w-full flex items-center justify-center gap-2 text-xs py-2 rounded-lg border border-dashed border-[var(--border-2)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)]"
        >
          <Plus size={14} /> Note
        </button>
      </div>

      <div className="flex items-center px-3 h-10 border-t border-[var(--border)] mono text-[11px] text-[var(--faint)]">
        <span>
          {words} word(s) · {chars} char(s)
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <button className={footBtn} title="Copy notes" onClick={() => navigator.clipboard?.writeText(text)}>
            <Copy size={14} />
          </button>
          <button className={footBtn} title="Export .md" onClick={exportMd}>
            <Download size={14} />
          </button>
          <button className={footBtn} title="Delete all notes" onClick={clearAll}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
