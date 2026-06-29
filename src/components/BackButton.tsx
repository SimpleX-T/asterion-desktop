import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCanGoBack } from "@/hooks/useBack";

export function BackButton() {
  const navigate = useNavigate();
  const canGoBack = useCanGoBack();
  return (
    <button
      onClick={() => canGoBack && navigate(-1)}
      disabled={!canGoBack}
      title="Back (Backspace)"
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-asterion-muted transition-colors hover:bg-asterion-card hover:text-asterion-text disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-asterion-muted"
    >
      <ArrowLeft className="h-4 w-4" />
      Back
    </button>
  );
}
