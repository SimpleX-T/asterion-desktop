import { useState } from "react";
import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import { GeneratedCover } from "@/components/GeneratedCover";
import { chapterCountLabel } from "@/lib/format";
import type { Novel } from "@/lib/types";

export function NovelCard({ novel }: { novel: Novel }) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = novel.image_url && !imgFailed;
  const chapters = chapterCountLabel(novel.total_chapters);

  return (
    <Link
      to={`/novel/${novel.id}`}
      className="group flex flex-col overflow-hidden rounded-md border border-asterion-border bg-asterion-card transition-all duration-200 hover:-translate-y-0.5 hover:border-gold/50 hover:shadow-lg hover:shadow-black/30"
    >
      <div className="relative aspect-[2/3] overflow-hidden bg-asterion-cardHover">
        {showImage ? (
          <img
            src={novel.image_url!}
            alt={novel.title}
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
          />
        ) : (
          <GeneratedCover title={novel.title} author={novel.author} />
        )}

        {novel.rating != null && (
          <div className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-black/70 px-2 py-0.5 text-[11px] font-medium text-gold backdrop-blur-sm">
            <Star className="h-3 w-3 fill-gold" />
            {novel.rating.toFixed(1)}
          </div>
        )}
        {novel.status && (
          <div className="absolute bottom-2 left-2 rounded bg-black/65 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-white/75 backdrop-blur-sm">
            {novel.status}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="line-clamp-2 font-serif text-[15px] leading-snug text-asterion-text">
          {novel.title}
        </h3>
        {novel.author && (
          <p className="truncate text-xs text-asterion-muted">{novel.author}</p>
        )}
        {chapters && (
          <p className="mt-auto pt-1 font-mono text-[10px] text-asterion-dim">{chapters}</p>
        )}
      </div>
    </Link>
  );
}

export function NovelGrid({ novels }: { novels: Novel[] }) {
  return (
    <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
      {novels.map((n) => (
        <NovelCard key={n.id} novel={n} />
      ))}
    </div>
  );
}
