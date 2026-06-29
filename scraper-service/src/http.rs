//! HTTP layer ported from asterion-scraper/scraper.ts.
//! Reproduces the anti-bot behaviour: rotating browser User-Agents, a shared
//! cookie jar, request staggering, optional proxy, and retry/backoff on
//! 403 / 429 / 5xx responses.

use std::time::Duration;

use rand::seq::SliceRandom;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, ACCEPT_LANGUAGE, REFERER, USER_AGENT};
use tokio::sync::Mutex;
use tokio::time::{sleep, Instant};

use crate::types::ScrapeError;

// Mirrors scraper.ts constants.
const REQUEST_STAGGER_MS: u64 = 300;
const MAX_HTTP_ATTEMPTS: u32 = 4;

const BROWSER_USER_AGENTS: &[&str] = &[
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
];

pub struct HttpClient {
    client: reqwest::Client,
    // Serializes request start times so requests are staggered (next_slot).
    next_slot: Mutex<Option<Instant>>,
}

impl HttpClient {
    pub fn new() -> Result<Self, ScrapeError> {
        let mut headers = HeaderMap::new();
        headers.insert(
            ACCEPT,
            HeaderValue::from_static(
                "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            ),
        );
        headers.insert(ACCEPT_LANGUAGE, HeaderValue::from_static("en-US,en;q=0.9"));
        headers.insert(REFERER, HeaderValue::from_static("https://novelfire.net/"));

        let mut builder = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .cookie_store(true) // shared jar across requests, like scraper.ts cookieJar
            .gzip(true)
            .brotli(true)
            .deflate(true)
            .default_headers(headers);

        // Optional proxy, matching HTTPS_PROXY / PROXY_URL handling.
        if let Ok(proxy_url) = std::env::var("HTTPS_PROXY")
            .or_else(|_| std::env::var("https_proxy"))
            .or_else(|_| std::env::var("PROXY_URL"))
        {
            if let Ok(proxy) = reqwest::Proxy::all(&proxy_url) {
                builder = builder.proxy(proxy);
            }
        }

        let client = builder.build()?;
        Ok(Self {
            client,
            next_slot: Mutex::new(None),
        })
    }

    fn random_user_agent() -> &'static str {
        BROWSER_USER_AGENTS
            .choose(&mut rand::thread_rng())
            .copied()
            .unwrap_or(BROWSER_USER_AGENTS[0])
    }

    /// Wait until this request's staggered start slot, then advance the slot.
    async fn await_stagger(&self) {
        let mut guard = self.next_slot.lock().await;
        let now = Instant::now();
        let start = match *guard {
            Some(prev) if prev > now => prev,
            _ => now,
        };
        *guard = Some(start + Duration::from_millis(REQUEST_STAGGER_MS));
        drop(guard);
        if start > now {
            sleep(start - now).await;
        }
    }

    fn should_retry_status(status: u16) -> bool {
        status == 403 || status == 429 || status >= 500
    }

    /// GET a URL as text, retrying on transient/anti-bot statuses with backoff.
    pub async fn get_text(&self, url: &str) -> Result<String, ScrapeError> {
        self.get_inner(url, false).await
    }

    /// Same, but flagged as an XHR — novelfire's /comment/show returns JSON only
    /// when X-Requested-With: XMLHttpRequest is present (otherwise a full page).
    pub async fn get_text_xhr(&self, url: &str) -> Result<String, ScrapeError> {
        self.get_inner(url, true).await
    }

    async fn get_inner(&self, url: &str, xhr: bool) -> Result<String, ScrapeError> {
        let mut last_status: Option<u16> = None;

        for attempt in 1..=MAX_HTTP_ATTEMPTS {
            self.await_stagger().await;

            let mut req = self
                .client
                .get(url)
                .header(USER_AGENT, Self::random_user_agent());
            if xhr {
                req = req.header("X-Requested-With", HeaderValue::from_static("XMLHttpRequest"));
            }
            let resp = req.send().await;

            match resp {
                Ok(r) => {
                    let status = r.status().as_u16();
                    if r.status().is_success() {
                        return Ok(r.text().await?);
                    }
                    last_status = Some(status);
                    if !Self::should_retry_status(status) || attempt == MAX_HTTP_ATTEMPTS {
                        return Err(ScrapeError::Status(status, url.to_string()));
                    }
                }
                Err(e) => {
                    if attempt == MAX_HTTP_ATTEMPTS {
                        return Err(ScrapeError::Http(e));
                    }
                }
            }

            // Exponential-ish backoff with jitter (1s, 2s, 4s ...).
            let base = 1000u64 * (1u64 << (attempt - 1));
            let jitter = rand::random::<u64>() % 500;
            sleep(Duration::from_millis(base + jitter)).await;
        }

        Err(ScrapeError::Status(
            last_status.unwrap_or(0),
            url.to_string(),
        ))
    }
}
