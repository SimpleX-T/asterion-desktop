import { supabase } from "./supabase";
import {
  type Chapter,
  type ChapterListItem,
  type Comment,
  type Novel,
  type RankingItem,
  type ReadingProgress,
  type ScrapeProgress,
  type UserPreferences,
  DEFAULT_PREFERENCES,
} from "./types";

export async function getScrapeProgress(): Promise<ScrapeProgress | null> {
  const { data, error } = await supabase.from("scrape_progress").select("*").single();
  if (error) throw error;
  return data;
}

export async function listComments(novelId: number, limit = 50): Promise<Comment[]> {
  const { data, error } = await supabase
    .from("comments")
    .select("id,source_id,author,avatar_url,body,posted_at,likes")
    .eq("novel_id", novelId)
    .order("id", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function listRankings(category: string): Promise<RankingItem[]> {
  const { data, error } = await supabase
    .from("rankings")
    .select("category,position,title,cover_url,source_url,novel_id")
    .eq("category", category)
    .order("position", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// ---------- Catalog (content) ----------

export type NovelSort = "rating" | "title" | "recent";

export interface ListOpts {
  limit?: number;
  offset?: number;
  sort?: NovelSort;
  genre?: string | null;
}

export async function listNovels(opts: ListOpts = {}): Promise<Novel[]> {
  const { limit = 60, offset = 0, sort = "rating", genre = null } = opts;
  let q = supabase.from("novels").select("*");
  if (genre) q = q.contains("genres", [genre]);
  if (sort === "rating") q = q.order("rating", { ascending: false, nullsFirst: false });
  else if (sort === "title") q = q.order("title", { ascending: true });
  else q = q.order("updated_at", { ascending: false });
  // Stable tiebreaker: the primary sort columns have many ties (lots of 5.0 /
  // null ratings, duplicate titles), and without a unique tiebreaker Postgres
  // orders ties arbitrarily — so OFFSET pages overlap (dupes) and skip rows.
  q = q.order("id", { ascending: true });
  const { data, error } = await q.range(offset, offset + limit - 1);
  if (error) throw error;
  return data ?? [];
}

export async function searchNovels(query: string, limit = 40): Promise<Novel[]> {
  const { data, error } = await supabase
    .from("novels")
    .select("*")
    .ilike("title", `%${query}%`)
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getNovel(novelId: number): Promise<Novel | null> {
  const { data, error } = await supabase
    .from("novels")
    .select("*")
    .eq("id", novelId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listChapters(
  novelId: number,
  limit = 2000,
  offset = 0,
): Promise<ChapterListItem[]> {
  const { data, error } = await supabase
    .from("chapters")
    .select("id, novel_id, chapter_number, url, title")
    .eq("novel_id", novelId)
    .order("chapter_number", { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return data ?? [];
}

export async function getChapter(chapterId: number): Promise<Chapter | null> {
  const { data, error } = await supabase
    .from("chapters")
    .select("id, novel_id, chapter_number, url, title, content_path")
    .eq("id", chapterId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Adjacent chapter by number (for prev/next that survives gaps).
export async function getAdjacentChapter(
  novelId: number,
  fromNumber: number,
  direction: 1 | -1,
): Promise<Chapter | null> {
  const cmp = direction === 1 ? "gt" : "lt";
  const { data, error } = await supabase
    .from("chapters")
    .select("id, novel_id, chapter_number, url, title, content_path")
    .eq("novel_id", novelId)
    [cmp]("chapter_number", fromNumber)
    .order("chapter_number", { ascending: direction === 1 })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Fetch the chapter TEXT from the public GCS bucket.
const GCS_BUCKET = import.meta.env.VITE_GCS_BUCKET as string | undefined;

export function gcsUrl(contentPath: string): string {
  return `https://storage.googleapis.com/${GCS_BUCKET ?? "asterion-novels"}/${contentPath}`;
}

export async function fetchChapterText(contentPath: string): Promise<string> {
  const res = await fetch(gcsUrl(contentPath));
  if (!res.ok) throw new Error(`chapter text ${res.status}`);
  return res.text();
}

// ---------- Scrape requests (queue drained by the VM runner) ----------

// Returns true if newly queued, false if a request was already open (the
// partial unique index blocks a second pending/processing row per URL).
export async function requestScrape(novelUrl: string): Promise<boolean> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not signed in.");
  const { error } = await supabase
    .from("scrape_requests")
    .insert({ novel_url: novelUrl, requested_by: auth.user.id });
  if (error) {
    if (error.code === "23505") return false; // already queued — not an error
    throw error;
  }
  return true;
}

// ---------- Reading progress ----------

export async function getProgress(novelId: number): Promise<ReadingProgress | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await supabase
    .from("reading_progress")
    .select("*")
    .eq("user_id", auth.user.id)
    .eq("novel_id", novelId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertProgress(
  novelId: number,
  chapterId: number,
  currentLine: number,
  totalLines: number,
): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;
  const { error } = await supabase.from("reading_progress").upsert(
    {
      user_id: auth.user.id,
      novel_id: novelId,
      chapter_id: chapterId,
      current_line: currentLine,
      total_lines: totalLines,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,novel_id" },
  );
  if (error) throw error;
}

// ---------- Preferences ----------

export async function getPreferences(): Promise<UserPreferences | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await supabase
    .from("user_preferences")
    .select("*")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function savePreferences(
  patch: Partial<Omit<UserPreferences, "user_id" | "updated_at">>,
): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;
  const { error } = await supabase.from("user_preferences").upsert(
    {
      user_id: auth.user.id,
      ...DEFAULT_PREFERENCES,
      ...patch,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}

// ---------- Library ----------

export async function getLibrary(): Promise<Novel[]> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];
  const { data, error } = await supabase
    .from("library")
    .select("added_at, novels(*)")
    .eq("user_id", auth.user.id)
    .order("added_at", { ascending: false });
  if (error) throw error;
  // supabase returns the joined novel under `novels`
  return (data ?? []).map((row: any) => row.novels).filter(Boolean);
}

export async function toggleLibrary(novelId: number, inLibrary: boolean): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;
  if (inLibrary) {
    const { error } = await supabase
      .from("library")
      .delete()
      .eq("user_id", auth.user.id)
      .eq("novel_id", novelId);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("library")
      .upsert(
        { user_id: auth.user.id, novel_id: novelId },
        { onConflict: "user_id,novel_id" },
      );
    if (error) throw error;
  }
}
