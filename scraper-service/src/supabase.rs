//! Supabase writes from the trusted VM, using the service-role key (PostgREST).
//! This key lives only on the VM, never in the desktop client.

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::types::{ScrapeError, ScrapedChapter, ScrapedComment, ScrapedNovel};

pub struct SupabaseClient {
    http: reqwest::Client,
    base: String,       // https://<ref>.supabase.co
    service_key: String,
}

#[derive(Deserialize)]
struct NovelIdRow {
    id: i64,
}

#[derive(Debug, Deserialize)]
pub struct ScrapeRequest {
    pub id: i64,
    pub novel_url: String,
}

/// A ranking row to upsert (built by the pipeline from a scraped entry + match).
#[derive(Serialize)]
pub struct RankingRow {
    pub category: String,
    pub position: i32,
    pub source_slug: String,
    pub source_url: String,
    pub title: String,
    pub cover_url: Option<String>,
    pub novel_id: Option<i64>,
}

/// Chapter index row stored in Supabase — note: NO content (content lives in GCS).
#[derive(Serialize)]
struct ChapterIndexRow<'a> {
    novel_id: i64,
    chapter_number: i32,
    url: &'a str,
    title: &'a str,
    content_path: &'a str,
}

impl SupabaseClient {
    pub fn new(base: impl Into<String>, service_key: impl Into<String>) -> Self {
        Self {
            http: reqwest::Client::new(),
            base: base.into().trim_end_matches('/').to_string(),
            service_key: service_key.into(),
        }
    }

    fn req(&self, method: reqwest::Method, path: &str) -> reqwest::RequestBuilder {
        self.http
            .request(method, format!("{}/rest/v1/{path}", self.base))
            .header("apikey", &self.service_key)
            .bearer_auth(&self.service_key)
            .header("Content-Type", "application/json")
    }

    /// Upsert a novel by novel_url; returns its id.
    pub async fn upsert_novel(&self, novel: &ScrapedNovel) -> Result<i64, ScrapeError> {
        let body = json!([{
            "title": novel.title,
            "novel_url": novel.novel_url,
            "author": novel.author,
            "rank": novel.rank,
            "total_chapters": novel.total_chapters,
            "views": novel.views,
            "bookmarks": novel.bookmarks,
            "status": novel.status,
            "genres": novel.genres,
            "summary": novel.summary,
            "chapters_url": novel.chapters_url,
            "image_url": novel.image_url,
            "rating": novel.rating,
            "last_scraped": chrono_now(),
        }]);

        let resp = self
            .req(reqwest::Method::POST, "novels?on_conflict=novel_url")
            .header("Prefer", "resolution=merge-duplicates,return=representation")
            .body(body.to_string())
            .send()
            .await?;
        let rows: Vec<NovelIdRow> = decode(resp).await?;
        rows.into_iter()
            .next()
            .map(|r| r.id)
            .ok_or_else(|| ScrapeError::Supabase("no id returned for novel".into()))
    }

    /// Upsert a batch of chapter index rows (content_path points at GCS).
    pub async fn upsert_chapter_index(
        &self,
        novel_id: i64,
        chapters: &[(ScrapedChapter, String)], // (chapter, content_path)
    ) -> Result<(), ScrapeError> {
        if chapters.is_empty() {
            return Ok(());
        }
        let rows: Vec<ChapterIndexRow> = chapters
            .iter()
            .map(|(c, path)| ChapterIndexRow {
                novel_id,
                chapter_number: c.chapter_number,
                url: &c.url,
                title: &c.title,
                content_path: path,
            })
            .collect();

        let resp = self
            .req(
                reqwest::Method::POST,
                "chapters?on_conflict=novel_id,chapter_number",
            )
            .header("Prefer", "resolution=merge-duplicates,return=minimal")
            .body(serde_json::to_string(&rows).unwrap())
            .send()
            .await?;
        ensure_ok(resp).await
    }

    /// Highest chapter_number already stored for a novel (for incremental sync).
    pub async fn highest_chapter(&self, novel_id: i64) -> Result<i32, ScrapeError> {
        let resp = self
            .req(
                reqwest::Method::GET,
                &format!(
                    "chapters?novel_id=eq.{novel_id}&select=chapter_number&order=chapter_number.desc&limit=1"
                ),
            )
            .send()
            .await?;
        let rows: Vec<serde_json::Value> = decode(resp).await?;
        Ok(rows
            .first()
            .and_then(|r| r.get("chapter_number"))
            .and_then(|v| v.as_i64())
            .unwrap_or(0) as i32)
    }

