import { useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { useRankings } from "@/lib/queries";
import { cn } from "@/lib/utils";
import type { RankingItem } from "@/lib/types";

const TABS: { id: string; label: string }[] = [
  { id: "trending", label: "Trending" },
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "alltime", label: "All-time" },
  { id: "editors_choice", label: "Editor's Choice" },
];

export function Ranking() {
  const [tab, setTab] = useState("trending");
  const { data: items = [], isLoading } = useRankings(tab);

  return (
    <div>
      <PageHeader eyebrow="RANKING" title="Rankings" subtitle="Live charts from webnoveldb — open the ones in our library." />

      <div className="px-10 py-8">
        {/* Category tabs */}
        <div className="mb-6 flex flex-wrap gap-1.5 border-b border-asterion-border pb-3">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                tab === t.id
                  ? "bg-gold/15 text-gold"
                  : "text-asterion-muted hover:text-asterion-text",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <p className="text-sm text-asterion-muted">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-asterion-muted">
            No ranking data yet. The chart populates after the VM runs the{" "}
            <code className="text-gold">rankings</code> job.
          </p>
        ) : (
          <ol className="overflow-hidden rounded-xl border border-asterion-border">
            {items.map((item) => (
              <RankingRow key={`${item.category}-${item.position}`} item={item} />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function RankingRow({ item }: { item: RankingItem }) {
  const matched = item.novel_id != null;

  const inner = (
    <>
      <span
        className={cn(
          "w-8 shrink-0 text-center font-mono text-sm",
          item.position <= 3 ? "text-gold" : "text-asterion-dim",
        )}
      >
        {item.position}
      </span>
      <div className="h-14 w-10 shrink-0 overflow-hidden rounded bg-asterion-cardHover">
        {item.cover_url && (
          <img
            src={item.cover_url}
            alt=""
            loading="lazy"
            className={cn("h-full w-full object-cover", !matched && "opacity-40 grayscale")}
          />
        )}
      </div>
      <span
        className={cn(
          "flex-1 truncate font-serif",
          matched ? "text-asterion-text" : "text-asterion-dim",
        )}
      >
        {item.title}
      </span>
      <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider">
        {matched ? (
          <span className="text-gold/70">Open →</span>
        ) : (
          <span className="text-asterion-dim/60">Not in library</span>
        )}
      </span>
    </>
  );

  const cls = "flex items-center gap-4 border-b border-asterion-border px-4 py-2.5 last:border-b-0";

  return matched ? (
    <Link to={`/novel/${item.novel_id}`} className={cn(cls, "hover:bg-asterion-card")}>
      {inner}
    </Link>
  ) : (
    <li className={cn(cls, "cursor-default")} title="Not in our catalog yet">
      {inner}
    </li>
  );
}
