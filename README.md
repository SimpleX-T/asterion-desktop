# Asterion — Desktop Novel Reader

A local-first **Linux desktop** reader for web novels, built with **Tauri 2 + React**.
Scrapes novels from novelfire.net (Rust scraper), stores them in **Supabase**, and
delivers an immersive reading experience ported from the Asterion iOS app.

No web3, no accounts to manage — per-device identity uses Supabase anonymous auth.

## Architecture (hybrid: GCP + Supabase)

```
Desktop app (Tauri + React)                  scraper-service (GCP VM, Rust)
  ├─ metadata/search ─► Supabase (anon)        ├─ scrape novelfire (reqwest+scraper)
  ├─ chapter text ────► GCS (public bucket)     ├─ chapter TEXT ─► Google Cloud Storage
  ├─ progress/library/prefs ─► Supabase (RLS)   └─ metadata+index ─► Supabase (service key)
  └─ "request novel" ─► Supabase queue ─────────────────▲ (VM drains the queue)
```

- **scraper-service/** — standalone Rust crate that runs on a GCP Compute Engine VM.
  Bulk chapter text (the TB) goes to **Google Cloud Storage**; lightweight metadata +
  a chapter index go to **Supabase**. The **service-role key lives only on the VM**.
  See `scraper-service/README.md`.
- **Desktop app is a pure reader** — it reads metadata from Supabase and chapter text
  from GCS, and queues `scrape_requests` for novels not yet scraped (no client-side
  scraping).
- **Reader** (`src/pages/Reader.tsx`) — port of `asterion-ios` `ReaderView.swift`:
  immersive auto-hiding controls, serif/sans + adjustable size (14–28) / spacing /
  width, dark·sepia·warm·light themes, per-paragraph progress + resume, keyboard nav
  (←/→ chapters, +/- font, Esc back), offline chapter cache, download-to-file.

## Prerequisites (Ubuntu/Debian)

```bash
sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

Node 20+, pnpm, and the Rust toolchain are also required.

## Setup

```bash
pnpm install

# 1. Supabase backend (see supabase/README.md)
supabase link --project-ref <ref>
supabase db push
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node supabase/seed/seed-catalog.mjs

# 2. GCP scraper + storage (see scraper-service/README.md)
#    create a GCS bucket + VM, run the catalog-runner to populate content

# 3. Client env
cp .env.example .env   # VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY + VITE_GCS_BUCKET
```

## Develop / build

```bash
pnpm tauri dev      # run the desktop app
pnpm tauri build    # produce .deb / .rpm / AppImage in src-tauri/target/release/bundle
pnpm build          # frontend-only type-check + build (no system deps needed)
```

## Status

- [x] Phase 0 — Tauri + Vite/React scaffold, theme tokens
- [x] Phase 1 — Supabase schema, RLS, `ingest-novel` function, catalog seed
- [x] Phase 2 — Rust scraper (extraction validated against live novelfire)
- [x] Phase 3 — Immersive Reader
- [x] Phase 4 — Discover / Library / NovelDetail / Ranking / Profile
- [ ] Phase 5 — Packaging polish (icons, desktop entry, AppImage QA)
