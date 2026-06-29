-- Aggregate scrape-progress counters, exposed as a single-row view so the app
-- can show live progress with the publishable key (read-only). Runs as the view
-- owner, so the distinct-novel counts work regardless of per-table RLS.

create or replace view public.scrape_progress as
select
  (select count(*) from public.novels)                              as novels_total,
  (select count(*) from public.novels where image_url is not null)  as novels_enriched,
  (select count(distinct novel_id) from public.chapters)            as novels_with_chapters,
  (select count(*) from public.chapters)                            as chapters_total,
  (select count(distinct novel_id) from public.comments)           as novels_with_comments,
  (select count(*) from public.comments)                            as comments_total,
  (select count(*) from public.scrape_requests where status = 'pending')    as queue_pending,
  (select count(*) from public.scrape_requests where status = 'processing') as queue_processing;

grant select on public.scrape_progress to anon, authenticated;
