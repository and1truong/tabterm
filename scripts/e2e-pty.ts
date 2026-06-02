// End-to-end PTY test against a running tabterm server (no browser).
// Verifies real shell I/O through the proxy and resize. (Shared-terminal
// behavior across connections is covered by shared-pty.ts.)

const BASE = "http://localhost:3000";
const WS = "ws://localhost:3000";

const enc = new TextEncoder();
const dec = new TextDecoder();

function open(url: string): Promise<WebSocket> {
  return new Promise((res, rej) => {
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    ws.onopen = () => res(ws);
    ws.onerror = (e) => rej(e);
  });
}

// --- create a session via the app WS (also triggers GoTTY spawn) ---
const tabId = Object.keys((await (await fetch(`${BASE}/api/state`)).json()).primaryTabs)[0];
const app = await open(`${WS}/ws`);
const sessionId: string = await new Promise((resolve) => {
  app.onmessage = (ev) => {
    const m = JSON.parse(ev.data as string);
    if (m.entity === "session" && m.op === "set") resolve(m.data.id);
  };
  app.send(JSON.stringify({ type: "session:create", primaryTabId: tabId, label: "e2e" }));
});
console.log("[e2e] session created:", sessionId);
await Bun.sleep(1000); // let GoTTY come up

// --- helper: open a PTY connection, collect output ---
async function ptyConn() {
  const ws = await open(`${WS}/gotty/ws/${sessionId}`);
  let out = "";
  ws.onmessage = (ev) => {
    if (typeof ev.data !== "string") out += dec.decode(ev.data as ArrayBuffer);
  };
  return {
    ws,
    resize: (cols: number, rows: number) => ws.send(JSON.stringify({ cols, rows })),
    type: (s: string) => ws.send(enc.encode(s)),
    out: () => out,
  };
}

// --- Test 1: real shell I/O + resize ---
const c1 = await ptyConn();
c1.resize(123, 40);
await Bun.sleep(300);
c1.type("echo READY_$((6*7)); tput cols\n");
await Bun.sleep(800);
const o1 = c1.out();
const sawEcho = o1.includes("READY_42");
const sawCols = o1.includes("123");
console.log("[e2e] shell echo (READY_42):", sawEcho);
console.log("[e2e] resize applied (tput cols == 123):", sawCols);

c1.ws.close();
app.close();

const pass = sawEcho && sawCols;
console.log(pass ? "\nE2E PASS" : "\nE2E FAIL");
process.exit(pass ? 0 : 1);
