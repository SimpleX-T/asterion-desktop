import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { usePreferences } from "@/hooks/usePreferences";
import { useScrapeProgress } from "@/lib/queries";
import { getContinue } from "@/lib/reader";
import { APP_THEMES, useAppTheme } from "@/providers/ThemeProvider";
import type { ReaderTheme } from "@/lib/types";

const THEMES: ReaderTheme[] = ["dark", "sepia", "warm", "light"];

export function Profile() {
  const { prefs, update } = usePreferences();
  const { theme: appTheme, setTheme: setAppTheme } = useAppTheme();
  const cont = getContinue();

  return (
    <div>
      <PageHeader
        eyebrow="PROFILE"
        title="Reading"
        subtitle="Your progress and reading preferences."
      />
      <div className="grid max-w-3xl gap-8 px-10 py-8">
        <CatalogStatus />

        <section>
          <h2 className="mb-3 font-mono text-[10px] tracking-label text-asterion-muted">
            CONTINUE READING
          </h2>
          {cont ? (
            <Link
              to={`/read/${cont.novelId}/${cont.chapterId}`}
              className="flex items-center justify-between rounded-xl border border-asterion-border bg-asterion-card p-5 hover:border-gold/40"
            >
              <div>
                <div className="font-serif text-asterion-text">{cont.chapterTitle}</div>
                <div className="mt-1 text-xs text-asterion-muted">
                  {Math.round(cont.progress * 100)}% · chapter {cont.chapterNumber}
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-gold" />
            </Link>
          ) : (
            <p className="text-sm text-asterion-muted">Nothing in progress yet.</p>
          )}
        </section>

        <section>
          <h2 className="mb-3 font-mono text-[10px] tracking-label text-asterion-muted">
            APP THEME
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {APP_THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => setAppTheme(t.id)}
                data-app-theme={t.id === "midnight" ? undefined : t.id}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  appTheme === t.id ? "border-gold" : "border-asterion-border"
                }`}
                style={{ background: "rgb(var(--app-bg))" }}
              >
                <div className="mb-2 flex gap-1">
                  <span className="h-4 w-4 rounded-full" style={{ background: "rgb(var(--app-accent))" }} />
                  <span className="h-4 w-4 rounded-full" style={{ background: "rgb(var(--app-card))" }} />
                  <span className="h-4 w-4 rounded-full" style={{ background: "rgb(var(--app-text))" }} />
                </div>
                <span className="text-xs" style={{ color: "rgb(var(--app-text))" }}>
                  {t.label}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 font-mono text-[10px] tracking-label text-asterion-muted">
            READING PREFERENCES
          </h2>
          <div className="space-y-4 rounded-xl border border-asterion-border bg-asterion-card p-5">
            <Row label="Default theme">
              <div className="flex gap-2">
                {THEMES.map((t) => (
                  <button
                    key={t}
                    onClick={() => update({ theme: t })}
                    className={`rounded-md px-2.5 py-1 text-xs capitalize ${
                      prefs.theme === t
                        ? "bg-gold/20 text-gold"
                        : "text-asterion-muted hover:text-asterion-text"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </Row>
            <Row label={`Font size · ${prefs.font_size}px`}>
              <input
                type="range"
                min={14}
                max={28}
                value={prefs.font_size}
                onChange={(e) => update({ font_size: Number(e.target.value) })}
                className="w-40 accent-gold"
              />
            </Row>
            <Row label="Font family">
              <div className="flex gap-2">
                {(["serif", "sans"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => update({ font_family: f })}
                    className={`rounded-md px-2.5 py-1 text-xs capitalize ${
                      prefs.font_family === f
                        ? "bg-gold/20 text-gold"
                        : "text-asterion-muted hover:text-asterion-text"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </Row>
            <Row label={`Line spacing · ${(1 + prefs.line_spacing).toFixed(2)}`}>
              <input
                type="range"
                min={0.4}
                max={1.4}
                step={0.05}
                value={prefs.line_spacing}
                onChange={(e) => update({ line_spacing: Number(e.target.value) })}
                className="w-40 accent-gold"
              />
            </Row>
            <Row label={`Content width · ${prefs.max_width}px`}>
              <input
                type="range"
                min={560}
                max={1040}
                step={20}
                value={prefs.max_width}
                onChange={(e) => update({ max_width: Number(e.target.value) })}
                className="w-40 accent-gold"
              />
            </Row>
          </div>
        </section>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-asterion-text">{label}</span>
      {children}
    </div>
  );
}

function CatalogStatus() {
  const { data: p, isLoading, isError } = useScrapeProgress();
  if (isLoading || isError || !p) return null; // hidden until the view exists

  const fmt = (n: number) => n.toLocaleString();
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 font-mono text-[10px] tracking-label text-asterion-muted">
        CATALOG STATUS
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-gold" title="live" />
      </h2>
      <div className="space-y-4 rounded-xl border border-asterion-border bg-asterion-card p-5">
        <Bar label="Details + covers" value={p.novels_enriched} total={p.novels_total} />
        <Bar label="Chapters scraped" value={p.novels_with_chapters} total={p.novels_total} />
        <Bar label="Comments scraped" value={p.novels_with_comments} total={p.novels_total} />
        <div className="grid grid-cols-2 gap-3 border-t border-asterion-border pt-4 sm:grid-cols-4">
          <Stat label="Novels" value={fmt(p.novels_total)} />
          <Stat label="Chapters" value={fmt(p.chapters_total)} />
          <Stat label="Comments" value={fmt(p.comments_total)} />
          <Stat label="Queue" value={`${fmt(p.queue_pending)}${p.queue_processing ? ` +${p.queue_processing}` : ""}`} />
        </div>
      </div>
    </section>
  );
}

function Bar({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="text-asterion-text">{label}</span>
        <span className="font-mono text-asterion-muted">
          {value.toLocaleString()} / {total.toLocaleString()} · {pct}%
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-asterion-cardHover">
        <div className="h-full rounded-full bg-gold transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-wider text-asterion-dim">{label}</div>
      <div className="mt-0.5 font-serif text-lg text-asterion-text">{value}</div>
    </div>
  );
}
