import { useStore } from "../store.ts";
import { Header } from "./Header.tsx";
import { PrimaryTabs } from "./PrimaryTabs.tsx";
import { RightPanel } from "./RightPanel.tsx";
import { Sidebar } from "./Sidebar.tsx";
import { StatusBar } from "./StatusBar.tsx";
import { SubTabs } from "./SubTabs.tsx";
import { TerminalPanel } from "./TerminalPanel.tsx";

export function App() {
  const activeSessionId = useStore((s) => s.activeSessionId);
  const session = useStore((s) => (activeSessionId ? s.sessions[activeSessionId] : null));
  const showNotes = useStore((s) => s.showNotes);

  return (
    <div className="h-full flex flex-col bg-[var(--bg)]">
      <Header />
      <PrimaryTabs />
      <SubTabs />
      <div className="flex-1 flex min-h-0">
        <Sidebar />
        {session ? (
          <TerminalPanel session={session} />
        ) : (
          <div className="flex-1 m-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] flex items-center justify-center text-[var(--faint)] text-sm">
            Select or create a subtab to begin.
          </div>
        )}
        {session && showNotes && <RightPanel sessionId={session.id} />}
      </div>
      <StatusBar />
    </div>
  );
}
