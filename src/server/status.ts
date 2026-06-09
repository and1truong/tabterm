import type { AppState, Session, SessionStatus } from "../shared/types.ts";
import { getSession } from "./db.ts";

// Runtime-only liveness map. Sessions absent here are treated as "idle".
const statuses = new Map<string, SessionStatus>();

type Broadcaster = (session: Session) => void;
let broadcaster: Broadcaster | null = null;

// Wired once at boot by ws.ts to avoid a status<->ws import cycle.
export function setStatusBroadcaster(fn: Broadcaster): void {
  broadcaster = fn;
}

export function getStatus(sessionId: string): SessionStatus {
  return statuses.get(sessionId) ?? "idle";
}

export function setStatus(sessionId: string, next: SessionStatus): void {
  if (statuses.get(sessionId) === next) return;
  statuses.set(sessionId, next);
  const session = getSession(sessionId);
  if (!session || !broadcaster) return;
  broadcaster({ ...session, status: next });
}

export function clearStatus(sessionId: string): void {
  statuses.delete(sessionId);
}

// Inject the current liveness into a freshly-loaded snapshot before sending to
// a newly-connected client, so reconnects don't show stale "idle" for actually-
// running sessions.
export function attachStatuses(state: AppState): AppState {
  const sessions: Record<string, Session> = {};
  for (const [id, s] of Object.entries(state.sessions)) {
    const status = statuses.get(id);
    sessions[id] = status ? { ...s, status } : s;
  }
  return { ...state, sessions };
}
