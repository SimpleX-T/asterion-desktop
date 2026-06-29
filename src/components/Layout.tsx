import { NavLink, Outlet } from "react-router-dom";
import { BookOpen, FileText, Home, Library, Trophy, User } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Discover", icon: Home, end: true },
  { to: "/library", label: "Library", icon: Library, end: false },
  { to: "/documents", label: "Documents", icon: FileText, end: false },
  { to: "/ranking", label: "Ranking", icon: Trophy, end: false },
  { to: "/profile", label: "Profile", icon: User, end: false },
];

export function Layout() {
  return (
    <div className="flex h-screen overflow-hidden bg-asterion-bg text-asterion-text">
      <aside className="flex w-60 shrink-0 flex-col border-r border-asterion-border bg-asterion-card/40 no-select">
        <div className="flex items-center gap-2 px-6 py-6">
          <BookOpen className="h-5 w-5 text-gold" />
          <span className="font-mono text-sm tracking-label text-asterion-text">
            ASTERION
          </span>
        </div>

        <div className="mb-1 px-3">
          <BackButton />
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                  isActive
                    ? "bg-asterion-cardHover text-gold"
                    : "text-asterion-muted hover:bg-asterion-card hover:text-asterion-text",
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-6 py-4 font-mono text-[10px] tracking-label text-asterion-dim">
          DESKTOP READER
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
