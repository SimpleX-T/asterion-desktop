//! Minimal Google Cloud Storage uploader.
//!
//! Auth strategy (no heavy SDK):
//!   1. On a GCP VM, fetch an OAuth token from the instance metadata server
//!      (the attached service account needs `roles/storage.objectAdmin`).
//!   2. For local dev, set `GCS_ACCESS_TOKEN` (e.g. `gcloud auth print-access-token`).
//!
//! Objects are written with a simple media upload to the JSON API.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Deserialize;

use crate::types::ScrapeError;

const METADATA_TOKEN_URL: &str = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";

pub struct GcsClient {
    http: reqwest::Client,
    bucket: String,
    // Cached access token + expiry (metadata tokens last ~1h).
    token: Mutex<Option<(String, Instant)>>,
    static_token: Option<String>,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: u64,
}

impl GcsClient {
    pub fn new(bucket: impl Into<String>) -> Self {
        Self {
            http: reqwest::Client::new(),
            bucket: bucket.into(),
            token: Mutex::new(None),
            static_token: std::env::var("GCS_ACCESS_TOKEN").ok(),
        }
    }

    async fn access_token(&self) -> Result<String, ScrapeError> {
        if let Some(t) = &self.static_token {
            return Ok(t.clone());
        }
        // Return cached token if still valid (60s safety margin).
        {
            let guard = self.token.lock().unwrap();
            if let Some((tok, exp)) = guard.as_ref() {
                if *exp > Instant::now() + Duration::from_secs(60) {
                    return Ok(tok.clone());
                }
            }
        }

        let resp = self
            .http
            .get(METADATA_TOKEN_URL)
            .header("Metadata-Flavor", "Google")
            .send()
            .await
            .map_err(|e| ScrapeError::Storage(format!("metadata token: {e}")))?;
        if !resp.status().is_success() {
            return Err(ScrapeError::Storage(format!(
                "metadata token status {}",
                resp.status()
            )));
        }
        let tr: TokenResponse = resp
            .json()
            .await
            .map_err(|e| ScrapeError::Storage(format!("token decode: {e}")))?;

        let exp = Instant::now() + Duration::from_secs(tr.expires_in);
        *self.token.lock().unwrap() = Some((tr.access_token.clone(), exp));
        Ok(tr.access_token)
    }

    /// Upload `body` to `object_path` as text/plain. Returns the object path.
    pub async fn upload_text(
        &self,
        object_path: &str,
        body: String,
    ) -> Result<String, ScrapeError> {
        let token = self.access_token().await?;
        let url = format!(
            "https://storage.googleapis.com/upload/storage/v1/b/{}/o?uploadType=media&name={}",
            self.bucket,
            urlencoding::encode(object_path),
        );
        let resp = self
            .http
            .post(&url)
            .bearer_auth(token)
            .header("Content-Type", "text/plain; charset=utf-8")
            .body(body)
            .send()
            .await
            .map_err(|e| ScrapeError::Storage(e.to_string()))?;
        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(ScrapeError::Storage(format!("upload {status}: {text}")));
        }
        Ok(object_path.to_string())
    }
}
