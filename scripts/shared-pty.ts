// Verifies the shared-terminal proxy: two connections to one session attach to
// the SAME shell — identical output, shared PID, and input from either is seen
// by both.
const BASE = "http://localhost:3000";
const WS = "ws://localhost:3000";
const enc = new TextEncoder();
const dec = new TextDecoder();

const open = (url: string) =>
  new Promise<WebSocket>((res) => {
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    ws.onopen = () => res(ws);
  });

const tabId = Object.keys((await (await fetch(`${BASE}/api/state`)).json()).primaryTabs)[0];
const app = await open(`${WS}/ws`);
const sid: string = await new Promise((resolve) => {
  app.onmessage = (ev) => {
    const m = JSON.parse(ev.data as string);
    if (m.entity === "session" && m.op === "set") resolve(m.data.id);
  };
  app.send(JSON.stringify({ type: "session:create", primaryTabId: tabId, label: "shared" }));
});
await Bun.sleep(1000);

async function conn() {
  const ws = await open(`${WS}/gotty/ws/${sid}`);
  let out = "";
  ws.onmessage = (e) => { if (typeof e.data !== "string") out += dec.decode(e.data as ArrayBuffer); };
  ws.send(JSON.stringify({ cols: 90, rows: 30 }));
  return { ws, type: (s: string) => ws.send(enc.encode(s)), out: () => out };
}

const c1 = await conn();
await Bun.sleep(300);
const c2 = await conn(); // attaches second — should get replay buffer
await Bun.sleep(300);

// input from c1 — both must see it, with the SAME bash PID (one shell)
c1.type("echo SHAREDMARK_$$\n");
await Bun.sleep(700);
const m1 = c1.out().match(/SHAREDMARK_(\d+)/)?.[1];
const m2 = c2.out().match(/SHAREDMARK_(\d+)/)?.[1];
console.log(`[shared] c1 saw pid=${m1}  c2 saw pid=${m2}  same-shell=${!!m1 && m1 === m2}`);

// input from c2 — c1 must see it too
c2.type("echo FROM_C2_HELLO\n");
await Bun.sleep(700);
const c1SeesC2 = c1.out().includes("FROM_C2_HELLO");
console.log(`[shared] c1 sees c2's input: ${c1SeesC2}`);

c1.ws.close();
c2.ws.close();
app.close();

const pass = !!m1 && m1 === m2 && c1SeesC2;
console.log(pass ? "\nSHARED PASS" : "\nSHARED FAIL");
process.exit(pass ? 0 : 1);
