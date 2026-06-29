#!/usr/bin/env node
// Seed the `novels` table with the novelfire catalog (title + url + chapter count).
// This gives a browseable Discover/Add index before any chapters are scraped.
// Genres/summary/rating stay null until a novel is actually scraped.
//
// Usage:
//   SUPABASE_URL=https://xxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//   node supabase/seed/seed-catalog.mjs
//
// The service_role key is used ONLY here (local, by the maintainer) — never shipped.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

const catalog = JSON.parse(
  readFileSync(join(__dirname, "novelfire-catalog.json"), "utf8"),
);
const novels = catalog.novels ?? [];
console.log(`Seeding ${novels.length} novels from catalog (scrapedAt ${catalog.scrapedAt})…`);

const rows = novels
  .filter((n) => n.title && n.url)
  .map((n) => ({
    title: n.title,
    novel_url: n.url,
    total_chapters: n.chapters ?? null, // e.g. "46 Chapters"
    genres: [],
  }));

// The catalog contains duplicate novel_urls; a single upsert batch cannot touch
// the same conflict key twice ("cannot affect row a second time"). Dedupe first.
const seen = new Set();
const deduped = rows.filter((r) => {
  if (seen.has(r.novel_url)) return false;
  seen.add(r.novel_url);
  return true;
});
console.log(`  ${rows.length - deduped.length} duplicate URLs removed → ${deduped.length} unique`);

const BATCH = 500;
let done = 0;
for (let i = 0; i < deduped.length; i += BATCH) {
  const slice = deduped.slice(i, i + BATCH);
  const { error } = await db
    .from("novels")
    .upsert(slice, { onConflict: "novel_url", ignoreDuplicates: false });
  if (error) {
    console.error(`Batch at ${i} failed:`, error.message);
    process.exit(1);
  }
  done += slice.length;
  process.stdout.write(`\r  upserted ${done}/${deduped.length}`);
}
console.log(`\nDone. Seeded ${done} novels.`);
