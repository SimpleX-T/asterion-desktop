// Normalize the scraped/catalog `total_chapters` (e.g. "3067", "76 Chapters",
// "1,234 Chapters") into a consistent "N chapters" label.
export function chapterCountLabel(total: string | null | undefined): string | null {
  if (!total) return null;
  const digits = total.replace(/[^\d]/g, "");
  if (!digits) return total;
  return `${Number(digits).toLocaleString()} chapters`;
}
