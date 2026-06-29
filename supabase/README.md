# Supabase backend

Metadata + auth + per-user reading data. Bulk chapter **text lives in GCS**, not here.

## Schema
- `0001_content.sql` — `novels` (metadata) + `chapters` (INDEX only: number, title,
  url, **content_path** → GCS object). Search index + `updated_at` triggers.
- `0002_user_data.sql` — `reading_progress`, `library`, `bookmarks`, `user_preferences`.
- `0003_rls.sql` — content world-readable; user data private to `auth.uid()`.
- `0004_scrape_requests.sql` — queue the VM runner drains for user-requested novels.

Writes to `novels`/`chapters` are done by the VM `scraper-service` with the
**service-role key** — never from the client.

## One-time setup
```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push

# Enable anonymous sign-ins (Dashboard > Authentication > Providers > Anonymous)
# or rely on config.toml locally.

# Seed the browseable catalog (16k novels, metadata only)
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
node seed/seed-catalog.mjs
```

## Client env
Copy `../.env.example` → `../.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
and `VITE_GCS_BUCKET`. The service_role key goes only on the VM (see
`../scraper-service/README.md`).