    /// Pull pending scrape requests (desktop users requesting a novel).
    pub async fn pending_requests(&self, limit: u32) -> Result<Vec<ScrapeRequest>, ScrapeError> {
        let resp = self
            .req(
                reqwest::Method::GET,
                &format!(
                    "scrape_requests?status=eq.pending&select=id,novel_url&order=created_at.asc&limit={limit}"
                ),
            )
            .send()
            .await?;
        decode(resp).await
    }

    /// Case-insensitive exact title match against our catalog. Returns the
    /// novel id if we have it (so a ranking entry becomes openable).
    pub async fn find_novel_id_by_title(&self, title: &str) -> Result<Option<i64>, ScrapeError> {
        // PostgREST ilike treats `*` as the wildcard; a plain title is an exact
        // case-insensitive match. Encode the value (titles have spaces/commas).
        let value = urlencoding::encode(title);
        let resp = self
            .req(
                reqwest::Method::GET,
                &format!("novels?title=ilike.{value}&select=id&limit=1"),
            )
            .send()
            .await?;
        let rows: Vec<NovelIdRow> = decode(resp).await?;
        Ok(rows.into_iter().next().map(|r| r.id))
    }

    /// Replace all rows for a ranking category (delete then insert fresh).
    pub async fn replace_rankings(
        &self,
        category: &str,
        rows: &[RankingRow],
    ) -> Result<(), ScrapeError> {
        let del = self
            .req(
                reqwest::Method::DELETE,
                &format!("rankings?category=eq.{category}"),
            )
            .header("Prefer", "return=minimal")
            .send()
            .await?;
        ensure_ok(del).await?;

        if rows.is_empty() {
            return Ok(());
        }
        let resp = self
            .req(reqwest::Method::POST, "rankings")
            .header("Prefer", "return=minimal")
            .body(serde_json::to_string(rows).unwrap())
            .send()
            .await?;
        ensure_ok(resp).await
    }

    /// Upsert a novel's scraped comments (dedup on novel_id + source_id).
    pub async fn upsert_comments(
        &self,
        novel_id: i64,
        comments: &[ScrapedComment],
    ) -> Result<(), ScrapeError> {
        if comments.is_empty() {
            return Ok(());
        }
        let rows: Vec<_> = comments
            .iter()
            .map(|c| {
                json!({
                    "novel_id": novel_id,
                    "source_id": c.source_id,
                    "author": c.author,
                    "avatar_url": c.avatar_url,
                    "body": c.body,
                    "posted_at": c.posted_at,
                    "likes": c.likes,
                })
            })
            .collect();
        let resp = self
            .req(
                reqwest::Method::POST,
                "comments?on_conflict=novel_id,source_id",
            )
            .header("Prefer", "resolution=merge-duplicates,return=minimal")
            .body(serde_json::to_string(&rows).unwrap())
            .send()
            .await?;
        ensure_ok(resp).await
    }

    pub async fn mark_request(&self, id: i64, status: &str) -> Result<(), ScrapeError> {
        let resp = self
            .req(
                reqwest::Method::PATCH,
                &format!("scrape_requests?id=eq.{id}"),
            )
            .header("Prefer", "return=minimal")
            .body(json!({ "status": status, "processed_at": chrono_now() }).to_string())
            .send()
            .await?;
        ensure_ok(resp).await
    }
}

async fn decode<T: for<'de> Deserialize<'de>>(resp: reqwest::Response) -> Result<T, ScrapeError> {
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(ScrapeError::Supabase(format!("{status}: {text}")));
    }
    serde_json::from_str(&text).map_err(|e| ScrapeError::Supabase(format!("decode: {e} — {text}")))
}

async fn ensure_ok(resp: reqwest::Response) -> Result<(), ScrapeError> {
    let status = resp.status();
    if status.is_success() {
        Ok(())
    } else {
        let text = resp.text().await.unwrap_or_default();
        Err(ScrapeError::Supabase(format!("{status}: {text}")))
    }
}

fn chrono_now() -> String {
    chrono::Utc::now().to_rfc3339()
}
