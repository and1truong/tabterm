import { useEffect, useRef, useState } from "react";
import { captureScrollback } from "../terminals.ts";
import { useStore } from "../store.ts";

// Per-session AI chat. History lives in the store: loaded over REST on open and
// kept live via WS `ai` broadcasts (so other devices update without refresh).
// New turns arrive via the broadcast, so we don't optimistically append — we
// just show the in-flight question as a pending bubble until it lands.
export function AssistantPanel({ sessionId }: { sessionId: string }) {
  const messages = useStore((s) => s.aiHistory[sessionId]);
  const setAiHistory = useStore((s) => s.setAiHistory);

  const [input, setInput] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setError(null);
    fetch(`/api/ai/history?sessionId=${encodeURIComponent(sessionId)}`)
      .then((r) => r.json())
      .then((d) => setAiHistory(sessionId, d.messages ?? []))
      .catch(() => setError("Failed to load history."));
  }, [sessionId, setAiHistory]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, pending]);

  async function send() {
    const message = input.trim();
    if (!message || pending) return;
    setInput("");
    setError(null);
    setPending(message);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, message, scrollback: captureScrollback(sessionId) }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? `Request failed (${res.status}).`);
      // On success the user+assistant turns arrive via the WS `ai` broadcast.
    } catch {
      setError("Network error.");
    } finally {
      setPending(null);
    }
  }

  const history = messages ?? [];

  return (
    <div className="h-full flex flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {history.length === 0 && !pending && !error && (
          <div className="text-sm text-[var(--faint)]">
            Ask about this session. The assistant sees your recent terminal output.
          </div>
        )}
        {history.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
            <div
              className={`inline-block max-w-[90%] whitespace-pre-wrap text-left rounded-lg px-2.5 py-1.5 text-sm ${
                m.role === "user"
                  ? "bg-[var(--accent)]/15 text-[var(--text)]"
                  : "bg-[var(--bg)] border border-[var(--border)] text-[var(--text)]"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {pending && (
          <div className="text-right">
            <div className="inline-block max-w-[90%] whitespace-pre-wrap text-left rounded-lg px-2.5 py-1.5 text-sm bg-[var(--accent)]/10 text-[var(--muted)] italic">
              {pending}
            </div>
            <div className="text-xs text-[var(--faint)] mt-1">thinking…</div>
          </div>
        )}
        {error && (
          <div className="text-sm text-red-400 border border-red-500/40 rounded-lg p-2">{error}</div>
        )}
      </div>
      <div className="border-t border-[var(--border)] p-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Ask the assistant… (Enter to send, Shift+Enter for newline)"
          className="w-full h-16 resize-none rounded-lg bg-[var(--bg)] border border-[var(--border)] p-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
        />
      </div>
    </div>
  );
}
