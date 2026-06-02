// Foreground/cursor presets for the "Terminal:" dropdown. Background and the
// default foreground come from the app theme (CSS vars); a preset can override
// the foreground + cursor to give a distinct terminal palette.
export interface TermPreset {
  foreground?: string;
  cursor?: string;
}

export const TERM_THEMES: Record<string, TermPreset> = {
  "Slate Standard": {},
  "Solarized Night": { foreground: "#93a1a1", cursor: "#b58900" },
  "Amber CRT": { foreground: "#ffb000", cursor: "#ffb000" },
  "Mono Green": { foreground: "#2ee06a", cursor: "#2ee06a" },
};

export const TERM_THEME_NAMES = Object.keys(TERM_THEMES);
