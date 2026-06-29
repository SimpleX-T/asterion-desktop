//! Asterion catalog runner — runs on the GCP VM.
//!
//! Modes:
//!   catalog-runner queue            process pending scrape_requests (default)
//!   catalog-runner novel <url>      scrape one novel (full)
//!   catalog-runner sync <url>       scrape only new chapters for one novel
//!   catalog-runner catalog [N] [O]  backfill from the vendored catalog (limit N, offset O)
//!
//! Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, GCS_BUCKET
//!      (GCS auth via the VM's attached service account, or GCS_ACCESS_TOKEN locally)
//!      CATALOG_FILE (default: ../supabase/seed/novelfire-catalog.json)
//!      NOVEL_CONCURRENCY (default: 2)

use std::sync::Arc;

use anyhow::{anyhow, Context, Result};
use futures::stream::{self, StreamExt};
use serde::Deserialize;

use asterion_scraper::gcs::GcsClient;
use asterion_scraper::pipeline::{enrich_novel, process_novel, refresh_rankings, RunConfig};
use asterion_scraper::supabase::SupabaseClient;

#[derive(Deserialize)]
struct Catalog {
    novels: Vec<CatalogNovel>,
}
#[derive(Deserialize)]
struct CatalogNovel {
    url: String,
}

fn config() -> Result<RunConfig> {
    let base = std::env::var("SUPABASE_URL").context("SUPABASE_URL not set")?;
    let key = std::env::var("SUPABASE_SERVICE_KEY").context("SUPABASE_SERVICE_KEY not set")?;
    let bucket = std::env::var("GCS_BUCKET").context("GCS_BUCKET not set")?;
    Ok(RunConfig {
        gcs: GcsClient::new(bucket),
        supabase: SupabaseClient::new(base, key),
    })
}

#[tokio::main]
async fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    let mode = args.get(1).map(String::as_str).unwrap_or("queue");

    // Validation mode: scrape one novel's comments and print, no keys needed.
    if mode == "comments-dry" {
        let url = args.get(2).ok_or_else(|| anyhow!("usage: comments-dry <novel-url>"))?;
        let http = asterion_scraper::http::HttpClient::new()?;
        let page = http.get_text(url).await?;
        let post_id = asterion_scraper::comments::extract_post_id(&page)
            .ok_or_else(|| anyhow!("no post_id on page"))?;
        println!("post_id = {post_id}");
        let comments = asterion_scraper::comments::scrape_comments(&http, &post_id).await?;
        for c in &comments {
            println!(
                "  [{}] {} ({}): {}",
                c.source_id,
                c.author.as_deref().unwrap_or("?"),
                c.posted_at.as_deref().unwrap_or("?"),
                c.body.chars().take(80).collect::<String>(),
            );
        }
        println!("\n{} comments", comments.len());
        return Ok(());
    }

    // Validation mode: scrape rankings and print, no Supabase/keys needed.
    if mode == "rankings-dry" {
        let entries = asterion_scraper::webnoveldb::scrape_rankings().await?;
        let mut cat = String::new();
        for e in &entries {
            if e.category != cat {
                cat = e.category.clone();
                println!("\n== {cat} ==");
            }
            println!("  {:>2}. {}  [{}]", e.position, e.title, e.source_slug);
        }
        println!("\n{} entries across categories", entries.len());
        return Ok(());
    }

    let cfg = config()?;

    match mode {
        "novel" => {
            let url = args.get(2).ok_or_else(|| anyhow!("usage: novel <url>"))?;
            let out = process_novel(&cfg, url, false).await?;
            println!("✓ {} (#{}) — {} chapters", out.novel_title, out.novel_id, out.chapters_added);
        }
        "sync" => {
            let url = args.get(2).ok_or_else(|| anyhow!("usage: sync <url>"))?;
            let out = process_novel(&cfg, url, true).await?;
            println!("✓ {} (#{}) — {} new chapters", out.novel_title, out.novel_id, out.chapters_added);
        }
        "queue" => run_queue(&cfg).await?,
        "rankings" => {
            let (total, matched) = refresh_rankings(&cfg).await?;
            println!("✓ {total} ranking entries stored ({matched} matched our catalog)");
        }
        "enrich" => {
            let url = args.get(2).ok_or_else(|| anyhow!("usage: enrich <url>"))?;
            let title = enrich_novel(&cfg, url).await?;
            println!("✓ enriched {title}");
        }
        "catalog" => {
            let limit: usize = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(usize::MAX);
            let offset: usize = args.get(3).and_then(|s| s.parse().ok()).unwrap_or(0);
            run_catalog(cfg, limit, offset, false).await?;
        }
        "enrich-catalog" => {
            // Metadata/covers only across the catalog — cheap (1 request/novel).
            let limit: usize = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(usize::MAX);
            let offset: usize = args.get(3).and_then(|s| s.parse().ok()).unwrap_or(0);
            run_catalog(cfg, limit, offset, true).await?;
        }
        other => return Err(anyhow!("unknown mode '{other}'")),
    }
    Ok(())
}

/// Drain the desktop-user scrape request queue.
async fn run_queue(cfg: &RunConfig) -> Result<()> {
    let requests = cfg.supabase.pending_requests(50).await?;
    if requests.is_empty() {
        println!("queue empty");
        return Ok(());
    }
    println!("processing {} request(s)", requests.len());
    for req in requests {
        cfg.supabase.mark_request(req.id, "processing").await.ok();
        match process_novel(cfg, &req.novel_url, true).await {
            Ok(out) => {
                println!("✓ {} — {} chapters", out.novel_title, out.chapters_added);
                cfg.supabase.mark_request(req.id, "done").await.ok();
            }
            Err(e) => {
                eprintln!("✗ {} — {e}", req.novel_url);
                cfg.supabase.mark_request(req.id, "error").await.ok();
            }
        }
    }
    Ok(())
}

/// Backfill the whole catalog (or a slice). Novels run with low concurrency to
/// stay polite; each novel already fans out across its chapters internally.
async fn run_catalog(cfg: RunConfig, limit: usize, offset: usize, enrich_only: bool) -> Result<()> {
    let path = std::env::var("CATALOG_FILE")
        .unwrap_or_else(|_| "../supabase/seed/novelfire-catalog.json".into());
    let raw = std::fs::read_to_string(&path).with_context(|| format!("read {path}"))?;
    let catalog: Catalog = serde_json::from_str(&raw).context("parse catalog")?;

    let urls: Vec<String> = catalog
        .novels
        .into_iter()
        .map(|n| n.url)
        .skip(offset)
        .take(limit)
        .collect();
    let verb = if enrich_only { "enriching" } else { "backfilling" };
    println!("{verb} {} novels (offset {offset})", urls.len());

    let novel_concurrency: usize = std::env::var("NOVEL_CONCURRENCY")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(if enrich_only { 4 } else { 2 });

    let cfg = Arc::new(cfg);
    stream::iter(urls)
        .map(|url| {
            let cfg = cfg.clone();
            async move {
                if enrich_only {
                    match enrich_novel(&cfg, &url).await {
                        Ok(title) => println!("✓ {title}"),
                        Err(e) => eprintln!("✗ {url} — {e}"),
                    }
                } else {
                    match process_novel(&cfg, &url, true).await {
                        Ok(out) => println!("✓ {} — {} chapters", out.novel_title, out.chapters_added),
                        Err(e) => eprintln!("✗ {url} — {e}"),
                    }
                }
            }
        })
        .buffer_unordered(novel_concurrency)
        .collect::<Vec<_>>()
        .await;

    Ok(())
}
