// Save a chapter to a user-chosen file. Uses the Tauri dialog + fs plugins when
// running in the desktop shell; falls back to a browser download in a plain web
// context (e.g. `pnpm dev` in a browser tab).

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function saveChapterToFile(
  suggestedName: string,
  content: string,
): Promise<boolean> {
  const safeName = suggestedName.replace(/[\/\\:*?"<>|]/g, "_");

  if (isTauri()) {
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { writeTextFile } = await import("@tauri-apps/plugin-fs");
      const path = await save({
        defaultPath: safeName,
        filters: [{ name: "Text", extensions: ["txt"] }],
      });
      if (!path) return false; // user cancelled
      await writeTextFile(path, content);
      return true;
    } catch (e) {
      console.error("[asterion] save failed:", e);
      return false;
    }
  }

  // Browser fallback.
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safeName;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}
