import {
  ChevronDown,
  Download,
  Moon,
  RefreshCw,
  Sun,
  TerminalSquare,
  Upload,
} from "lucide-react";
import { useStore } from "../store.ts";
import { TERM_THEME_NAMES } from "../termThemes.ts";

const iconBtn =
  "w-8 h-8 grid place-items-center rounded-lg text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--hover)] transition-colors";

export function Header() {
  const status = useStore((s) => s.status);
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const termTheme = useStore((s) => s.termTheme);
  const setTermTheme = useStore((s) => s.setTermTheme);

  const online = status === "open";
  const port = location.port || "3000";

  return (
    <header className="flex items-center gap-3 px-4 h-16 bg-[var(--header)] border-b border-[var(--border)] select-none">
      <div className="w-10 h-10 grid place-items-center rounded-xl bg-[var(--brand-bg)] text-[var(--brand-fg)] border border-[var(--border)]">
        <TerminalSquare size={20} />
      </div>
      <div className="leading-tight">
        <div className="font-bold tracking-wide text-[var(--text)] text-[15px]">
          TABTERM DEV WORKSPACE
        </div>
        <div className="mono text-[11px] tracking-wide text-[var(--faint)] uppercase">
          <span style={{ color: online ? "var(--green)" : "var(--orange)" }}>
            ● {online ? "ONLINE" : "OFFLINE"}
          </span>{" "}
          DEV PORT: {port}
        </div>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <button onClick={toggleTheme} className={iconBtn + " border border-[var(--border)]"} title="Toggle theme">
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        <div className="flex items-center gap-2">
          <span className="mono text-xs text-[var(--muted)]">Terminal:</span>
          <div className="relative">
            <select
              value={termTheme}
              onChange={(e) => setTermTheme(e.target.value)}
              className="appearance-none mono text-xs font-semibold text-[var(--text)] bg-[var(--panel)] border border-[var(--border-2)] rounded-lg pl-3 pr-7 py-1.5 outline-none cursor-pointer hover:border-[var(--accent)]"
            >
              {TERM_THEME_NAMES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted)] pointer-events-none"
            />
          </div>
        </div>

        <div className="w-px h-6 bg-[var(--border)]" />

        <div className="flex items-center gap-1">
          <button
            className={iconBtn}
            title="Copy workspace link"
            onClick={() => navigator.clipboard?.writeText(location.href)}
          >
            <Upload size={16} />
          </button>
          <button className={iconBtn} title="Export state" onClick={() => exportState()}>
            <Download size={16} />
          </button>
          <button className={iconBtn} title="Reconnect" onClick={() => location.reload()}>
            <RefreshCw size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}

async function exportState() {
  const data = await (await fetch("/api/state")).text();
  const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "tabterm-state.json";
  a.click();
  URL.revokeObjectURL(url);
}
