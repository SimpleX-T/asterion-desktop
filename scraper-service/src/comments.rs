//! Scrape novelfire novel comments via the site's lazy-loaded `/comment/show`
//! JSON endpoint. Read-only — we surface them in the desktop reader. The novel
//! page exposes a numeric `post_id` in an inline script; the endpoint returns
//! `{ html, next_cursor, has_more_pages }`, where `html` is the rendered list.

use once_cell::sync::Lazy;
use regex::Regex;
use scraper::{Html, Selector};
use serde::Deserialize;

use crate::http::HttpClient;
use crate::types::{ScrapeError, ScrapedComment};

static POST_ID_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"post_id\s*=\s*'(\d+)'").unwrap());

#[derive(Deserialize)]
struct CommentResponse {
    html: String,
}

/// Pull the novelfire numeric post_id from a novel page's inline script.
pub fn extract_post_id(novel_page_html: &str) -> Option<String> {
    POST_ID_RE
        .captures(novel_page_html)
        .map(|c| c[1].to_string())
}

/// Fetch the first page of comments for a novel (newest first).
pub async fn scrape_comments(
    http: &HttpClient,
    post_id: &str,
) -> Result<Vec<ScrapedComment>, ScrapeError> {
    let url = format!("https://novelfire.net/comment/show?post_id={post_id}&order_by=newest");
    let body = http.get_text_xhr(&url).await?;
    let resp: CommentResponse =
        serde_json::from_str(&body).map_err(|e| ScrapeError::Parse(format!("comment json: {e}")))?;
    Ok(parse_comments(&resp.html))
}

pub fn parse_comments(html: &str) -> Vec<ScrapedComment> {
    let frag = Html::parse_fragment(html);
    let item_sel = Selector::parse(".comment-item").unwrap();
    let user_sel = Selector::parse(".username").unwrap();
    let avatar_sel = Selector::parse("img.avatar").unwrap();
    let text_sel = Selector::parse(".comment-text").unwrap();
    let date_sel = Selector::parse(".post-date").unwrap();

    let mut out = Vec::new();
    for item in frag.select(&item_sel) {
        let Some(source_id) = item.value().attr("data-comid") else { continue };
        // `.next()` on a descendant selector yields this item's own field first
        // (it precedes any nested reply items in document order).
        let body = item
            .select(&text_sel)
            .next()
            .map(|e| clean(&e.text().collect::<String>()))
            .unwrap_or_default();
        if body.is_empty() {
            continue;
        }
        out.push(ScrapedComment {
            source_id: source_id.to_string(),
            author: pick(item.select(&user_sel).next().map(text_of)),
            avatar_url: item
                .select(&avatar_sel)
                .next()
                .and_then(|e| e.value().attr("src"))
                .map(String::from),
            body,
            posted_at: pick(item.select(&date_sel).next().map(text_of)),
            likes: 0,
        });
    }
    out
}

fn text_of(e: scraper::ElementRef) -> String {
    clean(&e.text().collect::<String>())
}
fn pick(s: Option<String>) -> Option<String> {
    s.filter(|s| !s.is_empty())
}
fn clean(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}
