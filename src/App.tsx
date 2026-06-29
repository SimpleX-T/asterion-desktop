import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Home } from "@/pages/Home";
import { Library } from "@/pages/Library";
import { NovelDetail } from "@/pages/NovelDetail";
import { Reader } from "@/pages/Reader";
import { Ranking } from "@/pages/Ranking";
import { Profile } from "@/pages/Profile";
import { Documents } from "@/pages/Documents";
import { DocumentViewer } from "@/pages/DocumentViewer";
import { ensureAnonymousSession, isSupabaseConfigured } from "@/lib/supabase";
import { useBackShortcut } from "@/hooks/useBack";

export default function App() {
  useBackShortcut(); // global Backspace / Alt+Left → go back, on every screen

  useEffect(() => {
    // Establish the per-device anonymous session up front so user-scoped reads
    // (progress, library, prefs) have an auth.uid() to satisfy RLS.
    if (isSupabaseConfigured) {
      void ensureAnonymousSession();
    }
  }, []);

  return (
    <Routes>
      {/* Full-screen / immersive views rendered outside the chrome Layout. */}
      <Route path="/read/:novelId/:chapterId" element={<Reader />} />
      <Route path="/document/:id" element={<DocumentViewer />} />

      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/library" element={<Library />} />
        <Route path="/documents" element={<Documents />} />
        <Route path="/novel/:novelId" element={<NovelDetail />} />
        <Route path="/ranking" element={<Ranking />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
