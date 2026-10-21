"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Menu, ChevronRight, ChevronDown, Search, Bell, Settings, Sun, Moon, BookmarkCheck, Clipboard, ClipboardList } from "lucide-react";
import { useSidebar } from "./SidebarContext";
import { useTheme } from "./ThemeContext";

const BREADCRUMB_MAP: Record<string, string[]> = {
  "/": ["Dashboard"],
  "/properties": ["Properties", "Property List"],
  "/properties/new": ["Properties", "Manual Entry"],
  "/documents": ["PDF Processing", "Upload PDFs"],
  "/td-print-history": ["Print Records", "TD Print History"],
  "/file-manager": ["File Manager"],
  "/delinquencies": ["Delinquencies", "Overview"],
  "/delinquencies/import": ["Delinquencies", "Import List"],
  "/delinquencies/accounts": ["Delinquencies", "Delinquent Accounts"],
  "/reports": ["Reports", "Reports & Export"],
  "/audit": ["System", "Audit Trail"],
  "/settings": ["System", "Settings"],
};

function getBreadcrumbs(pathname: string): string[] {
  if (BREADCRUMB_MAP[pathname]) return BREADCRUMB_MAP[pathname];
  let best: string | null = null;
  for (const key of Object.keys(BREADCRUMB_MAP)) {
    if (pathname.startsWith(key) && key !== "/") {
      if (!best || key.length > best.length) best = key;
    }
  }
  return best ? BREADCRUMB_MAP[best] : [];
}

function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  if (!now) return null;
  const date = now.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = now.toLocaleTimeString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div className="hidden md:flex items-center gap-1.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-3.5 py-2">
      <span className="text-xs text-gray-500 dark:text-slate-400">{date}</span>
      <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-slate-600 shrink-0" />
      <span className="text-xs font-semibold text-gray-700 dark:text-slate-200">{time}</span>
    </div>
  );
}

