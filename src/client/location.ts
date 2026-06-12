import { useEffect, useRef } from "react";
import type { PrimaryTab } from "../shared/types.ts";
import { useStore } from "./store.ts";

// Lowercase, replace runs of non-alphanumerics with "-", trim edges. Empty
// labels (or labels made entirely of punctuation/emoji) collapse to "workspace"
// so collision handling can still give them a usable URL.
function slugify(label: string): string {
  const s = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return s || "workspace";
}

// Build the slug ↔ tabId mapping for all visible tabs. Visible tabs are walked
// in `position` order; the first to claim a base slug keeps it, later collisions
// get "-2", "-3"… so reordering is the only thing that swaps suffixes (rename
// alone can't). Closed tabs are excluded — they aren't addressable by URL.
function buildSlugMaps(primaryTabs: Record<string, PrimaryTab>): {
  slugByTabId: Record<string, string>;
  tabIdBySlug: Record<string, string>;
} {
  const visible = Object.values(primaryTabs)
    .filter((t) => t.closedAt == null)
    .sort((a, b) => a.position - b.position);
  const slugByTabId: Record<string, string> = {};
  const tabIdBySlug: Record<string, string> = {};
  const counts: Record<string, number> = {};
  for (const t of visible) {
    const base = slugify(t.label);
    counts[base] = (counts[base] ?? 0) + 1;
    const slug = counts[base] === 1 ? base : `${base}-${counts[base]}`;
    slugByTabId[t.id] = slug;
    tabIdBySlug[slug] = t.id;
  }
  return { slugByTabId, tabIdBySlug };
}

function pathFor(slug: string): string {
  return "/" + slug;
}

function currentSlug(): string {
  try {
    return decodeURIComponent(window.location.pathname.replace(/^\/+/, "").replace(/\/+$/, ""));
  } catch {
    return window.location.pathname.replace(/^\/+/, "").replace(/\/+$/, "");
  }
}

// Hook that mirrors window.location ↔ active workspace. Mount once near the top
// of the React tree (we do it in App). It watches primaryTabs + activeId, pushes
// /<slug> on user-driven tab switches, replaceStates on rename of the active tab,
// resolves the initial URL once primaryTabs first lands, and listens for back/
// forward to switch back without a redundant pushState.
export function useLocationSync(): void {
  const primaryTabs = useStore((s) => s.primaryTabs);
  const activePrimaryTabId = useStore((s) => s.activePrimaryTabId);
  const setActivePrimaryTab = useStore((s) => s.setActivePrimaryTab);
  const setUnknownSlug = useStore((s) => s.setUnknownSlug);

  // Tracks whether the *next* activeId change came from popstate (we just want
  // a replace) versus a user click (we want a push). Set inside the popstate
  // handler before calling setActivePrimaryTab, cleared after the effect runs.
  const fromPopstate = useRef(false);
  // Becomes true after we've handled the URL the page was loaded at, so later
  // effect runs only push/replace on real changes.
  const initialResolved = useRef(false);
  // Last value we wrote into the URL — lets us detect rename-of-active vs
  // user-switched-tab from a single effect.
  const lastActiveRef = useRef<string | null>(null);

  useEffect(() => {
    const hasVisibleTabs = Object.values(primaryTabs).some((t) => t.closedAt == null);
    if (!hasVisibleTabs) return;
    const { slugByTabId, tabIdBySlug } = buildSlugMaps(primaryTabs);

    // First time after init — resolve whatever URL the page loaded at.
    if (!initialResolved.current) {
      initialResolved.current = true;
      const slug = currentSlug();
      if (slug === "") {
        const target = activePrimaryTabId && slugByTabId[activePrimaryTabId];
        if (target) window.history.replaceState(null, "", pathFor(target));
      } else {
        const matched = tabIdBySlug[slug];
        if (matched) {
          if (matched !== activePrimaryTabId) {
            fromPopstate.current = true;
            setActivePrimaryTab(matched);
          } else {
            const canonical = pathFor(slugByTabId[matched]);
            if (window.location.pathname !== canonical) {
              window.history.replaceState(null, "", canonical);
            }
          }
        } else {
          setUnknownSlug(slug);
          const fallback = activePrimaryTabId && slugByTabId[activePrimaryTabId];
          if (fallback) window.history.replaceState(null, "", pathFor(fallback));
        }
      }
      lastActiveRef.current = activePrimaryTabId;
      return;
    }

    // Subsequent runs: only act when there's a real slug change to push/replace.
    if (!activePrimaryTabId) return;
    const slug = slugByTabId[activePrimaryTabId];
    if (!slug) return;
    const desired = pathFor(slug);
    if (window.location.pathname === desired) {
      lastActiveRef.current = activePrimaryTabId;
      return;
    }
    const activeSwitched = lastActiveRef.current !== activePrimaryTabId;
    lastActiveRef.current = activePrimaryTabId;
    if (fromPopstate.current) {
      fromPopstate.current = false;
      // Browser already navigated; just make sure the URL is canonical.
      window.history.replaceState(null, "", desired);
    } else if (activeSwitched) {
      window.history.pushState(null, "", desired);
    } else {
      // Rename of the active tab → replace so back/forward isn't polluted.
      window.history.replaceState(null, "", desired);
    }
  }, [primaryTabs, activePrimaryTabId, setActivePrimaryTab, setUnknownSlug]);

  // Back/forward → resolve the new URL to a tab (or flash banner + fall back).
  useEffect(() => {
    const onPop = () => {
      const { primaryTabs: tabs, activePrimaryTabId: cur } = useStore.getState();
      const { slugByTabId, tabIdBySlug } = buildSlugMaps(tabs);
      const slug = currentSlug();
      if (slug === "") {
        const target = cur && slugByTabId[cur];
        if (target) window.history.replaceState(null, "", pathFor(target));
        return;
      }
      const matched = tabIdBySlug[slug];
      if (matched) {
        if (matched !== cur) {
          fromPopstate.current = true;
          setActivePrimaryTab(matched);
        }
        return;
      }
      setUnknownSlug(slug);
      const fallback = cur && slugByTabId[cur];
      if (fallback) window.history.replaceState(null, "", pathFor(fallback));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [setActivePrimaryTab, setUnknownSlug]);
}
