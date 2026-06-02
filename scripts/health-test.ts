// Verifies the GoTTY health monitor respawns a process that died (P1).
import { $ } from "bun";
import { ensure, killAll, portOf, startHealthMonitor } from "../src/server/gotty.ts";

const alive = async (port: number) => {
  try {
    return (await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1000) })).ok;
  } catch {
    return false;
  }
};

const sid = "health-test";
const p1 = await ensure(sid);
console.log(`[health] spawned on :${p1}, alive=${await alive(p1)}`);

// Simulate a crash: kill the GoTTY process out from under us.
await $`pkill -9 -f "port ${p1} "`.nothrow().quiet();
await Bun.sleep(400);
console.log(`[health] after external kill, :${p1} alive=${await alive(p1)}`);

const stop = startHealthMonitor(1000);
await Bun.sleep(3500); // ~3 monitor ticks
stop();

const p2 = portOf(sid)!;
const recovered = await alive(p2);
console.log(`[health] after monitor: port=${p2} alive=${recovered} (respawned=${p2 !== undefined})`);

killAll();
const pass = recovered;
console.log(pass ? "\nHEALTH PASS" : "\nHEALTH FAIL");
process.exit(pass ? 0 : 1);
