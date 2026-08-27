"use client";
import { SidebarProvider, useSidebar } from "./SidebarContext";
import { Sidebar } from "./Sidebar";
import { AppHeader } from "./AppHeader";
import { PageTransition } from "./PageTransition";

function LayoutContent({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  return (
    <div className="flex h-full">
      <Sidebar />
      <div
        className="flex flex-col flex-1 min-h-screen transition-all duration-300 ease-in-out"
        style={{ marginLeft: collapsed ? "72px" : "272px" }}
      >
        <AppHeader />
        <main className="flex-1 p-10 print:p-0 print:m-0">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </div>
  );
}

export function LayoutShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <LayoutContent>{children}</LayoutContent>
    </SidebarProvider>
  );
}
