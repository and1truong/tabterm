// Throwaway smoke test for v0.1 acceptance:
//   Req 1: clientA mutation broadcasts to clientB (persist-then-broadcast).
//   Req 4: group collapse toggles.
// Restart-restore (Req 2/4) is checked separately via /api/state after a reboot.

const state = await (await fetch("http://localhost:3000/api/state")).json();
const tabId = Object.keys(state.primaryTabs)[0];
if (!tabId) throw new Error("no seeded primary tab");

function open(): Promise<WebSocket> {
  return new Promise((resolve) => {
    const ws = new WebSocket("ws://localhost:3000/ws");
    ws.onopen = () => resolve(ws);
  });
}

const next = (ws: WebSocket, pred: (m: any) => boolean) =>
  new Promise<any>((resolve) => {
    const h = (ev: MessageEvent) => {
      const m = JSON.parse(ev.data as string);
      if (pred(m)) {
        ws.removeEventListener("message", h);
        resolve(m);
      }
    };
    ws.addEventListener("message", h);
  });

const a = await open();
const b = await open();
// Both clients' onopen has fired, so the server has already added them to the
// broadcast pool. (We intentionally don't await `init` here — it's delivered
// before we can attach a listener; the mutation listeners below are attached
// before their triggering send, so they don't race.)

// clientA creates a group; clientB must receive the patch.
const groupOnB = next(b, (m) => m.entity === "group" && m.op === "set");
a.send(JSON.stringify({ type: "group:create", primaryTabId: tabId, label: "backend", color: "blue" }));
const gMsg = await groupOnB;
const groupId = gMsg.data.id;
console.log("[ok] group:create broadcast to clientB ->", gMsg.data.label, gMsg.data.id);
console.log("    isOpen after create:", gMsg.data.isOpen);

// clientA creates a session inside the group; clientB receives it.
const sessOnB = next(b, (m) => m.entity === "session" && m.op === "set");
a.send(JSON.stringify({ type: "session:create", primaryTabId: tabId, groupId, label: "api-server" }));
const sMsg = await sessOnB;
console.log("[ok] session:create broadcast to clientB ->", sMsg.data.label, "group:", sMsg.data.groupId === groupId);

// clientA creates an ungrouped session; expect an order patch too.
const orderOnB = next(b, (m) => m.entity === "order" && m.op === "set");
a.send(JSON.stringify({ type: "session:create", primaryTabId: tabId, label: "scratch" }));
const oMsg = await orderOnB;
console.log("[ok] ungrouped session added to flat order, len:", oMsg.data.order.length);

// collapse the group; clientB sees isOpen flip to false.
const toggleOnB = next(b, (m) => m.entity === "group" && m.op === "set");
a.send(JSON.stringify({ type: "group:toggle", groupId }));
const tMsg = await toggleOnB;
console.log("[ok] group:toggle -> isOpen:", tMsg.data.isOpen);
if (tMsg.data.isOpen !== false) throw new Error("expected collapsed");

a.close();
b.close();
console.log("\nSMOKE PASS");
process.exit(0);
