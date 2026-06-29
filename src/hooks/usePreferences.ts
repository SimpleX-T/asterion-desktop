import { useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getPreferences, savePreferences } from "@/lib/api";
import { isSupabaseConfigured } from "@/lib/supabase";
import { DEFAULT_PREFERENCES, type UserPreferences } from "@/lib/types";

type Prefs = Omit<UserPreferences, "user_id" | "updated_at">;

const LOCAL_KEY = "asterion:prefs";
const PREFS_KEY = ["preferences"] as const;

function readLocal(): Prefs {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) return { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_PREFERENCES };
}

function writeLocal(p: Prefs) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

/**
 * Reading preferences, backed by a single shared react-query cache entry so
 * every consumer (Reader popover, Profile panel) reads and writes the SAME
 * state — change it in one place, it reflects everywhere live. Renders from
 * localStorage instantly (no flash), hydrates from Supabase in the background,
 * and persists changes debounced (accumulating patches so rapid edits to
 * different fields aren't dropped).
 */
export function usePreferences() {
  const qc = useQueryClient();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Partial<Prefs>>({});

  const { data: prefs = readLocal() } = useQuery({
    queryKey: PREFS_KEY,
    queryFn: async () => {
      const remote = await getPreferences();
      if (!remote) return readLocal();
      const merged: Prefs = {
        reading_goal: remote.reading_goal,
        theme: remote.theme,
        font_size: remote.font_size,
        line_spacing: remote.line_spacing,
        max_width: remote.max_width,
        font_family: remote.font_family,
        notifications_on: remote.notifications_on,
      };
      writeLocal(merged);
      return merged;
    },
    initialData: readLocal,
    enabled: isSupabaseConfigured,
    staleTime: 60_000,
  });

  const update = useCallback(
    (patch: Partial<Prefs>) => {
      qc.setQueryData<Prefs>(PREFS_KEY, (prev) => {
        const next = { ...(prev ?? readLocal()), ...patch };
        writeLocal(next);
        return next;
      });
      pending.current = { ...pending.current, ...patch };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        const toSave = pending.current;
        pending.current = {};
        if (isSupabaseConfigured && Object.keys(toSave).length) {
          void savePreferences(toSave).catch(() => {});
        }
      }, 800);
    },
    [qc],
  );

  return { prefs, update };
}
