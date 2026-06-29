import { type ChapterWithText } from "./types";

// Defensive client-side mirror of the Rust/Swift promo-line filter
// (ReaderView.swift::shouldFilterMetadataLine). Content is already cleaned at
// scrape time; this catches anything that slipped through.
const PROMO = [
  "discord", "patreon", "ko-fi", "kofi", "buymeacoffee", "buy me a coffee",
  "telegram", "facebook", "twitter", "x.com", "instagram",
];
const URLISH = [
  "http://", "https://", "www.", ".com", ".net", ".org",
  "read at ", "read on ", "published on ",
];
const PREFIXES = [
  "translator:", "editor:", "edited by", "proofreader:", "raw provider:",
  "source:", "author note:", "a/n:", "note:", "tl:", "t/l:", "edit:", "credits:",
];
const CHAPTER_HEADING = /^chapter\s*\d+(\s*[:\-].*)?$/i;

export function shouldFilterLine(line: string, chapterTitle: string): boolean {
  const lowered = line.toLowerCase();
  const compact = lowered.replace(/\s/g, "");
  if (PREFIXES.some((p) => lowered.startsWith(p))) return true;
  if (PROMO.some((k) => lowered.includes(k))) return true;
  if (URLISH.some((k) => lowered.includes(k))) return true;
  if (compact === "atlasstudios" || compact.includes("atlasstudioseditor")) return true;
  if (chapterTitle && lowered === chapterTitle.toLowerCase()) return true;
  if (CHAPTER_HEADING.test(lowered)) return true;
  return false;
}

export function toParagraphs(content: string, chapterTitle: string): string[] {
  return content
    .split("\n")
    .map((l) => l.trim().replace(/\s+/g, " "))
    .filter((l) => l.length > 0)
    .filter((l) => !shouldFilterLine(l, chapterTitle));
}

// ---------- Offline cache (localStorage; swap to Tauri fs for large libraries) ----------

const cacheKey = (chapterId: number) => `asterion:chapter:${chapterId}`;

export function cacheChapter(ch: ChapterWithText): void {
  try {
    localStorage.setItem(cacheKey(ch.id), JSON.stringify(ch));
  } catch {
    // storage full / unavailable — non-fatal
  }
}

export function getCachedChapter(chapterId: number): ChapterWithText | null {
  try {
    const raw = localStorage.getItem(cacheKey(chapterId));
    return raw ? (JSON.parse(raw) as ChapterWithText) : null;
  } catch {
    return null;
  }
}

// "Continue reading" snapshot for the Home/Profile screens.
export interface ContinueSnapshot {
  novelId: number;
  novelTitle: string;
  chapterId: number;
  chapterTitle: string;
  chapterNumber: number;
  progress: number; // 0..1
  updatedAt: number;
}

const CONTINUE_KEY = "asterion:continue";

export function saveContinue(snap: ContinueSnapshot): void {
  try {
    localStorage.setItem(CONTINUE_KEY, JSON.stringify(snap));
  } catch {
    /* ignore */
  }
}

export function getContinue(): ContinueSnapshot | null {
  try {
    const raw = localStorage.getItem(CONTINUE_KEY);
    return raw ? (JSON.parse(raw) as ContinueSnapshot) : null;
  } catch {
    return null;
  }
}
