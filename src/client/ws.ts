import type { ClientMessage, ServerMessage } from "../shared/types.ts";
import { useStore } from "./store.ts";

let socket: WebSocket | null = null;
let retries = 0;
const MAX_BACKOFF = 5000;

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
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg));
  }
}
