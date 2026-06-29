import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { getDocument, updateDocProgress, type DocMeta } from "@/lib/docs";
import { readDocBytes } from "@/lib/openDocument";
import { PdfViewer } from "@/components/viewers/PdfViewer";
import { EpubViewer } from "@/components/viewers/EpubViewer";
import { DocxViewer } from "@/components/viewers/DocxViewer";
import { TxtViewer } from "@/components/viewers/TxtViewer";

export function DocumentViewer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [meta, setMeta] = useState<DocMeta | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [error, setError] = useState<string | null>(null);
  const progressRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!id) return;
    const m = getDocument(id);
    if (!m) {
      setError("Document not found in your library.");
      return;
    }
    setMeta(m);
    readDocBytes(m)
      .then(setBytes)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not read file"));
  }, [id]);

  // Debounced progress persistence (page number or epub CFI).
  const saveProgress = useCallback(
    (value: string) => {
      if (!id) return;
      if (progressRef.current) clearTimeout(progressRef.current);
      progressRef.current = setTimeout(() => updateDocProgress(id, value), 1000);
    },
    [id],
  );

  return (
    <div className="flex h-screen flex-col bg-asterion-bg">
      <div className="flex items-center gap-3 border-b border-asterion-border px-5 py-3">
        <button
          onClick={() => navigate("/documents")}
          className="flex items-center gap-1.5 rounded-full border border-asterion-border px-3 py-1.5 font-mono text-xs text-asterion-muted hover:text-asterion-text"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Library
        </button>
        <span className="truncate font-serif text-asterion-text">{meta?.name}</span>
        {meta && (
          <span className="ml-auto font-mono text-[10px] uppercase tracking-label text-asterion-dim">
            {meta.type}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-hidden">
        {error ? (
          <div className="px-8 py-12 text-sm text-asterion-muted">{error}</div>
        ) : !bytes || !meta ? (
          <div className="px-8 py-12 text-sm text-asterion-muted">Loading…</div>
        ) : meta.type === "pdf" ? (
          <PdfViewer
            bytes={bytes}
            initialPage={meta.progress ? Number(meta.progress) : undefined}
            onPage={(p) => saveProgress(String(p))}
          />
        ) : meta.type === "epub" ? (
          <EpubViewer bytes={bytes} initialCfi={meta.progress} onCfi={saveProgress} />
        ) : meta.type === "docx" ? (
          <div className="h-full overflow-y-auto">
            <DocxViewer bytes={bytes} />
          </div>
        ) : (
          <div className="h-full overflow-y-auto">
            <TxtViewer bytes={bytes} markdown={meta.type === "md"} />
          </div>
        )}
      </div>
    </div>
  );
}
