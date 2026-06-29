//! Scrape ranking lists from webnoveldb.com (a WordPress "lightnovel" theme
//! aggregator). Every list is rendered inline on the homepage — Trending,
//! Popular Today (daily), Editor's Choice, and the Popular weekly/monthly/
//! all-time tabs (toggled by CSS, so all present in the HTML). One GET, parse
//! six widgets. Each ranked title links to /novel/{slug}/; we match those to
//! our novelfire catalog by title downstream.

use std::collections::HashMap;

use scraper::{ElementRef, Html, Selector};

use crate::http::HttpClient;
use crate::types::ScrapeError;

const HOME: &str = "https://webnoveldb.com/";

/// (category key, container CSS selector) for each ranking widget.
const CATEGORIES: [(&str, &str); 6] = [
    ("trending", ".trendarea"),
    ("daily", ".homehot .hotstack"),
    ("editors_choice", ".slidtop .sliderarea .loop"),
    ("weekly", ".wpop-weekly"),
    ("monthly", ".wpop-monthly"),
    ("alltime", ".wpop-alltime"),
];

#[derive(Debug, Clone)]
pub struct RankingEntry {
    pub category: String,
    pub position: i32,
    pub source_slug: String,
    pub source_url: String,
    pub title: String,
    pub cover_url: Option<String>,
}

pub async fn scrape_rankings() -> Result<Vec<RankingEntry>, ScrapeError> {
    let http = HttpClient::new()?;
    let html = http.get_text(HOME).await?;
    Ok(parse_rankings(&html))
}

pub fn parse_rankings(html: &str) -> Vec<RankingEntry> {
    let doc = Html::parse_document(html);
    let mut out = Vec::new();
    for (category, sel) in CATEGORIES {
        let Ok(container_sel) = Selector::parse(sel) else { continue };
        if let Some(container) = doc.select(&container_sel).next() {
            out.extend(parse_container(category, container));
        }
    }
    out
}

/// Parse one widget: walk every /novel/ anchor in document order, dedupe by
/// slug (each title appears as both a thumbnail link and a title link), and
/// pull title + cover. Position is the 1-based order of first appearance.
fn parse_container(category: &str, container: ElementRef) -> Vec<RankingEntry> {
    let a_sel = Selector::parse(r#"a[href*="/novel/"]"#).unwrap();
    let img_sel = Selector::parse("img").unwrap();

    let mut order: Vec<String> = Vec::new();
    let mut map: HashMap<String, RankingEntry> = HashMap::new();

    for a in container.select(&a_sel) {
        let Some(slug) = a.value().attr("href").and_then(slug_from_href) else { continue };
        let entry = map.entry(slug.clone()).or_insert_with(|| {
            order.push(slug.clone());
            RankingEntry {
                category: category.to_string(),
                position: 0,
                source_url: format!("https://webnoveldb.com/novel/{slug}/"),
                source_slug: slug.clone(),
                title: String::new(),
                cover_url: None,
            }
        });

        // Prefer the cover img's title/alt — it's the clean novel title on
        // every widget. Anchor text is a last resort (it can be the status
        // badge "Ongoing" or a "Ch. N" label wrapped inside the thumb link).
        if let Some(img) = a.select(&img_sel).next() {
            if entry.cover_url.is_none() {
                entry.cover_url = img_src(img);
            }
            if entry.title.is_empty() {
                if let Some(t) = img.value().attr("title").or_else(|| img.value().attr("alt")) {
                    entry.title = clean(t);
                }
            }
        }
        if entry.title.is_empty() {
            let txt = clean(&a.text().collect::<String>());
            if !txt.is_empty() && !is_status(&txt) {
                entry.title = txt;
            }
        }
    }

    order
        .into_iter()
        .filter_map(|slug| map.remove(&slug))
        .filter(|e| !e.title.is_empty())
        .enumerate()
        .map(|(i, mut e)| {
            e.position = (i + 1) as i32;
            e
        })
        .collect()
}

fn slug_from_href(href: &str) -> Option<String> {
    let rest = href.split("/novel/").nth(1)?;
    let slug = rest.split('/').next()?.trim();
    (!slug.is_empty()).then(|| slug.to_string())
}

/// Covers are lazy-loaded: the real URL is in data-lazy-src, `src` is a
/// placeholder data: URI until JS swaps it.
fn img_src(img: ElementRef) -> Option<String> {
    let v = img.value();
    for attr in ["data-lazy-src", "data-src", "src"] {
        if let Some(u) = v.attr(attr) {
            if u.starts_with("http") {
                return Some(u.to_string());
            }
        }
    }
    None
}

fn clean(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Anchor text that's actually a status badge or chapter label, not a title.
fn is_status(s: &str) -> bool {
    let l = s.to_ascii_lowercase();
    l == "ongoing" || l == "completed" || l == "hiatus" || l.starts_with("ch.") || l.starts_with("chapter ")
}
