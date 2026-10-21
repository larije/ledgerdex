"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, CheckCircle2, ChevronDown, ChevronUp, MapPin, MessageSquare, Printer, RefreshCw, Save, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { TdPrintEntry, type PrintEntry } from "@/components/td-print-history/TdPrintEntry";
import { TdBatchNoteEditor } from "@/components/td-print-history/TdBatchNoteEditor";
import { MAX_LOCATION_LENGTH, MAX_TD_NUMBERS, MAX_TD_TEXT_LENGTH, parseTdNumbers, validatePrintBatch } from "@/lib/td-print-history";

type BatchSummary = {
  id: string;
  location: string;
  note: string | null;
  printedOn: string;
  createdAt: string;
  _count: { entries: number };
};

function newRequestId() {
  // getRandomValues also works when the LAN app is opened over plain HTTP.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function printedDate(value: string) {
  // A printed date is a calendar day, regardless of the viewer's time zone.
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("en-PH", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function TdList({ numbers }: { numbers: string[] }) {
  return (
    <div className="max-h-72 overflow-y-auto">
      <ol className="columns-1 gap-x-8 p-4 sm:columns-2 xl:columns-3">
        {numbers.map((number, index) => (
          <li key={number} className="mb-2 flex break-inside-avoid gap-3 text-sm">
            <span className="w-6 shrink-0 text-right text-[var(--fg-muted)]">{index + 1}.</span>
            <span className="break-all font-mono">{number}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function HistoryBatch({ batch, copiedEntryId, onCopy, onNoteChange, refreshKey }: {
  batch: BatchSummary;
  copiedEntryId: string | null;
  onCopy: (entryId: string) => void;
  onNoteChange: (batchId: string, note: string | null) => void;
  refreshKey: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [entries, setEntries] = useState<PrintEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [editingNote, setEditingNote] = useState(false);
  const [noteEditorMounted, setNoteEditorMounted] = useState(false);
  const noteButton = useRef<HTMLButtonElement>(null);

  function closeNoteEditor() {
    setEditingNote(false);
    setNoteEditorMounted(false);
    noteButton.current?.focus({ preventScroll: true });
  }

  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    async function loadEntries() {
      try {
        const response = await fetch(`/api/td-print-batches/${batch.id}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load this batch.");
        if (controller.signal.aborted) return;
        setEntries(data.batch.entries);
        setError("");
      } catch (error) {
        if (controller.signal.aborted) return;
        setError(error instanceof Error ? error.message : "Could not load this batch.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadEntries();
    return () => controller.abort();
  }, [batch.id, expanded, refreshKey, retry]);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 font-semibold">
            <MapPin size={16} className="shrink-0 text-blue-500" />
            <span className="break-words">{batch.location}</span>
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--fg-muted)]">
            <span className="inline-flex items-center gap-1.5"><CalendarDays size={14} />Printed {printedDate(batch.printedOn)}</span>
            <span>{batch._count.entries} TD number{batch._count.entries === 1 ? "" : "s"}</span>
            <span>Recorded {new Date(batch.createdAt).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}</span>
          </div>
        </div>
        <Button
          variant="secondary" size="sm" aria-expanded={expanded} aria-controls={`batch-${batch.id}`}
          onClick={() => {
            if (!expanded) { setLoading(!entries); setError(""); }
            setExpanded(!expanded);
          }}
        >
          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          {expanded ? "Hide TDs" : "View TDs"}
        </Button>
      </div>
        <div id={`batch-${batch.id}`} hidden={!expanded} className="border-t border-[var(--border)]">
          {loading && <p className="p-5 text-sm text-[var(--fg-muted)]" role="status">Loading TD numbers…</p>}
          {error && <div className="flex items-center gap-3 p-5"><p role="alert" className="text-sm text-red-500">{error}</p><Button size="sm" variant="secondary" onClick={() => { setLoading(!entries); setError(""); setRetry((value) => value + 1); }}>Retry</Button></div>}
          {entries && (
            <>
              <div className="flex flex-wrap items-center justify-end gap-2 px-5 pt-3 text-xs text-[var(--fg-muted)]">
                <div className="flex items-center gap-4">
                  <button
                    ref={noteButton} type="button" onClick={() => {
                      setNoteEditorMounted(true);
                      setEditingNote((current) => !current);
                    }}
                    aria-expanded={editingNote} aria-controls={`batch-note-section-${batch.id}`}
                    aria-label={batch.note ? (editingNote ? "Hide saved note" : "View or edit saved note") : "Add note"}
                    title={editingNote ? "Hide note" : batch.note ? "View or edit saved note" : "Add note"}
                    className="inline-flex min-h-8 min-w-8 cursor-pointer items-center justify-center gap-1.5 rounded px-1 hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                  >
                    <span className="relative inline-flex" aria-hidden="true">
                      <MessageSquare size={13} />
                      {batch.note && <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-emerald-500 ring-2 ring-[var(--surface)]" />}
                    </span>
                    {!batch.note && "Add note"}
                  </button>
                  <p>{entries.filter((entry) => entry.isPrinted).length} / {entries.length} marked printed</p>
                </div>
              </div>
              <div id={`batch-note-section-${batch.id}`} hidden={!editingNote}>
                {noteEditorMounted && (
                  <TdBatchNoteEditor
                    batchId={batch.id} note={batch.note} onCancel={closeNoteEditor}
                    onSave={(note) => { onNoteChange(batch.id, note); closeNoteEditor(); }}
                  />
                )}
              </div>
              <div className="max-h-80 overflow-y-auto">
                <ol className="columns-1 gap-x-6 p-4 sm:columns-2 2xl:columns-3">
                  {entries.map((entry) => (
                    <TdPrintEntry key={entry.id} batchId={batch.id} entry={entry} copied={copiedEntryId === entry.id} onCopy={onCopy} onChange={(updated) => {
                      setEntries((current) => current?.map((item) => item.id === updated.id ? updated : item) ?? null);
                    }} />
                  ))}
                </ol>
              </div>
            </>
          )}
        </div>
    </Card>
  );
}

export default function TdPrintHistoryPage() {
  const [location, setLocation] = useState("");
  const [printedOn, setPrintedOn] = useState("");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const pendingSave = useRef<{ payload: string; requestId: string } | null>(null);
  const [saveError, setSaveError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [copiedEntryId, setCopiedEntryId] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const parsed = useMemo(() => parseTdNumbers(text), [text]);

  useEffect(() => {
    // Use the browser's current calendar day, not a date frozen during the build.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrintedOn(today());
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setHistoryError("");
      try {
        const params = new URLSearchParams({ page: String(page) });
        if (search.trim()) params.set("search", search.trim());
        const response = await fetch(`/api/td-print-batches?${params}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load print history.");
        if (controller.signal.aborted) return;
        setBatches(data.batches);
        setTotal(data.total);
        setPageSize(data.pageSize);
      } catch (error) {
        if (controller.signal.aborted) return;
        setHistoryError(error instanceof Error ? error.message : "Could not load print history.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [search, page, refresh]);

  async function saveBatch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;
    setSaveError("");
    setSuccess("");
    try {
      validatePrintBatch({ location, printedOn, text });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Check the batch details.");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const payload = JSON.stringify({ location, printedOn, text });
      if (pendingSave.current?.payload !== payload) {
        pendingSave.current = { payload, requestId: newRequestId() };
      }
      const response = await fetch("/api/td-print-batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location, printedOn, text, requestId: pendingSave.current.requestId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save this batch.");
      pendingSave.current = null;
      setSuccess(`Saved ${data.batch.entries.length} TD numbers for ${data.batch.location}.`);
      setText("");
      setSearch("");
      setPage(1);
      setLoading(true);
      setRefresh((value) => value + 1);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save this batch. Your entries are still here.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const tooMany = parsed.tdNumbers.length > MAX_TD_NUMBERS;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <PageHeader title="TD Print History" subtitle="Record the TD numbers you printed, grouped by location and date." />

      <Card className="p-5 sm:p-7">
        <div className="mb-5 flex items-start gap-3">
          <div className="rounded-xl bg-blue-50 p-3 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"><Printer size={22} /></div>
          <div>
            <h2 className="text-lg font-semibold">Record a printed batch</h2>
            <p className="mt-1 text-sm text-[var(--fg-muted)]">Enter one location for all the TD numbers below.</p>
          </div>
        </div>
        <form onSubmit={saveBatch} className="space-y-5">
          <fieldset disabled={saving} className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-[2fr_1fr]">
              <Input label="Location" placeholder="e.g. NEW SAMBONG" required maxLength={MAX_LOCATION_LENGTH} value={location} onChange={(event) => setLocation(event.target.value)} icon={<MapPin size={16} />} />
              <Input label="Date printed" type="date" required value={printedOn} onChange={(event) => setPrintedOn(event.target.value)} />
            </div>
            <Textarea
              label="Paste TD numbers" rows={7} required value={text} maxLength={MAX_TD_TEXT_LENGTH}
              onChange={(event) => { setText(event.target.value); setSaveError(""); setSuccess(""); }}
              placeholder={"1. 2023-05-0013-0053\n2. 2023-05-0013-00278\n3. 2023-05-0013-00151"}
              className="font-mono"
            />
          </fieldset>

          {text.trim() && (
            <div className="overflow-hidden rounded-xl border border-[var(--border)]">
              <div className="space-y-1 bg-[var(--surface-raised)] px-4 py-3">
                <h3 className="text-sm font-semibold">Preview · {parsed.tdNumbers.length} TD number{parsed.tdNumbers.length === 1 ? "" : "s"}</h3>
                {parsed.duplicateCount > 0 && <p className="text-sm text-[var(--fg-muted)]">{parsed.duplicateCount} repeated {parsed.duplicateCount === 1 ? "entry removed" : "entries removed"} from this batch.</p>}
                {tooMany && <p role="alert" className="text-sm text-red-500">Split this list into batches of up to {MAX_TD_NUMBERS.toLocaleString()} TD numbers.</p>}
              </div>
              {parsed.tdNumbers.length > 0 && <TdList numbers={parsed.tdNumbers} />}
              {parsed.invalidLines.length > 0 && (
                <div role="alert" className="border-t border-[var(--border)] p-4 text-sm text-red-600 dark:text-red-400">
                  <p className="font-medium">Fix these lines before saving:</p>
                  <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                    {parsed.invalidLines.map((line) => <li key={line.line} className="break-all">Line {line.line}: {line.text}</li>)}
                  </ul>
                </div>
              )}
              {parsed.tdNumbers.length === 0 && parsed.invalidLines.length === 0 && <p className="p-4 text-sm text-[var(--fg-muted)]">No TD numbers found. Paste the numbers below the heading.</p>}
            </div>
          )}

          {saveError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{saveError}</p>}
          {success && <p role="status" className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={16} />{success}</p>}
          <div className="flex flex-wrap items-center gap-4">
            <Button type="submit" loading={saving} disabled={!location.trim() || !printedOn || parsed.tdNumbers.length === 0 || parsed.invalidLines.length > 0 || tooMany}>
              <Save size={16} />Save printed batch
            </Button>
          </div>
        </form>
      </Card>

      <section aria-labelledby="recent-batches" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="recent-batches" className="text-lg font-semibold">Recent printed batches</h2>
          </div>
          <Button variant="secondary" size="sm" disabled={loading} onClick={() => { setLoading(true); setRefresh((value) => value + 1); }}><RefreshCw size={14} />Refresh</Button>
        </div>
        <Input
          aria-label="Search print history" placeholder="Search by TD number or location…" icon={<Search size={16} />}
          value={search} maxLength={MAX_LOCATION_LENGTH}
          onChange={(event) => { setSearch(event.target.value); setPage(1); setLoading(true); }}
        />
        {historyError && (
          <Card className="p-6"><p role="alert" className="text-sm text-red-600 dark:text-red-400">{historyError}</p><Button className="mt-3" variant="secondary" size="sm" onClick={() => setRefresh((value) => value + 1)}>Try again</Button></Card>
        )}
        {loading && batches.length > 0 && <p role="status" className="text-sm text-[var(--fg-muted)]">Refreshing print history…</p>}
        {loading && batches.length === 0 ? (
          <Card className="p-8 text-center text-sm text-[var(--fg-muted)]"><p role="status">Loading print history…</p></Card>
        ) : batches.length === 0 ? (
          !historyError && <Card className="p-8 text-center text-sm text-[var(--fg-muted)]">{search.trim() ? "No batches match this TD number or location." : "No printed batches yet. Save your first batch above."}</Card>
        ) : (
          <>
            {batches.map((batch) => (
              <HistoryBatch
                key={batch.id} batch={batch} copiedEntryId={copiedEntryId} onCopy={setCopiedEntryId} refreshKey={refresh}
                onNoteChange={(batchId, note) => setBatches((current) => current.map((item) => item.id === batchId ? { ...item, note } : item))}
              />
            ))}
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--fg-muted)]">
              <p>{total} batch{total === 1 ? "" : "es"} · Page {page} of {totalPages}</p>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => { setPage((value) => value - 1); setLoading(true); }}>Previous</Button>
                <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => { setPage((value) => value + 1); setLoading(true); }}>Next</Button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
