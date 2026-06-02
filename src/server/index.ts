import { join } from "node:path";
import { seedIfEmpty } from "./db.ts";
import { handleApi } from "./routes.ts";
import { onClose, onMessage, onOpen } from "./ws.ts";

const PORT = Number(process.env.PORT ?? 3000);
const isProd = process.env.NODE_ENV === "production";
const DIST = join(import.meta.dir, "../../dist");

seedIfEmpty();

const server = Bun.serve({
  port: PORT,

  async fetch(req, server) {
    const url = new URL(req.url);

    // App-level WebSocket.
    if (url.pathname === "/ws") {
      if (server.upgrade(req)) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    const api = url.pathname.startsWith("/api/") ? handleApi(url) : null;
    if (api) return api;

    // In dev, Vite serves the SPA and proxies here; static serving is prod-only.
    if (isProd) {
      const path = url.pathname === "/" ? "/index.html" : url.pathname;
      const file = Bun.file(join(DIST, path));
      if (await file.exists()) return new Response(file);
      // SPA fallback.
      return new Response(Bun.file(join(DIST, "index.html")));
    }

    return new Response("Not found", { status: 404 });
  },

  websocket: {
    open(ws) {
      onOpen(ws);
    },
    message(ws, message) {
      onMessage(ws, typeof message === "string" ? message : message.toString());
    },
    close(ws) {
      onClose(ws);
    },
  },
});

console.log(`[tabterm] server listening on http://localhost:${server.port} (${isProd ? "prod" : "dev"})`);
