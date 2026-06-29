// Local document library — user's own files (.pdf/.epub/.docx/.txt). This is
// device-local and private; metadata lives in localStorage, never in Supabase.

export type DocType = "pdf" | "epub" | "docx" | "txt" | "md" | "unknown";

export interface DocMeta {
  id: string;
  path: string; // filesystem path (empty in browser-dev fallback)
  name: string;
  type: DocType;
  addedAt: number;
  lastOpenedAt: number;
  // progress is viewer-specific: pdf=page number, epub=CFI, txt/docx=scroll ratio
  progress?: string;
}

const KEY = "asterion:documents";

export function detectType(name: string): DocType {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  if (ext === "epub") return "epub";
  if (ext === "docx" || ext === "doc") return "docx";
  if (ext === "txt") return "txt";
  if (ext === "md" || ext === "markdown") return "md";
  return "unknown";
}

// Stable id from path (or name when path is unavailable).
export function docId(pathOrName: string): string {
  let h = 0;
  for (let i = 0; i < pathOrName.length; i++) {
    h = (Math.imul(31, h) + pathOrName.charCodeAt(i)) | 0;
  }
  return `doc_${(h >>> 0).toString(36)}`;
}

export function listDocuments(): DocMeta[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as DocMeta[]) : [];
    return list.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
  } catch {
    return [];
  }
}

function writeAll(list: DocMeta[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function getDocument(id: string): DocMeta | null {
  return listDocuments().find((d) => d.id === id) ?? null;
}

export function upsertDocument(meta: DocMeta): void {
  const list = listDocuments().filter((d) => d.id !== meta.id);
  list.push(meta);
  writeAll(list);
}

export function removeDocument(id: string): void {
  writeAll(listDocuments().filter((d) => d.id !== id));
}

export function updateDocProgress(id: string, progress: string): void {
  const list = listDocuments();
  const doc = list.find((d) => d.id === id);
  if (!doc) return;
  doc.progress = progress;
  doc.lastOpenedAt = Date.now();
  writeAll(list);
}