export function AppHeader() {
  const pathname = usePathname();
  const { toggle } = useSidebar();
  const { theme, toggleTheme } = useTheme();
  const crumbs = getBreadcrumbs(pathname);

  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const [autoCheck, setAutoCheck] = useState(false);
  const [autoCopyTd, setAutoCopyTd] = useState(false);

  useEffect(() => {
    setAutoCheck(localStorage.getItem("prop_autoCheck") === "true");
    setAutoCopyTd(localStorage.getItem("prop_autoCopyTd") === "true");
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggleAutoCheck = () => {
    const next = !autoCheck;
    setAutoCheck(next);
    localStorage.setItem("prop_autoCheck", String(next));
  };

  const toggleAutoCopyTd = () => {
    const next = !autoCopyTd;
    setAutoCopyTd(next);
    localStorage.setItem("prop_autoCopyTd", String(next));
  };

  return (
    <header className="app-header sticky top-0 z-30 h-16 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-gray-200/80 dark:border-slate-700/80 flex items-center px-5 gap-4">
      {/* Left */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {/* Mobile hamburger */}
        <button
          onClick={toggle}
          className="lg:hidden p-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500 dark:text-slate-400 transition-colors"
        >
          <Menu size={18} />
        </button>

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm min-w-0">
          <span className="text-gray-400 dark:text-slate-500 hidden sm:inline shrink-0">
            Treasurer's Office
          </span>
          {crumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1.5 min-w-0">
              <ChevronRight size={13} className="text-gray-300 dark:text-slate-600 shrink-0" />
              {i === crumbs.length - 1 ? (
                <span className="font-semibold text-gray-900 dark:text-slate-100 truncate">
                  {crumb}
                </span>
              ) : (
                <span className="text-gray-400 dark:text-slate-500 hidden sm:inline truncate">
                  {crumb}
                </span>
              )}
            </span>
          ))}
        </nav>
      </div>

      {/* Right */}
      <div className="flex items-center gap-1.5 shrink-0">
        <LiveClock />

        <button className="p-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-400 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 transition-colors">
          <Search size={18} />
        </button>

        <button className="relative p-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-400 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 transition-colors">
          <Bell size={18} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-500 rounded-full border-2 border-white dark:border-slate-900" />
        </button>

        {/* Dark mode toggle */}
        <button
          onClick={toggleTheme}
          className="p-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-400 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 transition-colors"
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <div
          ref={settingsRef}
          className="relative"
          onKeyDown={(event) => {
            if (event.key === "Escape" && showSettings) {
              setShowSettings(false);
              settingsButtonRef.current?.focus();
            }
          }}
        >
          <button
            ref={settingsButtonRef}
            type="button"
            title="System and quick settings"
            aria-label="System and quick settings"
            aria-expanded={showSettings}
            aria-controls="header-settings-panel"
            onClick={() => setShowSettings((v) => !v)}
            className={`flex items-center gap-1 p-2.5 rounded-lg transition-colors
              ${showSettings
                ? "bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200"
                : "hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-400 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"}`}
          >
            <Settings size={18} />
            <ChevronDown size={13} className="transition-transform duration-200" style={{ transform: showSettings ? "rotate(180deg)" : "rotate(0deg)" }} />
          </button>

          {showSettings && (
            <div id="header-settings-panel" className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg dark:shadow-slate-900/50 z-50 p-1">
              <nav aria-label="System">
                <p className="px-3 py-2 text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
                  System
                </p>
                {[
                  { href: "/audit", label: "Audit Trail", icon: ClipboardList },
                  { href: "/settings", label: "Settings", icon: Settings },
                ].map(({ href, label, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setShowSettings(false)}
                    aria-current={pathname === href ? "page" : undefined}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 ${pathname === href
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                      : "text-gray-700 hover:bg-gray-50 dark:text-slate-200 dark:hover:bg-slate-700"}`}
                  >
                    <Icon size={16} aria-hidden="true" />
                    {label}
                  </Link>
                ))}
              </nav>
              <hr className="my-1 border-gray-100 dark:border-slate-700" />
              <p className="px-3 py-2 text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
                Quick Settings
              </p>
              <button
                onClick={toggleAutoCheck}
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <BookmarkCheck size={15} className={autoCheck ? "text-amber-500" : "text-gray-400 dark:text-slate-500"} />
                  <div className="text-left">
                    <p className="text-sm font-medium text-gray-700 dark:text-slate-200">Auto-check on open</p>
                    <p className="text-xs text-gray-400 dark:text-slate-500">Mark property checked when opened</p>
                  </div>
                </div>
                <span
                  className={`w-9 h-5 rounded-full relative shrink-0 transition-colors duration-200 ease-in-out ${autoCheck ? "bg-amber-400" : "bg-gray-200 dark:bg-slate-600"}`}
                >
                  <span
                    className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-[left] duration-200 ease-in-out"
                    style={{ left: autoCheck ? "18px" : "2px" }}
                  />
                </span>
              </button>
              <button
                onClick={toggleAutoCopyTd}
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Clipboard size={15} className={autoCopyTd ? "text-blue-500" : "text-gray-400 dark:text-slate-500"} />
                  <div className="text-left">
                    <p className="text-sm font-medium text-gray-700 dark:text-slate-200">Auto-copy TD on open</p>
                    <p className="text-xs text-gray-400 dark:text-slate-500">Copy TD number when opening a property</p>
                  </div>
                </div>
                <span
                  className={`w-9 h-5 rounded-full relative shrink-0 transition-colors duration-200 ease-in-out ${autoCopyTd ? "bg-blue-400" : "bg-gray-200 dark:bg-slate-600"}`}
                >
                  <span
                    className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-[left] duration-200 ease-in-out"
                    style={{ left: autoCopyTd ? "18px" : "2px" }}
                  />
                </span>
              </button>
            </div>
          )}
        </div>

        {/* User avatar */}
        <div className="ml-1 w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-sm">
          <span className="text-xs font-bold text-white tracking-wide">
            PTO
          </span>
        </div>
      </div>
    </header>
  );
}
