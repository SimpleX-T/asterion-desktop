import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { requestScrape } from "@/lib/api";

export function AddNovelDialog({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    const trimmed = url.trim();
    if (!/^https?:\/\/novelfire\.net\/book\//.test(trimmed)) {
      toast.error("Enter a novelfire.net book URL (https://novelfire.net/book/…)");
      return;
    }
    setSubmitting(true);
    try {
      const queued = await requestScrape(trimmed);
      toast.success(
        queued
          ? "Queued — the scraper will fetch this novel shortly."
          : "Already queued.",
      );
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not queue request");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-asterion-border bg-asterion-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-lg text-asterion-text">Request a novel</h2>
          <button onClick={onClose} className="text-asterion-muted hover:text-asterion-text">
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="mb-2 block font-mono text-[10px] tracking-label text-asterion-muted">
          NOVELFIRE BOOK URL
        </label>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://novelfire.net/book/shadow-slave"
          disabled={submitting}
          className="w-full rounded-lg border border-asterion-border bg-asterion-bg px-3 py-2 text-sm text-asterion-text outline-none focus:border-gold"
          onKeyDown={(e) => e.key === "Enter" && void onSubmit()}
        />

        <button
          onClick={() => void onSubmit()}
          disabled={submitting}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-gold px-4 py-2.5 text-sm font-medium text-asterion-bg disabled:opacity-60"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitting ? "Queuing…" : "Request scrape"}
        </button>
        <p className="mt-3 text-center text-[11px] text-asterion-dim">
          Scraping runs on the server. The novel appears here once it's processed.
        </p>
      </div>
    </div>
  );
}
