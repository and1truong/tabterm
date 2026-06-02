import { loadState } from "./db.ts";

// Minimal REST surface for v0.1. The app's live data flows over the WS;
// these endpoints are for health checks and non-WS state inspection.
export function handleApi(url: URL): Response | null {
  if (url.pathname === "/api/health") {
    return Response.json({ ok: true });
  }
  if (url.pathname === "/api/state") {
    return Response.json(loadState());
  }
  return null;
}
