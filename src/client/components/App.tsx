import { useStore } from "../store.ts";
import { Sidebar } from "./Sidebar.tsx";
import { TitleBar } from "./TitleBar.tsx";

export function App() {
  const activeSessionId = useStore((s) => s.activeSessionId);
  const session = useStore((s) => (activeSessionId ? s.sessions[activeSessionId] : null));

  return (
    <div className="h-full flex flex-col">
      <TitleBar />
      <div className="flex-1 flex min-h-0">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center text-gray-500">
          {session ? (
            <div className="text-center">
              <div className="text-lg text-gray-300">{session.label}</div>
              <div className="text-sm mt-1">
                Terminal renderer arrives in v0.2 (GoTTY + xterm.js).
              </div>
            </div>
          ) : (
            <div className="text-sm">Select or create a session to begin.</div>
          )}
        </main>
      </div>
    </div>
  );
}
