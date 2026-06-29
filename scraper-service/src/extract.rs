//! HTML extraction ported from asterion-scraper (scraper.ts +
//! utils/novel-details-extractor.ts) and the promo-line filter from
//! asterion-ios ReaderView.swift::shouldFilterMetadataLine.

use once_cell::sync::Lazy;
use regex::Regex;
use scraper::{Html, Selector};
use url::Url;

use crate::types::{ScrapeError, ScrapedNovel};

fn sel(s: &str) -> Selector {
    Selector::parse(s).expect("static selector should parse")
}

// Novel page selectors (scraper.ts extractNovelDetails).
static NOVEL_TITLE: Lazy<Selector> = Lazy::new(|| sel("h1.novel-title"));
static AUTHOR: Lazy<Selector> = Lazy::new(|| sel(".author a span[itemprop=\"author\"]"));
static RANK: Lazy<Selector> = Lazy::new(|| sel(".rank strong"));
static STAT_SPANS: Lazy<Selector> = Lazy::new(|| sel(".header-stats span"));
static STAT_STRONG: Lazy<Selector> = Lazy::new(|| sel("strong"));
static GENRES: Lazy<Selector> = Lazy::new(|| sel(".categories ul a"));
static CHAPTERS_LATEST: Lazy<Selector> = Lazy::new(|| sel("a.chapter-latest-container"));
static COVER_IMG: Lazy<Selector> = Lazy::new(|| sel("figure.cover img"));

// Summary fallbacks (novel-details-extractor.ts).
static SUMMARY_SELECTORS: &[&str] = &[
    ".summary .introduce .inner",
    ".content.expand-wrapper",
    ".summary",
    ".content",
];
// Rating fallbacks (novel-details-extractor.ts).
static RATING_SELECTORS: &[&str] = &[
    "strong.nub",
    ".rating .value",
    "[class*=\"rating\"] strong",
    ".score",
    ".rating-value",
];

// Chapter page selectors (scraper.ts scrapeChapterContent).
static CHAPTER_TITLE: Lazy<Selector> = Lazy::new(|| sel("h1 span.chapter-title"));
static CONTENT: Lazy<Selector> = Lazy::new(|| sel("#content"));
static CONTENT_P: Lazy<Selector> = Lazy::new(|| sel("p"));
static META_DESC: Lazy<Selector> = Lazy::new(|| sel("meta[name=\"description\"]"));

fn text_of(el: scraper::ElementRef) -> String {
    el.text().collect::<String>().trim().to_string()
}

fn first_text(doc: &Html, selector: &Selector) -> Option<String> {
    doc.select(selector)
        .next()
        .map(text_of)
        .filter(|s| !s.is_empty())
}

/// Extract novel metadata from a `/book/<slug>` page.
pub fn extract_novel_details(html: &str, novel_url: &str) -> Result<ScrapedNovel, ScrapeError> {
    let doc = Html::parse_document(html);

    let title = first_text(&doc, &NOVEL_TITLE)
        .ok_or_else(|| ScrapeError::Parse("novel title (h1.novel-title)".into()))?;

    let author = first_text(&doc, &AUTHOR);

    let rank = first_text(&doc, &RANK).map(|t| t.replace("RANK ", "").trim().to_string());

    // header-stats: 1=chapters, 2=views, 3=bookmarks, 4=status (nth-child order).
    let stats: Vec<String> = doc
        .select(&STAT_SPANS)
        .map(|span| {
            span.select(&STAT_STRONG)
                .next()
                .map(text_of)
                .unwrap_or_default()
        })
        .collect();
    let stat = |i: usize| stats.get(i).cloned().filter(|s| !s.is_empty());

    let genres: Vec<String> = doc
        .select(&GENRES)
        .map(text_of)
        .filter(|s| !s.is_empty())
        .collect();

    let summary = extract_summary(&doc);
    let rating = extract_rating(&doc);

    let chapters_url = doc
        .select(&CHAPTERS_LATEST)
        .next()
        .and_then(|a| a.value().attr("href"))
        .map(|s| s.to_string());

    let image_url = doc.select(&COVER_IMG).next().and_then(|img| {
        img.value()
            .attr("src")
            .or_else(|| img.value().attr("data-src"))
            .map(|s| s.to_string())
    });
    let image_url = image_url.map(|src| absolutize(&src, novel_url));

    Ok(ScrapedNovel {
        title,
        novel_url: novel_url.to_string(),
        author,
        rank,
        total_chapters: stat(0),
        views: stat(1),
        bookmarks: stat(2),
        status: stat(3),
        genres,
        summary,
        chapters_url,
        image_url,
        rating,
    })
}

