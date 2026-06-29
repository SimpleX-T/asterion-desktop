import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

// React Router v6 stores a monotonic `idx` in history.state. idx > 0 means
// there's an in-app entry to go back to (idx 0 = the first screen this session).
function historyIdx(): number {
  const s = window.history.state as { idx?: number } | null;
  return s?.idx ?? 0;
}

export function useCanGoBack(): boolean {
  useLocation(); // re-read on every navigation
  return historyIdx() > 0;
}

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

/**
 * Global "go back" shortcut: Backspace (the native Linux file-manager
 * convention) or Alt+Left (GNOME/browser). Ignored while typing in a field,
 * and a no-op at the first screen.
 */
export function useBackShortcut() {
  const navigate = useNavigate();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const wantsBack = e.key === "Backspace" || (e.altKey && e.key === "ArrowLeft");
      if (!wantsBack || isTypingTarget(e.target)) return;
      if (historyIdx() <= 0) return;
      e.preventDefault();
      navigate(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);
}
