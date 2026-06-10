// Thin wrapper around the browser Notification API. All calls are safe to make
// when notifications are unsupported or not granted — they just no-op.

const supported = (): boolean => typeof window !== "undefined" && "Notification" in window;

let requested = false;

// Ask once for permission. Must be triggered from a user gesture (e.g. a click)
// or Chrome ignores it — callers wire it to a session-row click.
export function ensureNotifyPermission(): void {
  if (!supported() || requested) return;
  requested = true;
  if (Notification.permission === "default") void Notification.requestPermission();
}

// Raise an OS notification. `tag` (= sessionId) dedupes so a chatty session
// replaces its own popup instead of stacking. No-op unless granted.
export function fireNotification(title: string, body: string, tag: string, onClick: () => void): void {
  if (!supported() || Notification.permission !== "granted") return;
  const n = new Notification(title, { body, tag });
  n.onclick = () => {
    window.focus();
    onClick();
    n.close();
  };
}
