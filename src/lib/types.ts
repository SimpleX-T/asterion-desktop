// Domain types mirror the asterion-scraper Postgres schema (models/Novel.ts)
// and the asterion-ios models. snake_case fields match the Supabase columns;
// the supabase-js client returns rows as-is.

export interface Novel {
  id: number;
  title: string;
  novel_url: string | null;
  author: string | null;
  rank: string | null;
  total_chapters: string | null;
  views: string | null;
  bookmarks: string | null;
  status: string | null;
  genres: string[];
  summary: string | null;
  chapters_url: string | null;
  image_url: string | null;
  rating: number | null;
  last_scraped: string | null;
  created_at: string;
  updated_at: string;
}

// Chapter INDEX row from Supabase. The text is NOT here — it lives in GCS at
// `content_path` and is fetched separately (see fetchChapterText / gcsUrl).
export interface Chapter {
  id: number;
  novel_id: number;
  chapter_number: number;
  url: string;
  title: string;
  content_path: string;
}

// A chapter index row plus its fetched text — the unit the Reader renders and
// caches for offline reading.
export interface ChapterWithText extends Chapter {
  text: string;
}

// Lightweight chapter row for the chapter list (no content payload).
export interface ChapterListItem {
  id: number;
  novel_id: number;
  chapter_number: number;
  url: string;
  title: string;
}

export interface ReadingProgress {
  user_id: string;
  novel_id: number;
  chapter_id: number;
  current_line: number;
  total_lines: number;
  updated_at: string;
}

export type ReaderTheme = "dark" | "light" | "sepia" | "warm";
export type FontFamilyPref = "serif" | "sans";

export interface UserPreferences {
  user_id: string;
  reading_goal: number;
  theme: ReaderTheme;
  font_size: number; // 14-28, mirrors ReaderView.swift fontSize
  line_spacing: number; // multiplier of font size, ~0.85 default
  max_width: number; // px, ~780 desktop default
  font_family: FontFamilyPref;
  notifications_on: boolean;
  updated_at: string;
}

// Aggregate scrape-progress counters from the scrape_progress view.
export interface ScrapeProgress {
  novels_total: number;
  novels_enriched: number;
  novels_with_chapters: number;
  chapters_total: number;
  novels_with_comments: number;
  comments_total: number;
  queue_pending: number;
  queue_processing: number;
}

// A novelfire comment scraped for a novel (read-only display).
export interface Comment {
  id: number;
  source_id: string;
  author: string | null;
  avatar_url: string | null;
  body: string;
  posted_at: string | null;
  likes: number;
}

// External ranking entry from webnoveldb (novel_id = matched in our catalog).
export interface RankingItem {
  category: string;
  position: number;
  title: string;
  cover_url: string | null;
  source_url: string;
  novel_id: number | null;
}

export const DEFAULT_PREFERENCES: Omit<UserPreferences, "user_id" | "updated_at"> = {
  reading_goal: 30,
  theme: "dark",
  font_size: 19,
  line_spacing: 0.85,
  max_width: 780,
  font_family: "serif",
  notifications_on: true,
};
