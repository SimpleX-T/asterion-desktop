# Asterion Scraper Service

Centralized novelfire scraper that runs on a **GCP Compute Engine VM**. It writes
bulk chapter **text → Google Cloud Storage** and **metadata + chapter index →
Supabase** (service-role key). The desktop app never scrapes.

```
catalog-runner queue            drain user scrape_requests (cron this)
catalog-runner novel <url>      scrape one novel (full)
catalog-runner sync <url>       scrape only new chapters for one novel
catalog-runner catalog [N] [O]  backfill from the vendored catalog (limit N, offset O)
```

## How it works
- `http.rs` — anti-bot client (rotating UAs, cookie jar, retry/backoff, stagger).
- `extract.rs` — novelfire selectors + promo/metadata-line filter.
- `gcs.rs` — uploads chapter text to GCS (`novels/<slug>/chapter-<n>.txt`).
- `supabase.rs` — upserts `novels` + `chapters` index (service-role key).
- `pipeline.rs` / `main.rs` — orchestration + the runner modes.

## GCP setup (uses your $500 credit)

```bash
# 1. Storage bucket for chapter text (public-read so the reader can fetch it)
gcloud storage buckets create gs://asterion-novels --location=US --uniform-bucket-level-access
gcloud storage buckets add-iam-policy-binding gs://asterion-novels \
  --member=allUsers --role=roles/storage.objectViewer

# 2. Service account for the VM (write to GCS)
gcloud iam service-accounts create asterion-scraper
gcloud projects add-iam-policy-binding $PROJECT \
  --member="serviceAccount:asterion-scraper@$PROJECT.iam.gserviceaccount.com" \
  --role=roles/storage.objectAdmin

# 3. VM (small is fine — work is I/O bound) with that SA attached
gcloud compute instances create asterion-scraper \
  --machine-type=e2-small --image-family=debian-12 --image-project=debian-cloud \
  --service-account=asterion-scraper@$PROJECT.iam.gserviceaccount.com \
  --scopes=https://www.googleapis.com/auth/devstorage.read_write
```

On the VM: install Rust (`rustup`), `git clone`, then `cargo build --release` in
`scraper-service/`.

## Run

```bash
export SUPABASE_URL=https://<ref>.supabase.co
export SUPABASE_SERVICE_KEY=<service-role-key>   # VM-only secret
export GCS_BUCKET=asterion-novels
# GCS auth comes from the attached service account automatically.
# Locally instead: export GCS_ACCESS_TOKEN=$(gcloud auth print-access-token)

./target/release/catalog-runner novel https://novelfire.net/book/shadow-slave
./target/release/catalog-runner catalog 100 0     # backfill first 100
```

### Schedule the request queue (systemd timer or cron)
```cron
*/5 * * * * SUPABASE_URL=… SUPABASE_SERVICE_KEY=… GCS_BUCKET=asterion-novels \
  /opt/asterion/scraper-service/target/release/catalog-runner queue >> /var/log/asterion.log 2>&1
```

## Operational notes
- **IP bans:** mass-scraping from one VM IP will eventually get rate-limited.
  Keep `NOVEL_CONCURRENCY` low (default 2), run incrementally, and consider a
  proxy pool for full-catalog backfills.
- **Egress:** serving chapter text to readers is GCS egress (~$0.12/GB). Tiny per
  chapter; add Cloud CDN if reads scale.
- The `SUPABASE_SERVICE_KEY` lives only here, never in the desktop app.
