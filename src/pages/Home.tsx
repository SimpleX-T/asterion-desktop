import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Search } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { NovelGrid } from "@/components/NovelCard";
import { useNovels, useNovelSearch } from "@/lib/queries";
import { type NovelSort } from "@/lib/api";
import { getContinue, type ContinueSnapshot } from "@/lib/reader";
import { isSupabaseConfigured } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { Novel } from "@/lib/types";

const SORTS: { id: NovelSort; label: string }[] = [
  { id: "rating", label: "Top rated" },
  { id: "title", label: "A–Z" },
  { id: "recent", label: "Newest" },
];

const GENRES = [
  "Action", "Adventure", "Fantasy", "Romance", "Martial Arts", "Xuanhuan",
  "Comedy", "Drama", "Sci-fi", "Horror", "Mystery", "Slice of Life", "Harem",
];

export function Home() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sort, setSort] = useState<NovelSort>("rating");
  const [genre, setGenre] = useState<string | null>(null);
  const [cont, setCont] = useState<ContinueSnapshot | null>(null);

  useEffect(() => {
    setCont(getContinue());
  }, []);

  // Debounce the search box; the trimmed value drives the (cached) search query.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const catalog = useNovels(sort, genre);
  const search = useNovelSearch(debouncedQuery);

  const hasText = query.trim().length > 0;
  const searching = debouncedQuery.length > 0;

  const novels = searching ? search.data ?? [] : dedupeById(catalog.data?.pages.flat() ?? []);
  const loading = searching ? search.isLoading : catalog.isLoading;
  const hasMore = !searching && (catalog.hasNextPage ?? false);
  const loadingMore = catalog.isFetchingNextPage;

  return (
    <div>
      <PageHeader eyebrow="DISCOVER" title="Web novels, on your desktop" subtitle="Read freely. Continue where you left off.">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-asterion-dim" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search titles…"
            className="w-full rounded-md border border-asterion-border bg-asterion-card py-2 pl-9 pr-3 text-sm text-asterion-text placeholder:text-asterion-dim focus:border-gold"
          />
        </div>
      </PageHeader>

      <div className="px-10 py-8">
        {!isSupabaseConfigured && <ConnectSupabaseCard />}

        {cont && !hasText && (
          <Link
            to={`/read/${cont.novelId}/${cont.chapterId}`}
            className="mb-8 flex items-center justify-between rounded-md border border-asterion-border bg-asterion-card p-5 transition-colors hover:border-gold/40"
          >
            <div>
              <div className="font-mono text-[10px] tracking-label text-asterion-muted">CONTINUE READING</div>
              <div className="mt-1 font-serif text-lg text-asterion-text">{cont.chapterTitle}</div>
              <div className="mt-1 text-xs text-asterion-muted">
                {Math.round(cont.progress * 100)}% through chapter {cont.chapterNumber}
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-gold" />
          </Link>
        )}

        {/* Filters */}
        {!hasText && (
          <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-1.5">
              <span className="mr-1 font-mono text-[10px] tracking-label text-asterion-dim">SORT</span>
              {SORTS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSort(s.id)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs transition-colors",
                    sort === s.id ? "bg-gold/15 text-gold" : "text-asterion-muted hover:text-asterion-text",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 font-mono text-[10px] tracking-label text-asterion-dim">GENRE</span>
              <GenreChip active={genre === null} onClick={() => setGenre(null)}>
                All
              </GenreChip>
              {GENRES.map((g) => (
                <GenreChip key={g} active={genre === g} onClick={() => setGenre(g)}>
                  {g}
                </GenreChip>
              ))}
            </div>
          </div>
        )}

        {loading && novels.length === 0 ? (
          <p className="text-sm text-asterion-muted">Loading catalog…</p>
        ) : novels.length > 0 ? (
          <>
            <NovelGrid novels={novels} />
            {hasMore && (
              <div className="mt-8 flex justify-center">
                <button
                  onClick={() => void catalog.fetchNextPage()}
                  disabled={loadingMore}
                  className="rounded-md border border-asterion-border px-6 py-2.5 text-sm text-asterion-text hover:border-gold/40 disabled:opacity-60"
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              </div>
            )}
          </>
        ) : (
          isSupabaseConfigured && (
            <p className="text-sm text-asterion-muted">
              {hasText ? "No matches." : genre ? `No ${genre} novels yet.` : "No novels yet."}
            </p>
          )
        )}
      </div>
    </div>
  );
}

// Guard against any residual cross-page duplicates (e.g. a row whose rating
// changed mid-pagination while the enrich job was running).
function dedupeById(novels: Novel[]): Novel[] {
  const seen = new Set<number>();
  return novels.filter((n) => (seen.has(n.id) ? false : seen.add(n.id)));
}

function GenreChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-md border px-2.5 py-1 text-xs transition-colors",
        active
          ? "border-gold/50 bg-gold/10 text-gold"
          : "border-asterion-border text-asterion-muted hover:text-asterion-text",
      )}
    >
      {children}
    </button>
  );
}

function ConnectSupabaseCard() {
  return (
    <div className="mb-8 rounded-md border border-asterion-border bg-asterion-card p-6">
      <h2 className="font-serif text-lg text-asterion-text">Connect Supabase</h2>
      <p className="mt-2 max-w-xl text-sm text-asterion-muted">
        Add <code className="text-gold">VITE_SUPABASE_URL</code> and{" "}
        <code className="text-gold">VITE_SUPABASE_ANON_KEY</code> to{" "}
        <code className="text-gold">.env</code>, then restart the dev server.
      </p>
    </div>
  );
}
