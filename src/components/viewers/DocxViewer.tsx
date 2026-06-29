import { useEffect, useState } from "react";

export function DocxViewer({ bytes }: { bytes: Uint8Array }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mod: any = await import("mammoth/mammoth.browser");
        const mammoth = mod.default ?? mod;
        const arrayBuffer = bytes.slice().buffer;
        const result = await mammoth.convertToHtml({ arrayBuffer });
        if (!cancelled) setHtml(result.value as string);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not read document");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bytes]);

  if (error) {
    return <div className="px-8 py-12 text-sm text-asterion-muted">{error}</div>;
  }
  if (html == null) {
    return <div className="px-8 py-12 text-sm text-asterion-muted">Rendering…</div>;
  }
  return (
    <div
      className="doc-prose mx-auto max-w-3xl px-8 py-12"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
