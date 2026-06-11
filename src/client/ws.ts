import type { ClientMessage, ServerMessage } from "../shared/types.ts";
import { useStore } from "./store.ts";

let socket: WebSocket | null = null;
let retries = 0;
const MAX_BACKOFF = 5000;

// Messages produced while the socket is down are buffered here and flushed on
// reconnect, so an edit made offline isn't silently dropped. Stale note edits
// that flush after a remote change are caught by the server's version check.
// Capped as a backstop for very long disconnects: note edits collapse below, so
// hitting the cap takes hundreds of distinct ops — drop the oldest beyond it.
const outbox: ClientMessage[] = [];
const OUTBOX_MAX = 256;

function enqueue(msg: ClientMessage): void {
  // Collapse superseded content/title edits for the same note so a long offline
  // burst flushes one write per field instead of every debounced keystroke.
  if (msg.type === "note:update") {
    const field = msg.content !== undefined ? "content" : msg.title !== undefined ? "title" : null;
    if (field) {
      for (let i = outbox.length - 1; i >= 0; i--) {
        const q = outbox[i];
        if (
          q.type === "note:update" && q.noteId === msg.noteId &&
          ((field === "content" && q.content !== undefined) ||
            (field === "title" && q.title !== undefined))
        ) {
          outbox.splice(i, 1);
        }
      }
    }
  }
  outbox.push(msg);
  if (outbox.length > OUTBOX_MAX) outbox.shift();
}

function flushOutbox(): void {
  while (outbox.length && socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(outbox.shift()));
  }
}

function wsUrl(): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws`;
}

export function connect(): void {
  const { setStatus, applyServerMessage } = useStore.getState();
  setStatus(retries === 0 ? "connecting" : "connecting");

  socket = new WebSocket(wsUrl());

  socket.onopen = () => {
    retries = 0;
    useStore.getState().setStatus("open");
    flushOutbox();
  };

  socket.onmessage = (ev) => {
    try {
      applyServerMessage(JSON.parse(ev.data) as ServerMessage);
    } catch {
      // ignore malformed frames
    }
  };

  socket.onclose = () => {
    useStore.getState().setStatus("closed");
    socket = null;
    const delay = Math.min(MAX_BACKOFF, 250 * 2 ** retries);
    retries += 1;
    setTimeout(connect, delay);
  };

  socket.onerror = () => socket?.close();
}

export function sendMessage(msg: ClientMessage): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
  else enqueue(msg);
}
