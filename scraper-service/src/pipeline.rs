//! End-to-end pipeline: scrape a novel, write chapter TEXT to GCS, and upsert
//! metadata + a chapter index to Supabase. Ported orchestration from the
//! original asterion-scraper, adapted for the GCS + Supabase split.

use std::sync::Arc;

use futures::stream::{self, StreamExt};

use crate::extract;
use crate::gcs::GcsClient;
use crate::http::HttpClient;
use crate::supabase::SupabaseClient;
use crate::types::{ScrapeError, ScrapedChapter, ScrapedNovel};

const CHAPTER_CONCURRENCY: usize = 6;
const CHAPTER_BATCH_SIZE: usize = 25;

pub struct RunConfig {
    pub gcs: GcsClient,
    pub supabase: SupabaseClient,
}

#[derive(Debug)]
pub struct ProcessOutcome {
    pub novel_id: i64,
    pub novel_title: String,
    pub chapters_added: u32,
}

/// Slug used for the GCS object prefix, derived from the novel URL's last segment.
/// e.g. https://novelfire.net/book/shadow-slave -> "shadow-slave"
fn novel_slug(novel_url: &str) -> String {
    novel_url
        .trim_end_matches('/')
        .rsplit('/')
        .next()
        .unwrap_or("novel")
        .to_string()
}

fn content_path(slug: &str, chapter_number: i32) -> String {
    format!("novels/{slug}/chapter-{chapter_number}.txt")
}

fn parse_total_chapters(s: &Option<String>) -> Option<i32> {
    let raw = s.as_ref()?;
    let digits: String = raw.chars().filter(|c| c.is_ascii_digit()).collect();
    digits.parse::<i32>().ok().filter(|n| *n > 0)
}

fn chapter_base_url(novel: &ScrapedNovel) -> Option<String> {
    let chapters_url = novel.chapters_url.as_ref()?;
    Some(
        chapters_url
            .split("/chapters")
            .next()
            .unwrap_or(chapters_url)
            .trim_end_matches('/')
            .to_string(),
    )
}

/// Process one novel. When `incremental` is true, only chapters beyond what
/// Supabase already has are scraped.
pub async fn process_novel(
    cfg: &RunConfig,
    novel_url: &str,
    incremental: bool,
) -> Result<ProcessOutcome, ScrapeError> {
    let http = Arc::new(HttpClient::new()?);

    // 1. Novel details.
    let page = http.get_text(novel_url).await?;
    let novel = extract::extract_novel_details(&page, novel_url)?;
    let novel_id = cfg.supabase.upsert_novel(&novel).await?;
    let slug = novel_slug(novel_url);

    let total = parse_total_chapters(&novel.total_chapters).ok_or_else(|| {
        ScrapeError::Parse(format!("chapter count from {:?}", novel.total_chapters))
    })?;
    let base = chapter_base_url(&novel)
        .ok_or_else(|| ScrapeError::Parse("chapters_url (a.chapter-latest-container)".into()))?;

    let start = if incremental {
        cfg.supabase.highest_chapter(novel_id).await? + 1
    } else {
        1
    }
    .max(1);

    if start > total {
        return Ok(ProcessOutcome {
            novel_id,
            novel_title: novel.title,
            chapters_added: 0,
        });
    }

    let numbers: Vec<i32> = (start..=total).collect();
    let mut added: u32 = 0;

    // 2. Scrape + upload chapters in concurrent batches, then index each batch.
    for batch in numbers.chunks(CHAPTER_BATCH_SIZE) {
        let http = http.clone();
        let gcs = &cfg.gcs;
        let base = base.clone();
        let slug = slug.clone();

        let mut indexed: Vec<(ScrapedChapter, String)> = stream::iter(batch.iter().copied())
            .map(|n| {
                let http = http.clone();
                let base = base.clone();
                let slug = slug.clone();
                async move {
                    let chapter = scrape_one_chapter(&http, &base, n).await?;
                    let path = content_path(&slug, n);
                    gcs.upload_text(&path, chapter.content.clone()).await?;
                    Ok::<_, ScrapeError>((chapter, path))
                }
            })
            .buffer_unordered(CHAPTER_CONCURRENCY)
            .filter_map(|r| async move { r.ok() })
            .collect()
            .await;

        indexed.sort_by_key(|(c, _)| c.chapter_number);
        cfg.supabase.upsert_chapter_index(novel_id, &indexed).await?;
        added += indexed.len() as u32;
    }

    Ok(ProcessOutcome {
        novel_id,
        novel_title: novel.title,
        chapters_added: added,
    })
}

/// Metadata-only enrichment: fetch just the book page and upsert the novel's
/// cover/summary/genres/rating/status — no chapters, no GCS. One request per
/// novel, so it's cheap enough to run across the whole catalog for covers.
pub async fn enrich_novel(cfg: &RunConfig, novel_url: &str) -> Result<String, ScrapeError> {
    let http = HttpClient::new()?;
    let page = http.get_text(novel_url).await?;
    let novel = extract::extract_novel_details(&page, novel_url)?;
    let novel_id = cfg.supabase.upsert_novel(&novel).await?;

    // Comments are best-effort — a failure here must not fail the enrich.
    if let Some(post_id) = crate::comments::extract_post_id(&page) {
        match crate::comments::scrape_comments(&http, &post_id).await {
            Ok(comments) => {
                let _ = cfg.supabase.upsert_comments(novel_id, &comments).await;
            }
            Err(e) => eprintln!("  (comments skipped for {novel_url}: {e})"),
        }
    }

    Ok(novel.title)
}

/// Scrape webnoveldb ranking lists, match each title to our catalog, and
/// replace the rankings table per category. Returns the number of entries
/// stored and how many matched a novel we have.
pub async fn refresh_rankings(cfg: &RunConfig) -> Result<(usize, usize), ScrapeError> {
    use std::collections::BTreeMap;
    use crate::supabase::RankingRow;

    let entries = crate::webnoveldb::scrape_rankings().await?;
    let mut by_cat: BTreeMap<String, Vec<RankingRow>> = BTreeMap::new();
    let mut matched = 0usize;

    for e in entries {
        let novel_id = cfg
            .supabase
            .find_novel_id_by_title(&e.title)
            .await
            .ok()
            .flatten();
        if novel_id.is_some() {
            matched += 1;
        }
        by_cat.entry(e.category.clone()).or_default().push(RankingRow {
            category: e.category,
            position: e.position,
            source_slug: e.source_slug,
            source_url: e.source_url,
            title: e.title,
            cover_url: e.cover_url,
            novel_id,
        });
    }

    let mut total = 0;
    for (cat, rows) in by_cat {
        total += rows.len();
        cfg.supabase.replace_rankings(&cat, &rows).await?;
    }
    Ok((total, matched))
}

async fn scrape_one_chapter(
    http: &HttpClient,
    base: &str,
    number: i32,
) -> Result<ScrapedChapter, ScrapeError> {
    let url = format!("{base}/chapter-{number}");
    let html = http.get_text(&url).await?;
    let (title, content) = extract::extract_chapter(&html);
    Ok(ScrapedChapter {
        chapter_number: number,
        url,
        title: if title.is_empty() {
            format!("Chapter {number}")
        } else {
            title
        },
        content,
    })
}
