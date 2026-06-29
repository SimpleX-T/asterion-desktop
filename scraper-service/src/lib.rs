//! Asterion scraper service library.
//!
//! Centralized novelfire scraper meant to run on a GCP VM. It scrapes a novel's
//! metadata + chapters, writes the bulk chapter TEXT to Google Cloud Storage,
//! and upserts lightweight metadata + a chapter index to Supabase. The desktop
//! reader then streams chapter text from GCS and reads metadata from Supabase.

pub mod comments;
pub mod extract;
pub mod gcs;
pub mod http;
pub mod pipeline;
pub mod supabase;
pub mod types;
pub mod webnoveldb;

pub use pipeline::{enrich_novel, process_novel, refresh_rankings, ProcessOutcome, RunConfig};
pub use types::{ScrapeError, ScrapedChapter, ScrapedNovel};
