"use client";

import { useRef, useState } from "react";
import { Check } from "lucide-react";
import { copyToClipboard } from "@/lib/utils";

export type PrintEntry = {
  id: string;
  tdNumber: string;
  position: number;
  isPrinted: boolean;
};

export function TdPrintEntry({ batchId, entry, copied, onCopy, onChange }: {
  batchId: string;
  entry: PrintEntry;
  copied: boolean;
  onCopy: (entryId: string) => void;
  onChange: (entry: PrintEntry) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const savingRef = useRef(false);
  const copyButton = useRef<HTMLButtonElement>(null);

  async function copyNumber() {
    setError("");
    const ok = await copyToClipboard(entry.tdNumber);
    if (ok) onCopy(entry.id);
    else setError("Copy failed. Select the TD number and copy it manually.");
    // The LAN clipboard fallback temporarily focuses a hidden textarea.
    if (document.activeElement === document.body) copyButton.current?.focus({ preventScroll: true });
  }

  async function togglePrinted() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/td-print-batches/${batchId}/entries/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPrinted: !entry.isPrinted }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save the printed mark. Try again.");
      onChange(data.entry);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save the printed mark. Try again.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <li className="mb-1 min-w-0 break-inside-avoid text-sm">
      <div className="flex min-h-8 items-center gap-1">
        <span className="mr-1 w-6 shrink-0 text-right text-[var(--fg-muted)]">{entry.position}.</span>
        <button
          ref={copyButton} type="button" onClick={copyNumber}
          title="Copy TD number" aria-label={`Copy TD number ${entry.tdNumber}`}
          className={`min-w-0 cursor-pointer break-all rounded px-1 py-1 text-left font-mono hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:hover:text-blue-400 ${copied ? "bg-blue-100 text-blue-700 ring-1 ring-inset ring-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:ring-blue-700" : ""}`}
        >
          {entry.tdNumber}
        </button>
        <button
          type="button" onClick={togglePrinted} disabled={saving}
          aria-pressed={entry.isPrinted} aria-busy={saving}
          aria-label={`${entry.isPrinted ? "Unmark" : "Mark"} ${entry.tdNumber} as printed`}
          title={entry.isPrinted ? "Printed — click to unmark" : "Mark as printed"}
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full hover:bg-[var(--surface-raised)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-wait disabled:opacity-50"
        >
          <span className={`flex h-4 w-4 items-center justify-center rounded-full border ${entry.isPrinted ? "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-500" : "border-slate-400 dark:border-slate-500"}`}>
            {entry.isPrinted && <Check size={11} strokeWidth={3} aria-hidden="true" />}
          </span>
        </button>
        <span role="status" className="w-11 shrink-0 text-xs text-blue-600 dark:text-blue-400">{copied ? "Copied" : ""}</span>
      </div>
      {error && <p role="alert" className="ml-8 mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </li>
  );
}
