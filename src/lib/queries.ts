import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getLibrary,
  getNovel,
  getProgress,
  getScrapeProgress,
  listChapters,
  listComments,
  listNovels,
  listRankings,
  searchNovels,
  type NovelSort,
} from "@/lib/api";
import { isSupabaseConfigured } from "@/lib/supabase";

const PAGE = 60;

// Centralized query keys so invalidation stays consistent across screens.
export const qk = {
  novels: (sort: NovelSort, genre: string | null) => ["novels", sort, genre] as const,
  search: (q: string) => ["search", q] as const,
  novel: (id: number) => ["novel", id] as const,
  chapters: (id: number) => ["chapters", id] as const,
  progress: (id: number) => ["progress", id] as const,
  library: ["library"] as const,
  ranking: ["ranking"] as const,
};

/** Catalog grid with filters — infinite pages, cached per (sort, genre). */
export function useNovels(sort: NovelSort, genre: string | null) {
  return useInfiniteQuery({
    queryKey: qk.novels(sort, genre),
    queryFn: ({ pageParam }) => listNovels({ limit: PAGE, offset: pageParam, sort, genre }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === PAGE ? allPages.reduce((n, p) => n + p.length, 0) : undefined,
    enabled: isSupabaseConfigured,
  });
}

export function useNovelSearch(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: qk.search(q),
    queryFn: () => searchNovels(q, 80),
    enabled: isSupabaseConfigured && q.length > 0,
  });
}

export function useNovel(id: number) {
  return useQuery({
    queryKey: qk.novel(id),
    queryFn: () => getNovel(id),
    enabled: isSupabaseConfigured && Number.isFinite(id),
  });
}

export function useNovelChapters(id: number) {
  return useQuery({
    queryKey: qk.chapters(id),
    queryFn: () => listChapters(id),
    enabled: isSupabaseConfigured && Number.isFinite(id),
  });
}

/** User progress changes as you read — show cached instantly, always revalidate. */
export function useProgress(id: number) {
  return useQuery({
    queryKey: qk.progress(id),
    queryFn: () => getProgress(id).catch(() => null),
    enabled: isSupabaseConfigured && Number.isFinite(id),
    staleTime: 0,
  });
}

export function useLibrary() {
  return useQuery({
    queryKey: qk.library,
    queryFn: () => getLibrary(),
    enabled: isSupabaseConfigured,
    staleTime: 0,
  });
}

export function useRanking() {
  return useQuery({
    queryKey: qk.ranking,
    queryFn: () => listNovels({ limit: 100, sort: "rating" }),
    enabled: isSupabaseConfigured,
  });
}

export function useScrapeProgress() {
  return useQuery({
    queryKey: ["scrape-progress"] as const,
    queryFn: getScrapeProgress,
    enabled: isSupabaseConfigured,
    refetchInterval: 15_000, // live-ish while the page is open
    staleTime: 0,
  });
}

export function useComments(novelId: number) {
  return useQuery({
    queryKey: ["comments", novelId] as const,
    queryFn: () => listComments(novelId),
    enabled: isSupabaseConfigured && Number.isFinite(novelId),
  });
}

export function useRankings(category: string) {
  return useQuery({
    queryKey: ["rankings", category] as const,
    queryFn: () => listRankings(category),
    enabled: isSupabaseConfigured,
  });
}

/** Invalidate library + a novel's pages after a mutation (add/remove). */
export function useInvalidateLibrary() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: qk.library });
}
