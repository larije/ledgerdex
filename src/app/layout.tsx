import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ToastProvider } from "@/components/ui/Toast";
import { ConfirmDialogProvider } from "@/components/ui/ConfirmDialog";
import { LayoutShell } from "@/components/layout/LayoutShell";
import { ThemeProvider } from "@/components/layout/ThemeContext";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "LedgerDex — Property Tax Management",
  description: "Philippine LGU Property Tax PDF Intelligence & Ledger System",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`h-full ${inter.className}`} suppressHydrationWarning>
      <body className="h-full">
        <ThemeProvider>
          <ToastProvider>
            <ConfirmDialogProvider>
              <LayoutShell>{children}</LayoutShell>
            </ConfirmDialogProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
