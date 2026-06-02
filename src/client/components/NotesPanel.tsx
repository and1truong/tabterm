import { useEffect, useRef, useState } from "react";
import type { Note } from "../../shared/types.ts";
import { useStore } from "../store.ts";
import { sendMessage } from "../ws.ts";

// One note. Controlled, but focus-aware: incoming remote edits update the
// textarea only while it's NOT focused, so another device's changes appear live
// without yanking the cursor mid-typing. Local edits auto-save with a 300ms
// debounce (Req 8).
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
    timer.current = setTimeout(() => {
      sendMessage({ type: "note:update", noteId: note.id, content });
    }, 300);
  };

  return (
    <div className="relative group">
      <textarea
        value={value}
        onFocus={() => (focused.current = true)}
        onBlur={() => (focused.current = false)}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Write a note…"
        className="w-full h-28 resize-y rounded bg-[var(--color-bg)] border border-[var(--color-border)] p-2 text-sm text-gray-200 outline-none focus:border-gray-500"
      />
      <button
        onClick={() => sendMessage({ type: "note:delete", noteId: note.id })}
        className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 text-xs px-1"
        title="Delete note"
      >
        ×
      </button>
    </div>
  );
}

export function NotesPanel({ sessionId }: { sessionId: string }) {
  const notes = useStore((s) => s.notes);

  const sessionNotes = Object.values(notes)
    .filter((n) => n.sessionId === sessionId)
    .sort((a, b) => a.position - b.position);

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {sessionNotes.length === 0 && (
          <div className="text-sm text-gray-500">No notes yet.</div>
        )}
        {sessionNotes.map((note) => (
          <NoteItem key={note.id} note={note} />
        ))}
      </div>
      <div className="border-t border-[var(--color-border)] p-2">
        <button
          onClick={() => sendMessage({ type: "note:create", sessionId })}
          className="w-full text-xs py-1.5 rounded bg-[var(--color-bg)] text-gray-300 hover:text-white"
        >
          + Note
        </button>
      </div>
    </div>
  );
}
