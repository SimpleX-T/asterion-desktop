import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, FolderOpen, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { listDocuments, removeDocument, upsertDocument, type DocMeta } from "@/lib/docs";
import { pickDocuments } from "@/lib/openDocument";

const TYPE_LABEL: Record<string, string> = {
  pdf: "PDF",
  epub: "EPUB",
  docx: "DOCX",
  txt: "TXT",
  md: "MD",
  unknown: "FILE",
};

export function Documents() {
  const [docs, setDocs] = useState<DocMeta[]>(listDocuments);
  const navigate = useNavigate();

  const onOpen = async () => {
    try {
      const picked = await pickDocuments();
      if (picked.length === 0) return;
      picked.forEach(upsertDocument);
      setDocs(listDocuments());
      if (picked.length === 1) navigate(`/document/${picked[0].id}`);
      else toast.success(`Added ${picked.length} documents`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open files");
    }
  };

  const onRemove = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    removeDocument(id);
    setDocs(listDocuments());
  };

  return (
    <div>
      <PageHeader
        eyebrow="DOCUMENTS"
        title="Your documents"
        subtitle="Open PDFs, EPUBs, Word docs, and text files from your computer."
      >
        <button
          onClick={() => void onOpen()}
          className="flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-medium text-asterion-bg"
        >
          <FolderOpen className="h-4 w-4" /> Open file
        </button>
      </PageHeader>

      <div className="px-10 py-8">
        {docs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-asterion-border p-10 text-center">
            <FileText className="mx-auto mb-3 h-8 w-8 text-asterion-dim" />
            <p className="text-sm text-asterion-muted">
              No documents yet. Click <span className="text-gold">Open file</span> to add PDFs,
              EPUBs, .docx, or .txt files.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-asterion-border overflow-hidden rounded-xl border border-asterion-border">
            {docs.map((d) => (
              <button
                key={d.id}
                onClick={() => navigate(`/document/${d.id}`)}
                className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-asterion-card"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-asterion-border font-mono text-[9px] text-asterion-muted">
                  {TYPE_LABEL[d.type] ?? "FILE"}
                </span>
                <span className="flex-1 truncate">
                  <span className="block truncate text-sm text-asterion-text">{d.name}</span>
                  <span className="block truncate text-[11px] text-asterion-dim">{d.path || "in memory"}</span>
                </span>
                {d.progress && (
                  <span className="font-mono text-[10px] text-asterion-muted">resume</span>
                )}
                <span
                  onClick={(e) => onRemove(e, d.id)}
                  className="rounded p-1.5 text-asterion-dim hover:text-asterion-text"
                  title="Remove from library"
                >
                  <Trash2 className="h-4 w-4" />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
