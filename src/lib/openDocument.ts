import { detectType, docId, type DocMeta, type DocType } from "./docs";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

// Transient in-memory cache of file bytes, keyed by doc id, so the viewer can
// render immediately after opening without re-reading from disk.
const bytesCache = new Map<string, Uint8Array>();

const EXTENSIONS = ["pdf", "epub", "docx", "doc", "txt", "md", "markdown"];

export interface OpenedDoc {
  meta: DocMeta;
  bytes: Uint8Array;
}

/** Open the native picker, read the chosen files, and register them. */
export async function pickDocuments(): Promise<DocMeta[]> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readFile } = await import("@tauri-apps/plugin-fs");
    const selection = await open({
      multiple: true,
      filters: [{ name: "Documents", extensions: EXTENSIONS }],
    });
    if (!selection) return [];
    const paths = Array.isArray(selection) ? selection : [selection];
    const metas: DocMeta[] = [];
    for (const path of paths) {
      const name = basename(path);
      const id = docId(path);
      const bytes = await readFile(path);
      bytesCache.set(id, bytes);
      metas.push(makeMeta(id, path, name));
    }
    return metas;
  }

  // Browser-dev fallback: hidden file input (no persistent path).
  return new Promise<DocMeta[]>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = EXTENSIONS.map((e) => "." + e).join(",");
    input.onchange = async () => {
      const files = Array.from(input.files ?? []);
      const metas: DocMeta[] = [];
      for (const file of files) {
        const id = docId(file.name);
        bytesCache.set(id, new Uint8Array(await file.arrayBuffer()));
        metas.push(makeMeta(id, "", file.name));
      }
      resolve(metas);
    };
    input.click();
  });
}

function makeMeta(id: string, path: string, name: string): DocMeta {
  const now = Date.now();
  return {
    id,
    path,
    name,
    type: detectType(name) as DocType,
    addedAt: now,
    lastOpenedAt: now,
  };
}

/** Get bytes for a document — from cache, or re-read from disk (Tauri). */
export async function readDocBytes(meta: DocMeta): Promise<Uint8Array> {
  const cached = bytesCache.get(meta.id);
  if (cached) return cached;
  if (isTauri() && meta.path) {
    const { readFile } = await import("@tauri-apps/plugin-fs");
    const bytes = await readFile(meta.path);
    bytesCache.set(meta.id, bytes);
    return bytes;
  }
  throw new Error("File not in memory. Re-open it from your library.");
}
