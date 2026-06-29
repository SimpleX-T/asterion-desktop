import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Download, Settings2 } from "lucide-react";
import { toast } from "sonner";
import {
  fetchChapterText,
  getAdjacentChapter,
  getChapter,
  getProgress,
  listChapters,
  upsertProgress,
} from "@/lib/api";
import {
  cacheChapter,
  getCachedChapter,
  saveContinue,
  toParagraphs,
} from "@/lib/reader";
import { saveChapterToFile } from "@/lib/download";
import { usePreferences } from "@/hooks/usePreferences";
import { isSupabaseConfigured } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { Chapter, ChapterListItem, ChapterWithText, ReaderTheme } from "@/lib/types";

const THEMES: ReaderTheme[] = ["dark", "sepia", "warm", "light"];
const MIN_FONT = 14;
const MAX_FONT = 28;
const AUTO_HIDE_MS = 3500;
const PROGRESS_TARGET_Y = 120; // matches ReaderView.swift targetY

export function Reader() {
  const { novelId: novelIdParam, chapterId: chapterIdParam } = useParams();
  const novelId = Number(novelIdParam);
  const navigate = useNavigate();
  const { prefs, update } = usePreferences();

  const [chapter, setChapter] = useState<ChapterWithText | null>(null);
  const [chapters, setChapters] = useState<ChapterListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [progressPct, setProgressPct] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const paraRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentLine = useRef(0);
  const pendingRestoreLine = useRef<number | null>(null);

  const paragraphs = useMemo(
    () => (chapter ? toParagraphs(chapter.text, chapter.title) : []),
    [chapter],
  );

  // ---------- control auto-hide ----------
  const revealControls = useCallback(() => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), AUTO_HIDE_MS);
  }, []);

  useEffect(() => {
    revealControls();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (progressTimer.current) clearTimeout(progressTimer.current);
    };
  }, [revealControls]);

  // ---------- load chapter + list ----------
  const loadChapter = useCallback(
    async (id: number, restoreLine?: number) => {
      setLoading(true);
      try {
        let full: ChapterWithText | null = null;
        if (isSupabaseConfigured) {
          try {
            const idx = await getChapter(id);
            if (idx) {
              const text = await fetchChapterText(idx.content_path);
              full = { ...idx, text };
            }
          } catch {
            full = getCachedChapter(id); // offline fallback
          }
        }
        if (!full) full = getCachedChapter(id);
        if (full) {
          cacheChapter(full);
          setChapter(full);
          currentLine.current = restoreLine ?? 0;
          pendingRestoreLine.current = restoreLine ?? null;
        }
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const id = Number(chapterIdParam);
    if (!Number.isFinite(id)) return;
    void (async () => {
      if (isSupabaseConfigured && Number.isFinite(novelId)) {
        try {
          setChapters(await listChapters(novelId));
        } catch {
          /* offline */
        }
        // resume from saved progress if it points at this chapter
        try {
          const prog = await getProgress(novelId);
          if (prog && prog.chapter_id === id) {
            await loadChapter(id, prog.current_line);
            return;
          }
        } catch {
          /* ignore */
        }
      }
      await loadChapter(id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterIdParam, novelId]);

  // ---------- restore scroll after paragraphs render ----------
  useEffect(() => {
    if (pendingRestoreLine.current == null || paragraphs.length === 0) return;
    const line = Math.max(0, Math.min(pendingRestoreLine.current, paragraphs.length - 1));
    requestAnimationFrame(() => {
      paraRefs.current[line]?.scrollIntoView({ block: "start", behavior: "auto" });
      pendingRestoreLine.current = null;
    });
  }, [paragraphs]);

  // ---------- progress tracking on scroll ----------
  const onScroll = useCallback(() => {
    const container = scrollRef.current;
    if (!container || paragraphs.length === 0) return;
    // Scroll-ratio progress for the bottom bar.
    const scrollable = container.scrollHeight - container.clientHeight;
    setProgressPct(scrollable > 0 ? Math.round(Math.min(1, container.scrollTop / scrollable) * 100) : 0);
    const containerTop = container.getBoundingClientRect().top;
    let best = 0;
    let bestDist = Infinity;
    paraRefs.current.forEach((el, i) => {
      if (!el) return;
      const y = el.getBoundingClientRect().top - containerTop;
      const dist = Math.abs(y - PROGRESS_TARGET_Y);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    if (best === currentLine.current) return;
    currentLine.current = best;

    if (progressTimer.current) clearTimeout(progressTimer.current);
    progressTimer.current = setTimeout(() => syncProgress(), 1200);
  }, [paragraphs]);

  const syncProgress = useCallback(() => {
    if (!chapter) return;
    const total = Math.max(1, paragraphs.length);
    const pct = Math.min(1, currentLine.current / total);
    saveContinue({
      novelId,
      novelTitle: "", // filled by NovelDetail navigation in Phase 4
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      chapterNumber: chapter.chapter_number,
      progress: pct,
      updatedAt: Date.now(),
    });
    if (isSupabaseConfigured) {
      void upsertProgress(novelId, chapter.id, currentLine.current, total).catch(() => {});
    }
  }, [chapter, paragraphs.length, novelId]);

  // ---------- chapter navigation ----------
  const navIndex = useMemo(
    () => (chapter ? chapters.findIndex((c) => c.id === chapter.id) : -1),
    [chapters, chapter],
  );
  const hasPrev = navIndex > 0;
  const hasNext = navIndex >= 0 && navIndex < chapters.length - 1;

  const goChapter = useCallback(
    async (dir: 1 | -1) => {
      if (!chapter) return;
      syncProgress();
      // prefer the in-memory list; fall back to a number-based lookup
      let target: ChapterListItem | Chapter | null = null;
      const idx = navIndex + dir;
      if (idx >= 0 && idx < chapters.length) {
        target = chapters[idx];
      } else if (isSupabaseConfigured) {
        target = await getAdjacentChapter(novelId, chapter.chapter_number, dir);
      }
      if (!target) return;
      scrollRef.current?.scrollTo({ top: 0 });
      // Replace history so the Back button always returns to the novel page,
      // not the previous chapter you hopped through.
      navigate(`/read/${novelId}/${target.id}`, { replace: true });
    },
    [chapter, chapters, navIndex, novelId, navigate, syncProgress],
  );

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") void goChapter(1);
      else if (e.key === "ArrowLeft") void goChapter(-1);
      else if (e.key === "Escape") navigate(-1);
      else if (e.key === "+" || e.key === "=")
        update({ font_size: Math.min(MAX_FONT, prefs.font_size + 1) });
      else if (e.key === "-")
        update({ font_size: Math.max(MIN_FONT, prefs.font_size - 1) });
      else return;
      revealControls();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goChapter, navigate, update, prefs.font_size, revealControls]);

  // ---------- download ----------
  const onDownload = useCallback(async () => {
    if (!chapter) return;
    const header =
      chapter.chapter_number > 0
        ? `Chapter ${chapter.chapter_number}: ${chapter.title}`
        : chapter.title;
    const body = paragraphs.join("\n\n");
    const ok = await saveChapterToFile(
      `${header}.txt`,
      `${header}\n\n${body}`,
    );
    if (ok) toast.success("Chapter saved");
  }, [chapter, paragraphs]);

  const fontFamilyClass = prefs.font_family === "serif" ? "font-serif" : "font-sans";

  return (
    <div
      data-reader-theme={prefs.theme}
      className="relative h-screen overflow-hidden bg-reader-bg text-reader-text"
      onMouseMove={revealControls}
    >
      {/* scroll area */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        onClick={() => setShowControls((s) => !s)}
        className="h-full overflow-y-auto px-6"
      >
        <div
          className="mx-auto"
          style={{ maxWidth: prefs.max_width }}
        >
          {/* heading */}
          <div className="flex flex-col items-center gap-2 pb-6 pt-24 text-center">
            {chapter && chapter.chapter_number > 0 && (
              <div className="font-mono text-[10px] tracking-label text-reader-muted">
                CHAPTER {chapter.chapter_number}
              </div>
            )}
            <h1 className="font-serif text-2xl font-light italic text-reader-text/90">
              {chapter?.title ?? (loading ? "Loading…" : "")}
            </h1>
            <div className="mt-2 h-px w-10 bg-reader-border" />
          </div>

          {/* body */}
          <div className="pb-40">
            {paragraphs.map((para, i) => (
              <p
                key={i}
                ref={(el) => {
                  paraRefs.current[i] = el;
                }}
                className={cn(fontFamilyClass, "mb-5 text-reader-text")}
                style={{
                  fontSize: prefs.font_size,
                  lineHeight: 1 + prefs.line_spacing,
                }}
              >
                {para}
              </p>
            ))}
          </div>

          {/* end-of-chapter nav */}
          {chapter && (
            <div className="flex items-center justify-center gap-4 border-t border-reader-border py-10">
              {hasPrev && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void goChapter(-1);
                  }}
                  className="rounded-md border border-reader-border px-6 py-3 font-serif text-sm text-reader-muted hover:text-reader-text"
                >
                  ← Previous
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void goChapter(1);
                }}
                disabled={!hasNext}
                className="rounded-md border border-reader-accent/40 px-6 py-3 font-serif text-sm text-reader-accent transition-colors hover:bg-reader-accent/10 disabled:opacity-40"
              >
                Next Chapter →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* top control bar */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-3 px-6 pb-6 pt-5 transition-opacity duration-300",
          "bg-gradient-to-b from-reader-bg via-reader-bg/95 to-transparent",
          showControls ? "opacity-100" : "opacity-0",
        )}
      >
        <button
          onClick={() => navigate(`/novel/${novelId}`)}
          className="pointer-events-auto rounded-md border border-reader-border px-3.5 py-1.5 font-mono text-xs text-reader-muted hover:text-reader-text"
        >
          ← Back
        </button>
        <div className="pointer-events-none flex min-w-0 flex-col items-center">
          <span className="truncate font-mono text-[11px] text-reader-muted">{chapter?.title}</span>
          {chapter && chapter.chapter_number > 0 && (
            <span className="font-mono text-[10px] text-reader-muted/60">
              Ch. {chapter.chapter_number} · {progressPct}%
            </span>
          )}
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <IconBtn onClick={() => void goChapter(-1)} title="Previous chapter" disabled={!hasPrev}>
            <ArrowLeft className="h-4 w-4" />
          </IconBtn>
          <IconBtn onClick={() => void goChapter(1)} title="Next chapter" disabled={!hasNext}>
            <ArrowRight className="h-4 w-4" />
          </IconBtn>
          <div className="mx-1 h-5 w-px bg-reader-border" />
          <IconBtn onClick={onDownload} title="Download chapter">
            <Download className="h-4 w-4" />
          </IconBtn>
          <IconBtn
            onClick={() => update({ font_size: Math.max(MIN_FONT, prefs.font_size - 1) })}
            title="Smaller text"
          >
            <span className="text-sm">A-</span>
          </IconBtn>
          <IconBtn
            onClick={() => update({ font_size: Math.min(MAX_FONT, prefs.font_size + 1) })}
            title="Larger text"
          >
            <span className="text-base">A+</span>
          </IconBtn>
          <IconBtn onClick={() => setShowSettings((s) => !s)} title="Reading settings">
            <Settings2 className="h-4 w-4" />
          </IconBtn>
        </div>
      </div>

      {/* settings panel */}
      {showSettings && showControls && (
        <div className="absolute right-6 top-16 z-10 w-64 rounded-xl border border-reader-border bg-reader-bg/95 p-4 shadow-xl backdrop-blur">
          <SettingRow label="Theme">
            <div className="flex gap-1.5">
              {THEMES.map((t) => (
                <button
                  key={t}
                  onClick={() => update({ theme: t })}
                  className={cn(
                    "h-6 w-6 rounded-full border",
                    prefs.theme === t ? "border-reader-accent" : "border-reader-border",
                  )}
                  data-reader-theme={t}
                  style={{ background: "rgb(var(--reader-bg))" }}
                  title={t}
                />
              ))}
            </div>
          </SettingRow>
          <SettingRow label="Font">
            <div className="flex gap-1.5">
              {(["serif", "sans"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => update({ font_family: f })}
                  className={cn(
                    "rounded px-2 py-1 text-xs",
                    prefs.font_family === f
                      ? "bg-reader-accent/20 text-reader-accent"
                      : "text-reader-muted",
                    f === "serif" ? "font-serif" : "font-sans",
                  )}
                >
                  {f === "serif" ? "Serif" : "Sans"}
                </button>
              ))}
            </div>
          </SettingRow>
          <SettingRow label={`Spacing ${(1 + prefs.line_spacing).toFixed(2)}`}>
            <input
              type="range"
              min={0.4}
              max={1.4}
              step={0.05}
              value={prefs.line_spacing}
              onChange={(e) => update({ line_spacing: Number(e.target.value) })}
              className="w-28 accent-[color:rgb(var(--reader-accent))]"
            />
          </SettingRow>
          <SettingRow label={`Width ${prefs.max_width}px`}>
            <input
              type="range"
              min={560}
              max={1040}
              step={20}
              value={prefs.max_width}
              onChange={(e) => update({ max_width: Number(e.target.value) })}
              className="w-28 accent-[color:rgb(var(--reader-accent))]"
            />
          </SettingRow>
        </div>
      )}

      {/* slim reading-progress bar (always visible, bottom edge) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-reader-border/40">
        <div
          className="h-full bg-reader-accent/80 transition-[width] duration-150"
          style={{ width: `${progressPct}%` }}
        />
      </div>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="flex h-8 w-8 items-center justify-center rounded-md border border-reader-border text-reader-muted transition-colors hover:text-reader-text disabled:opacity-30 disabled:hover:text-reader-muted"
    >
      {children}
    </button>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2 last:mb-0">
      <span className="font-mono text-[10px] uppercase tracking-wider text-reader-muted">
        {label}
      </span>
      {children}
    </div>
  );
}
