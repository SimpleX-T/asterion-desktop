-- Row Level Security.
-- Content (novels/chapters): world-readable; NO insert/update/delete policy for
-- anon or authenticated, so only the service_role (which bypasses RLS, used by
-- the ingest-novel Edge Function) can write. The client never gets a write key.
-- User data: each row is private to its owner (auth.uid()).

alter table public.novels   enable row level security;
alter table public.chapters enable row level security;

drop policy if exists "novels read" on public.novels;
create policy "novels read" on public.novels
  for select to anon, authenticated using (true);

drop policy if exists "chapters read" on public.chapters;
create policy "chapters read" on public.chapters
  for select to anon, authenticated using (true);

-- ---- user-scoped tables ----
alter table public.reading_progress enable row level security;
alter table public.library          enable row level security;
alter table public.bookmarks        enable row level security;
alter table public.user_preferences enable row level security;

-- reading_progress
drop policy if exists "own progress" on public.reading_progress;
create policy "own progress" on public.reading_progress
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- library
drop policy if exists "own library" on public.library;
create policy "own library" on public.library
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- bookmarks
drop policy if exists "own bookmarks" on public.bookmarks;
create policy "own bookmarks" on public.bookmarks
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- user_preferences
drop policy if exists "own prefs" on public.user_preferences;
create policy "own prefs" on public.user_preferences
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
