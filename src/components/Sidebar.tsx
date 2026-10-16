import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Mic,
  Volume2,
  FileText,
  History,
  Star,
  Settings,
  User as UserIcon,
  X,
  AudioLines,
} from "lucide-react";
import { cn } from "../utils/cn";
import { DEMO_MODE, healthApi } from "../lib/api";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/voice-to-text", label: "Voice to Text", icon: Mic },
  { to: "/text-to-voice", label: "Text to Voice", icon: Volume2 },
  { to: "/transcripts", label: "My Transcripts", icon: FileText },
  { to: "/history", label: "History", icon: History },
  { to: "/favorites", label: "Favorites", icon: Star },
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/profile", label: "Profile", icon: UserIcon },
];

export function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const [demoMode, setDemoMode] = useState(DEMO_MODE);

  useEffect(() => {
    const updateMode = (event: Event) => {
      setDemoMode((event as CustomEvent<{ demo: boolean }>).detail.demo);
    };
    window.addEventListener("voicetext:backend-mode", updateMode);
    healthApi.check();
    return () => window.removeEventListener("voicetext:backend-mode", updateMode);
  }, []);

  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden" onClick={onClose} />}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white px-4 py-5 transition-transform duration-300 dark:border-slate-800 dark:bg-slate-900 lg:static lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="mb-6 flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/30">
              <AudioLines className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold leading-tight text-slate-900 dark:text-white">VoiceText AI</p>
              <p className="text-[11px] text-slate-400">Voice ⇄ Text Studio</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 lg:hidden dark:hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/25"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                )
              }
            >
              <Icon className="h-4.5 w-4.5 h-[18px] w-[18px]" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-xs text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300">
          <p className="font-semibold">{demoMode ? "Demo Mode Active" : "C++ Backend Connected"}</p>
          <p className="mt-1 text-indigo-600/80 dark:text-indigo-300/70">
            {demoMode ? "Running in-browser because the backend is unavailable." : "Data is saved by the backend; speech and AI providers are in demo mode."}
          </p>
        </div>
      </aside>
    </>
  );
}