fn extract_summary(doc: &Html) -> Option<String> {
    for s in SUMMARY_SELECTORS {
        if let Ok(selector) = Selector::parse(s) {
            if let Some(t) = first_text(doc, &selector) {
                return Some(t);
            }
        }
    }
    // meta[name=description] last resort.
    doc.select(&META_DESC)
        .next()
        .and_then(|m| m.value().attr("content"))
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

static RATING_NUM: Lazy<Regex> = Lazy::new(|| Regex::new(r"[-+]?\d*\.?\d+").unwrap());

fn parse_rating(text: &str) -> Option<f64> {
    let m = RATING_NUM.find(text.trim())?;
    let v: f64 = m.as_str().parse().ok()?;
    if (0.0..=10.0).contains(&v) {
        Some(v)
    } else {
        None
    }
}

fn extract_rating(doc: &Html) -> Option<f64> {
    for s in RATING_SELECTORS {
        if let Ok(selector) = Selector::parse(s) {
            if let Some(t) = first_text(doc, &selector) {
                if let Some(r) = parse_rating(&t) {
                    return Some(r);
                }
            }
        }
    }
    None
}

fn absolutize(src: &str, base: &str) -> String {
    if src.starts_with("http") {
        return src.to_string();
    }
    Url::parse(base)
        .ok()
        .and_then(|b| b.join(src).ok())
        .map(|u| u.to_string())
        .unwrap_or_else(|| src.to_string())
}

/// Extract a chapter's title and cleaned plain-text body from a chapter page.
/// Returns (title, content). Content has promo/metadata lines removed and
/// paragraphs joined by blank lines (so the reader can split on "\n").
pub fn extract_chapter(html: &str) -> (String, String) {
    let doc = Html::parse_document(html);

    let title = first_text(&doc, &CHAPTER_TITLE).unwrap_or_default();

    let content = match doc.select(&CONTENT).next() {
        Some(content_el) => {
            let paras: Vec<String> = content_el
                .select(&CONTENT_P)
                .map(text_of)
                .map(|p| collapse_ws(&p))
                .filter(|p| !p.is_empty())
                .filter(|p| !should_filter_line(p, &title))
                .collect();

            if !paras.is_empty() {
                paras.join("\n")
            } else {
                // No <p> children: fall back to the element's raw text.
                content_el
                    .text()
                    .collect::<String>()
                    .lines()
                    .map(|l| collapse_ws(l.trim()))
                    .filter(|l| !l.is_empty())
                    .filter(|l| !should_filter_line(l, &title))
                    .collect::<Vec<_>>()
                    .join("\n")
            }
        }
        None => String::new(),
    };

    (title, content)
}

static WS: Lazy<Regex> = Lazy::new(|| Regex::new(r"\s+").unwrap());

fn collapse_ws(s: &str) -> String {
    WS.replace_all(s.trim(), " ").to_string()
}

static CHAPTER_HEADING_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)^chapter\s*\d+(\s*[:\-].*)?$").unwrap());

/// Port of ReaderView.swift::shouldFilterMetadataLine — strips translator notes,
/// social/promo plugs, source URLs, and duplicate chapter headings.
pub fn should_filter_line(line: &str, chapter_title: &str) -> bool {
    let lowered = line.to_lowercase();
    let compact = lowered.replace(' ', "");

    let has_promo = [
        "discord", "patreon", "ko-fi", "kofi", "buymeacoffee", "buy me a coffee", "telegram",
        "facebook", "twitter", "x.com", "instagram",
    ]
    .iter()
    .any(|k| lowered.contains(k));

    let looks_like_url = [
        "http://", "https://", "www.", ".com", ".net", ".org", "read at ", "read on ",
        "published on ",
    ]
    .iter()
    .any(|k| lowered.contains(k));

    let prefixes = [
        "translator:", "editor:", "edited by", "proofreader:", "raw provider:", "source:",
        "author note:", "a/n:", "note:", "tl:", "t/l:", "edit:", "credits:",
    ];
    if prefixes.iter().any(|p| lowered.starts_with(p)) {
        return true;
    }

    if has_promo || looks_like_url {
        return true;
    }

    if compact == "atlasstudios" || compact.contains("atlasstudioseditor") {
        return true;
    }

    if !chapter_title.is_empty() && lowered == chapter_title.to_lowercase() {
        return true;
    }

    if CHAPTER_HEADING_RE.is_match(&lowered) {
        return true;
    }

    false
}
