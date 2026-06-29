import { useEffect, useRef, useState } from "react";
import ePub, { type Rendition } from "epubjs";

function cssVar(name: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v ? `rgb(${v})` : "";
}

export function EpubViewer({
  bytes,
  initialCfi,
  onCfi,
}: {
  bytes: Uint8Array;
  initialCfi?: string;
  onCfi?: (cfi: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.innerHTML = "";
    let destroyed = false;

    try {
      const book = ePub(bytes.slice().buffer);
      const rendition = book.renderTo(host, {
        width: "100%",
        height: "100%",
        flow: "scrolled-doc",
        spread: "none",
      });
      renditionRef.current = rendition;

      // Theme the isolated epub iframe to match the app palette.
      rendition.themes.default({
        body: {
          background: "transparent",
          color: cssVar("--app-text") || "#e8dcc8",
          "font-family": "var(--font-serif), Georgia, serif",
          "line-height": "1.7",
          padding: "8px 24px",
        },
        a: { color: cssVar("--app-accent") || "#c4a44a" },
      });

      rendition.display(initialCfi || undefined);
      rendition.on("relocated", (loc: any) => {
        if (!destroyed && onCfi && loc?.start?.cfi) onCfi(loc.start.cfi);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open EPUB");
    }

    return () => {
      destroyed = true;
      renditionRef.current?.destroy();
      renditionRef.current = null;
    };
  }, [bytes, initialCfi, onCfi]);

  if (error) {
    return <div className="px-8 py-12 text-sm text-asterion-muted">{error}</div>;
  }

  return (
    <div className="relative h-full">
      <div ref={hostRef} className="h-full overflow-y-auto" />
      <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
        <button
          onClick={() => renditionRef.current?.prev()}
          className="pointer-events-auto rounded-full border border-asterion-border bg-asterion-card/90 px-4 py-1.5 font-mono text-[11px] text-asterion-muted hover:text-asterion-text"
        >
          ◂ Prev
        </button>
        <button
          onClick={() => renditionRef.current?.next()}
          className="pointer-events-auto rounded-full border border-asterion-border bg-asterion-card/90 px-4 py-1.5 font-mono text-[11px] text-asterion-muted hover:text-asterion-text"
        >
          Next ▸
        </button>
      </div>
    </div>
  );
}
