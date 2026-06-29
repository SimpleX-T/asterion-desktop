import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BookmarkPlus, BookmarkCheck, Check, Download, Loader2, Play, Star } from "lucide-react";
import { toast } from "sonner";
import { requestScrape, toggleLibrary } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  useComments,
  useInvalidateLibrary,
  useLibrary,
  useNovel,
  useNovelChapters,
  useProgress,
} from "@/lib/queries";
import { GeneratedCover } from "@/components/GeneratedCover";
import { chapterCountLabel } from "@/lib/format";

export function NovelDetail() {
  const { novelId: param } = useParams();
  const novelId = Number(param);
  const { data: novel, isLoading: loading } = useNovel(novelId);
  const { data: chapters = [] } = useNovelChapters(novelId);
  const { data: progress = null } = useProgress(novelId);
  const { data: library = [] } = useLibrary();
  const invalidateLibrary = useInvalidateLibrary();
  const inLibrary = library.some((x) => x.id === novelId);
  const [requesting, setRequesting] = useState(false);

  const onRequestScrape = async () => {
    if (!novel?.novel_url) return;
    setRequesting(true);
    try {
      const queued = await requestScrape(novel.novel_url);
      toast.success(queued ? "Queued for scraping" : "Already queued");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not queue");
    } finally {
      setRequesting(false);
    }
  };

  const onToggleLibrary = async () => {
    await toggleLibrary(novelId, inLibrary);
    void invalidateLibrary();
  };

  if (loading) {
    return <div className="px-10 py-10 text-sm text-asterion-muted">Loading…</div>;
  }
  if (!novel) {
    return <div className="px-10 py-10 text-sm text-asterion-muted">Novel not found.</div>;
  }

  const firstChapter = chapters[0];
  const resumeChapterId = progress?.chapter_id ?? firstChapter?.id;
  const hasChapters = chapters.length > 0;

  // Linear-reading heuristic: everything before your current chapter is read.
  const currentNumber =
    (progress ? chapters.find((c) => c.id === progress.chapter_id)?.chapter_number : null) ?? null;
  const readCount =
    currentNumber != null ? chapters.filter((c) => c.chapter_number < currentNumber).length : 0;

  return (
    <div className="px-10 py-10">
      <div className="flex gap-8">
        <div className="h-72 w-48 shrink-0 overflow-hidden rounded-md border border-asterion-border bg-asterion-card shadow-lg shadow-black/30">
          {novel.image_url ? (
            <img src={novel.image_url} alt={novel.title} className="h-full w-full object-cover" />
          ) : (
            <GeneratedCover title={novel.title} author={novel.author} />
          )}
        </div>

        <div className="flex flex-1 flex-col">
          <h1 className="font-serif text-3xl font-light text-asterion-text">{novel.title}</h1>
          {novel.author && <p className="mt-1 text-asterion-muted">{novel.author}</p>}

          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-asterion-muted">
            {novel.rating != null && (
              <span className="flex items-center gap-1 text-gold">
                <Star className="h-3.5 w-3.5 fill-gold" /> {novel.rating.toFixed(1)}
              </span>
            )}
            {novel.status && <span>{novel.status}</span>}
            {chapterCountLabel(novel.total_chapters) && (
              <span>{chapterCountLabel(novel.total_chapters)}</span>
            )}
            {novel.views && <span>{novel.views} views</span>}
          </div>

          {novel.genres?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {novel.genres.map((g) => (
                <span
                  key={g}
                  className="rounded-full border border-asterion-border px-2.5 py-0.5 text-[11px] text-asterion-muted"
                >
                  {g}
                </span>
              ))}
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            {hasChapters && resumeChapterId && (
              <Link
                to={`/read/${novelId}/${resumeChapterId}`}
                className="flex items-center gap-2 rounded-lg bg-gold px-5 py-2.5 text-sm font-medium text-asterion-bg"
              >
                <Play className="h-4 w-4" />
                {progress ? "Continue" : "Start reading"}
              </Link>
            )}
            <button
              onClick={() => void onRequestScrape()}
              disabled={requesting}
              className="flex items-center gap-2 rounded-lg border border-asterion-border px-5 py-2.5 text-sm text-asterion-text disabled:opacity-60"
            >
              {requesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {hasChapters ? "Request update" : "Request scrape"}
            </button>
            <button
              onClick={() => void onToggleLibrary()}
              className="flex items-center gap-2 rounded-lg border border-asterion-border px-5 py-2.5 text-sm text-asterion-text"
            >
              {inLibrary ? (
                <BookmarkCheck className="h-4 w-4 text-gold" />
              ) : (
                <BookmarkPlus className="h-4 w-4" />
              )}
              {inLibrary ? "In library" : "Add to library"}
            </button>
          </div>
        </div>
      </div>

      {novel.summary && (
        <div className="mt-8 max-w-3xl">
          <h2 className="mb-2 font-mono text-[10px] tracking-label text-asterion-muted">SYNOPSIS</h2>
          <p className="whitespace-pre-line leading-relaxed text-asterion-synopsis">
            {novel.summary}
          </p>
        </div>
      )}

      <div className="mt-10">
        <h2 className="mb-3 font-mono text-[10px] tracking-label text-asterion-muted">
          CHAPTERS ({chapters.length})
          {readCount > 0 && <span className="ml-2 text-gold/70">· {readCount} read</span>}
        </h2>
        {hasChapters ? (
          <div className="max-h-[480px] overflow-y-auto rounded-xl border border-asterion-border">
            {chapters.map((c) => {
              const isCurrent = progress?.chapter_id === c.id;
              const isRead = currentNumber != null && c.chapter_number < currentNumber;
              return (
                <Link
                  key={c.id}
                  to={`/read/${novelId}/${c.id}`}
                  className={cn(
                    "flex items-center gap-3 border-b border-asterion-border px-4 py-2.5 text-sm last:border-b-0 hover:bg-asterion-card",
                    isCurrent && "bg-gold/10",
                  )}
                >
                  <span className="w-12 shrink-0 font-mono text-[11px] text-asterion-dim">
                    {c.chapter_number}
                  </span>
                  <span
                    className={cn(
                      "truncate",
                      isRead ? "text-asterion-muted" : "text-asterion-text",
                      isCurrent && "text-gold",
                    )}
                  >
                    {c.title}
                  </span>
                  <span className="ml-auto shrink-0">
                    {isCurrent ? (
                      <span className="rounded bg-gold/20 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-gold">
                        Reading
                      </span>
                    ) : isRead ? (
                      <Check className="h-4 w-4 text-gold/60" />
                    ) : null}
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-asterion-muted">
            No chapters scraped yet. Click "Scrape this novel" to fetch them.
          </p>
        )}
      </div>

      <CommentsSection novelId={novelId} />
    </div>
  );
}

function CommentsSection({ novelId }: { novelId: number }) {
  const { data: comments = [], isLoading } = useComments(novelId);
  if (!isLoading && comments.length === 0) return null;
  return (
    <div className="mt-10 max-w-3xl">
      <h2 className="mb-3 font-mono text-[10px] tracking-label text-asterion-muted">
        COMMENTS{comments.length > 0 && ` (${comments.length})`}
      </h2>
      <div className="space-y-4">
        {comments.map((c) => (
          <div key={c.id} className="flex gap-3">
            <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-asterion-cardHover">
              {c.avatar_url && (
                <img src={c.avatar_url} alt="" loading="lazy" className="h-full w-full object-cover" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="truncate text-sm font-medium text-asterion-text">
                  {c.author ?? "Reader"}
                </span>
                {c.posted_at && (
                  <span className="shrink-0 font-mono text-[10px] text-asterion-dim">{c.posted_at}</span>
                )}
              </div>
              <p className="mt-0.5 whitespace-pre-line break-words text-sm text-asterion-synopsis">
                {c.body}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
