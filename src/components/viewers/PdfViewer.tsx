import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
// Vite resolves the worker to a URL we can hand to pdf.js.
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export function PdfViewer({
  bytes,
  initialPage,
  onPage,
}: {
  bytes: Uint8Array;
  initialPage?: number;
  onPage?: (page: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = "";

    (async () => {
      try {
        const pdf = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
        if (cancelled) return;
        setNumPages(pdf.numPages);
        const width = Math.min(900, container.clientWidth - 32);

        for (let n = 1; n <= pdf.numPages; n++) {
          if (cancelled) return;
          const page = await pdf.getPage(n);
          const viewport = page.getViewport({ scale: 1 });
          const scale = width / viewport.width;
          const scaled = page.getViewport({ scale });

          const canvas = document.createElement("canvas");
          canvas.width = scaled.width;
          canvas.height = scaled.height;
          canvas.className = "mx-auto mb-4 rounded shadow-lg";
          canvas.dataset.page = String(n);
          container.appendChild(canvas);
          const ctx = canvas.getContext("2d");
          if (ctx) await page.render({ canvas, canvasContext: ctx, viewport: scaled }).promise;
        }

        // Resume to the saved page.
        if (initialPage && initialPage > 1) {
          container
            .querySelector(`canvas[data-page="${initialPage}"]`)
            ?.scrollIntoView({ block: "start" });
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not open PDF");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bytes, initialPage]);

  // Track the most-visible page for progress.
  const onScroll = () => {
    const container = containerRef.current;
    if (!container || !onPage) return;
    const mid = container.scrollTop + container.clientHeight / 2;
    let current = 1;
    container.querySelectorAll<HTMLCanvasElement>("canvas[data-page]").forEach((c) => {
      if (c.offsetTop <= mid) current = Number(c.dataset.page);
    });
    onPage(current);
  };

  return (
    <div className="relative h-full">
      {error && <div className="px-8 py-12 text-sm text-asterion-muted">{error}</div>}
      <div ref={containerRef} onScroll={onScroll} className="h-full overflow-y-auto px-4 py-6" />
      {numPages > 0 && (
        <div className="pointer-events-none absolute bottom-3 right-4 rounded-full bg-asterion-card/90 px-3 py-1 font-mono text-[10px] text-asterion-muted">
          {numPages} pages
        </div>
      )}
    </div>
  );
}
