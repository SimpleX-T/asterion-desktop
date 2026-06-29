import { useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { NovelGrid } from "@/components/NovelCard";
import { AddNovelDialog } from "@/components/AddNovelDialog";
import { useLibrary } from "@/lib/queries";

export function Library() {
  const { data: novels = [], isLoading: loading, refetch } = useLibrary();
  const [adding, setAdding] = useState(false);

  return (
    <div>
      <PageHeader eyebrow="LIBRARY" title="Your shelf" subtitle="Saved and added novels.">
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-medium text-asterion-bg"
        >
          <Plus className="h-4 w-4" /> Add novel
        </button>
      </PageHeader>

      <div className="px-10 py-8">
        {loading ? (
          <p className="text-sm text-asterion-muted">Loading…</p>
        ) : novels.length > 0 ? (
          <NovelGrid novels={novels} />
        ) : (
          <p className="text-sm text-asterion-muted">
            Your shelf is empty. Add a novel by its novelfire.net URL.
          </p>
        )}
      </div>

      {adding && (
        <AddNovelDialog
          onClose={() => {
            setAdding(false);
            void refetch();
          }}
        />
      )}
    </div>
  );
}
