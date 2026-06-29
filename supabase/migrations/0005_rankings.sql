-- External ranking lists scraped from webnoveldb.com (a WordPress novel
-- aggregator). Each row is one ranked title in a category; novel_id links it to
-- our novelfire catalog when a title match exists (NULL = we don't have it, the
-- UI greys it out). The VM replaces a category's rows on each scrape.

create table if not exists public.rankings (
  category    text   not null,            -- trending | daily | editors_choice | weekly | monthly | alltime
  position    integer not null,           -- 1-based rank within the category
  source_slug text   not null,            -- webnoveldb /novel/{slug}
  source_url  text   not null,
  title       text   not null,
  cover_url   text,
  novel_id    bigint references public.novels(id) on delete set null,
  scraped_at  timestamptz not null default now(),
  primary key (category, position)
);

create index if not exists idx_rankings_category on public.rankings (category, position);
create index if not exists idx_rankings_novel on public.rankings (novel_id);

alter table public.rankings enable row level security;

-- Read-all (anon + authenticated); writes are service-role only (the VM).
drop policy if exists rankings_read on public.rankings;
create policy rankings_read on public.rankings
  for select to anon, authenticated using (true);
