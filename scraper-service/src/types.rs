use serde::{Deserialize, Serialize};

/// A scraped novel's metadata. snake_case matches the Supabase `novels` columns.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScrapedNovel {
    pub title: String,
    pub novel_url: String,
    pub author: Option<String>,
    pub rank: Option<String>,
    pub total_chapters: Option<String>,
    pub views: Option<String>,
    pub bookmarks: Option<String>,
    pub status: Option<String>,
    pub genres: Vec<String>,
    pub summary: Option<String>,
    pub chapters_url: Option<String>,
    pub image_url: Option<String>,
    pub rating: Option<f64>,
}

/// A scraped chapter with cleaned plain-text content (promo lines removed).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScrapedChapter {
    pub chapter_number: i32,
    pub url: String,
    pub title: String,
    pub content: String,
}

/// A scraped novel comment from novelfire (read-only; we display them).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScrapedComment {
    pub source_id: String, // novelfire's data-comid (stable, for dedup)
    pub author: Option<String>,
    pub avatar_url: Option<String>,
    pub body: String,
    pub posted_at: Option<String>, // relative label as shown ("12m", "3d")
    pub likes: i32,
}

#[derive(Debug, thiserror::Error)]
pub enum ScrapeError {
    #[error("http error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("page returned status {0} after retries for {1}")]
    Status(u16, String),
    #[error("could not parse required field: {0}")]
    Parse(String),
    #[error("storage error: {0}")]
    Storage(String),
    #[error("supabase error: {0}")]
    Supabase(String),
}
