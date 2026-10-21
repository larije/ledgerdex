"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSidebar } from "./SidebarContext";
import {
  LayoutDashboard,
  Building2,
  PlusCircle,
  Upload,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  FileWarning,
  ListChecks,
  Printer,
  FolderOpen,
  AppWindow,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    items: [{ href: "/", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    title: "Properties",
    items: [
      { href: "/properties", label: "Property List", icon: Building2 },
      { href: "/properties/new", label: "Add Manually", icon: PlusCircle },
    ],
  },
  {
    title: "PDF Processing",
    items: [{ href: "/documents", label: "Upload PDFs", icon: Upload }],
  },
  {
    title: "Delinquencies",
    items: [
      { href: "/delinquencies", label: "Overview", icon: FileWarning },
      { href: "/delinquencies/accounts", label: "Delinquent Accounts", icon: ListChecks },
      { href: "/delinquencies/import", label: "Import List", icon: Upload },
    ],
  },
  {
    title: "Print Records",
    items: [{ href: "/td-print-history", label: "TD Print History", icon: Printer }],
  },
  {
    title: "Reports",
    items: [{ href: "/reports", label: "Reports & Export", icon: BarChart3 }],
  },
];

const ALL_HREFS = SECTIONS.flatMap((s) => s.items.map((i) => i.href));

function getActiveHref(pathname: string): string | null {
  let best: string | null = null;
  for (const href of ALL_HREFS) {
    const matches =
      pathname === href || (href !== "/" && pathname.startsWith(href));
    if (matches) {
      if (best === null || href.length > best.length) best = href;
    }
  }
  return best;
}

export function Sidebar() {
  const { collapsed, toggle } = useSidebar();
  const pathname = usePathname();
  const activeHref = getActiveHref(pathname);

  return (
    <aside
      className="fixed left-0 top-0 h-screen z-40 bg-white dark:bg-slate-900 border-r border-gray-200/80 dark:border-slate-700/80 shadow-[4px_0_20px_rgba(0,0,0,0.04)] transition-all duration-300 flex flex-col"
      style={{ width: collapsed ? "72px" : "272px" }}
    >
      {/* Logo area */}
      <div className="px-3.5 py-4 border-b border-gray-100 dark:border-slate-700 shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/davao-del-norte-seal.png"
              alt="Davao del Norte Seal"
              width={44}
              height={44}
              className="block h-11 w-11 rounded-full object-contain"
            />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-xs text-gray-400 dark:text-slate-500 uppercase tracking-widest leading-none">
                Province of
              </p>
              <p className="text-sm font-bold text-gray-900 dark:text-slate-100 leading-tight mt-0.5 truncate">
                Davao del Norte
              </p>
              <p className="text-xs text-blue-500 dark:text-blue-400 leading-none mt-0.5 truncate">
                Provincial Treasurer&apos;s Office
              </p>
            </div>
          )}
        </div>

        {/* System badge */}
        {!collapsed && (
          <div className="mt-3 inline-flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800 rounded-lg px-2.5 py-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shrink-0" />
            <span className="text-xs font-bold text-blue-700 dark:text-blue-400 tracking-wide">
              Tax Ledger
            </span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-4">
        {SECTIONS.map((section, si) => (
          <div key={si}>
            {section.title &&
              (collapsed ? (
                <div className="border-t border-gray-100 dark:border-slate-700 mx-1 mb-2" />
              ) : (
                <p className="px-3 mb-1.5 text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-slate-500">
                  {section.title}
                </p>
              ))}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = item.href === activeHref;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`sidebar-nav-item ${active ? "sidebar-nav-item-active" : "sidebar-nav-item-inactive"}`}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon
                      size={18}
                      strokeWidth={active ? 2.2 : 1.8}
                      className="shrink-0"
                    />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Desktop application and collapse toggle */}
      <div className="shrink-0 border-t border-gray-100 dark:border-slate-700 p-2.5 space-y-0.5">
        <Link
          href="/file-manager"
          title="File Manager"
          aria-label="File Manager"
          className={`sidebar-nav-item ${pathname === "/file-manager" ? "sidebar-nav-item-active" : "sidebar-nav-item-inactive"}`}
        >
          <FolderOpen size={18} className="shrink-0" aria-hidden="true" />
          {!collapsed && <span className="truncate">File Manager</span>}
        </Link>
        <a
          href="ledgerdex-etracs:launch"
          title="Open eTRACS on this computer"
          aria-label="Open eTRACS on this computer"
          className="sidebar-nav-item sidebar-nav-item-inactive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
        >
          <AppWindow size={18} strokeWidth={1.8} className="shrink-0" aria-hidden="true" />
          {!collapsed && <span className="truncate">eTRACS</span>}
        </a>
        <button
          onClick={toggle}
          className="sidebar-nav-item sidebar-nav-item-inactive w-full"
        >
          {collapsed ? (
            <ChevronRight size={18} className="shrink-0" />
          ) : (
            <>
              <ChevronLeft size={18} className="shrink-0" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
