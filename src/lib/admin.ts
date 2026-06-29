import { useEffect, useState } from "react";

// Owner-only "admin" mode, persisted locally. Gates the scrape-progress
// dashboard so end users never see scraping internals. Toggled by a hidden
// shortcut (Ctrl+Shift+S) — off by default in shipped builds.
const KEY = "asterion:admin";
const EVENT = "asterion:admin-change";

export function isAdmin(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function toggleAdmin(): boolean {
  const next = !isAdmin();
  try {
    localStorage.setItem(KEY, next ? "1" : "0");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(EVENT));
  return next;
}

export function useAdmin(): boolean {
  const [admin, setAdmin] = useState(isAdmin);
  useEffect(() => {
    const h = () => setAdmin(isAdmin());
    window.addEventListener(EVENT, h);
    return () => window.removeEventListener(EVENT, h);
  }, []);
  return admin;
}
