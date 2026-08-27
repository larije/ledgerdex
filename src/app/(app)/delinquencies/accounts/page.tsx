"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Search, Loader2, FileSpreadsheet, FileDown, FileText, Mail, RotateCcw, Copy, Check,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/layout/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency, copyToClipboard } from "@/lib/utils";
import {
  RPU_TYPE_LABELS, classCodeLabel, formatDelinquentPeriod,
  SETTLEMENT_STATUS_LABELS, SETTLEMENT_STATUS_VARIANT,
} from "@/lib/delinquency";
import {
  exportDelinquentAccountsCSV, exportDelinquencySummaryPDF, generateBatchNoticesPDF,
} from "@/lib/delinquency-export";
import { DelinquentAccount, DelinquencyList } from "@/types";

const PAGE_SIZE = 25;
const FILTERS_KEY = "delinq_accounts_filters";
const LAST_VIEWED_KEY = "delinq_accounts_lastViewed";

interface Filters {
  search: string;
  municipality: string;
  barangay: string;
  status: string;
  classCode: string;
  rpuType: string;
  presence: string; // present | all | absent
  sort: string;
}
const DEFAULT_FILTERS: Filters = {
  search: "", municipality: "", barangay: "", status: "",
  classCode: "", rpuType: "", presence: "present", sort: "rowNo",
};

/** Copy-to-clipboard button (LAN/http safe via lib/utils fallback). */
function CopyBtn({ text }: { text: string }) {
  const { toast } = useToast();
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ok = await copyToClipboard(text);
        if (ok) { setDone(true); toast("success", "Copied", text); setTimeout(() => setDone(false), 1200); }
        else toast("error", "Copy failed");
      }}
      className="text-slate-300 hover:text-blue-500 dark:text-slate-600 dark:hover:text-blue-400 transition shrink-0"
      title="Copy TD number"
    >
      {done ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
    </button>
  );
}

export default function DelinquentAccountsPage() {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<DelinquentAccount[]>([]);
  const [total, setTotal] = useState(0);
  const [totals, setTotals] = useState({ amountDue: 0, amountPaid: 0, balance: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [lists, setLists] = useState<DelinquencyList[]>([]);
  const [barangays, setBarangays] = useState<string[]>([]);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [ready, setReady] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const rowRef = useRef<HTMLTableRowElement | null>(null);

  // Restore persisted filters + page + last-viewed row on mount (survives going
  // into an account and back). sessionStorage → scoped to this browser session.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(FILTERS_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        setFilters({ ...DEFAULT_FILTERS, ...(s.filters ?? {}) });
        if (s.page) setPage(s.page);
      }
      setHighlightId(sessionStorage.getItem(LAST_VIEWED_KEY));
    } catch { /* ignore */ }
    setReady(true);
  }, []);

  // Persist filters + page whenever they change (after the initial restore).
  useEffect(() => {
    if (!ready) return;
    sessionStorage.setItem(FILTERS_KEY, JSON.stringify({ filters, page }));
  }, [ready, filters, page]);

  useEffect(() => {
    fetch("/api/delinquencies/lists")
      .then((r) => r.json())
      .then((d) => setLists(d.lists ?? []))
      .catch(() => {});
  }, []);

  // Barangay options — refetched when the municipality filter changes.
  useEffect(() => {
    const p = new URLSearchParams();
    if (filters.municipality) p.set("municipality", filters.municipality);
    fetch(`/api/delinquencies/barangays?${p}`)
      .then((r) => r.json())
      .then((d) => setBarangays(d.barangays ?? []))
      .catch(() => {});
  }, [filters.municipality]);

  // A user changing any filter resets to page 1; changing municipality also
  // clears the (now out-of-scope) barangay. Restore path sets state directly,
  // so it is unaffected.
  const updateFilter = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  const filterParams = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.search) p.set("search", filters.search);
    if (filters.municipality) p.set("municipality", filters.municipality);
    if (filters.barangay) p.set("barangay", filters.barangay);
    if (filters.status) p.set("status", filters.status);
    if (filters.classCode) p.set("classCode", filters.classCode);
    if (filters.rpuType) p.set("rpuType", filters.rpuType);
    if (filters.presence === "present") p.set("present", "true");
    if (filters.presence === "absent") p.set("present", "false");
    if (filters.sort) p.set("sort", filters.sort);
    return p;
  }, [filters]);

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams(filterParams);
    p.set("page", String(page));
    p.set("limit", String(PAGE_SIZE));
    const res = await fetch(`/api/delinquencies/accounts?${p}`);
    const data = await res.json();
    setAccounts(data.accounts ?? []);
    setTotal(data.total ?? 0);
    setTotals(data.totals ?? { amountDue: 0, amountPaid: 0, balance: 0 });
    setLoading(false);
  }, [filterParams, page]);

  // Only fetch after restore, so we don't flash default results first.
  useEffect(() => { if (ready) load(); }, [ready, load]);

  // Scroll the last-viewed row into view once results are in.
  useEffect(() => {
    if (!loading && rowRef.current) {
      rowRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [loading, accounts]);

  const municipalities = useMemo(
    () => Array.from(new Set(lists.map((l) => l.municipality))).sort(),
    [lists]
  );

  // Header sort button styling — highlights the active sort column.
  const sortCls = (key: string) =>
    `hover:text-slate-700 dark:hover:text-slate-200 ${
      filters.sort === key ? "text-blue-600 dark:text-blue-400 font-bold" : ""
    }`;

  const openAccount = (id: string) => {
    try { sessionStorage.setItem(LAST_VIEWED_KEY, id); } catch { /* ignore */ }
    setHighlightId(id);
  };

  const fetchAllForExport = async (): Promise<DelinquentAccount[]> => {
    const p = new URLSearchParams(filterParams);
    p.set("page", "1");
    p.set("limit", "5000");
    const res = await fetch(`/api/delinquencies/accounts?${p}`);
    const data = await res.json();
    return data.accounts ?? [];
  };

  const runExport = async (kind: "csv" | "pdf" | "notices") => {
    setExporting(true);
    try {
      const all = await fetchAllForExport();
      if (all.length === 0) { toast("warning", "Nothing to export", "No accounts match the filters."); return; }
      if (kind === "csv") exportDelinquentAccountsCSV(all);
      if (kind === "pdf") exportDelinquencySummaryPDF(all);
      if (kind === "notices") generateBatchNoticesPDF(all);
      toast("success", "Exported", `${all.length} accounts.`);
    } catch {
      toast("error", "Export failed", "Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const exportExcel = () => {
    window.location.href = `/api/delinquencies/export?${filterParams}`;
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="animate-fade-in space-y-5">
      <PageHeader
        title="Delinquent Accounts"
        subtitle={`${total.toLocaleString()} account${total !== 1 ? "s" : ""} · ${formatCurrency(totals.balance)} outstanding`}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={exportExcel} disabled={exporting}>
              <FileSpreadsheet size={14} /> Excel
            </Button>
            <Button variant="secondary" size="sm" onClick={() => runExport("csv")} disabled={exporting}>
              <FileDown size={14} /> CSV
            </Button>
            <Button variant="secondary" size="sm" onClick={() => runExport("pdf")} disabled={exporting}>
              <FileText size={14} /> PDF
            </Button>
            <Button size="sm" onClick={() => runExport("notices")} loading={exporting}>
              <Mail size={14} /> Notices
            </Button>
          </>
        }
      />

      {/* Filters */}
      <Card>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <Input
              placeholder="Search taxpayer, TD, PIN, cadastral…"
              value={filters.search}
              onChange={(e) => updateFilter({ search: e.target.value })}
              icon={<Search size={14} />}
            />
          </div>
          <Select value={filters.municipality} onChange={(e) => updateFilter({ municipality: e.target.value, barangay: "" })} placeholder="All municipalities">
            {municipalities.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
          <Select value={filters.barangay} onChange={(e) => updateFilter({ barangay: e.target.value })} placeholder="All barangays" disabled={barangays.length === 0}>
            {barangays.map((b) => <option key={b} value={b}>{b}</option>)}
          </Select>
          <Select value={filters.status} onChange={(e) => updateFilter({ status: e.target.value })} placeholder="Any status">
            {Object.entries(SETTLEMENT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Select value={filters.classCode} onChange={(e) => updateFilter({ classCode: e.target.value })} placeholder="Any class">
            {["A", "R", "C", "I"].map((c) => <option key={c} value={c}>{classCodeLabel(c)}</option>)}
          </Select>
          <Select value={filters.rpuType} onChange={(e) => updateFilter({ rpuType: e.target.value })} placeholder="Any type">
            {Object.entries(RPU_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Select value={filters.presence} onChange={(e) => updateFilter({ presence: e.target.value })}>
            <option value="present">On current list</option>
            <option value="all">Include resolved</option>
            <option value="absent">Off-list only</option>
          </Select>
        </div>
      </Card>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide">
                <th className="text-right px-3 py-3 font-medium w-12">
                  <button onClick={() => updateFilter({ sort: "rowNo" })} className={sortCls("rowNo")} title="PDF order (No.)">#</button>
                </th>
                <th className="text-left px-4 py-3 font-medium">TD No.</th>
                <th className="text-left px-3 py-3 font-medium">
                  <button onClick={() => updateFilter({ sort: "taxpayer" })} className={sortCls("taxpayer")}>Taxpayer</button>
                </th>
                <th className="text-left px-3 py-3 font-medium">Location</th>
                <th className="text-left px-3 py-3 font-medium">Class / Type</th>
                <th className="text-left px-3 py-3 font-medium">
                  <button onClick={() => updateFilter({ sort: "period" })} className={sortCls("period")}>Delinquent</button>
                </th>
                <th className="text-right px-3 py-3 font-medium">
                  <button onClick={() => updateFilter({ sort: "amount" })} className={sortCls("amount")}>Amount Due</button>
                </th>
                <th className="text-right px-3 py-3 font-medium">
                  <button onClick={() => updateFilter({ sort: "balance" })} className={sortCls("balance")}>Balance</button>
                </th>
                <th className="text-left px-3 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading && (
                <tr><td colSpan={9} className="text-center py-12"><Loader2 size={20} className="animate-spin text-slate-400 mx-auto" /></td></tr>
              )}
              {!loading && accounts.length === 0 && (
                <tr><td colSpan={9} className="text-center py-12 text-slate-400 text-sm">No delinquent accounts match your filters.</td></tr>
              )}
              {accounts.map((a) => {
                const isHighlight = a.id === highlightId;
                return (
                  <tr
                    key={a.id}
                    ref={isHighlight ? rowRef : null}
                    className={`transition ${
                      isHighlight
                        ? "bg-blue-50/80 dark:bg-blue-900/25 ring-1 ring-inset ring-blue-300 dark:ring-blue-700"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    }`}
                  >
                    <td className="px-3 py-2.5 text-right text-xs text-slate-400 tabular-nums">{a.rowNo ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/delinquencies/accounts/${a.id}`}
                          onClick={() => openAccount(a.id)}
                          className="font-mono text-xs text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {a.tdNumber}
                        </Link>
                        <CopyBtn text={a.tdNumber} />
                        {!a.isPresent && <RotateCcw size={11} className="text-slate-400" aria-label="off current list" />}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-slate-800 dark:text-slate-200 max-w-[220px] truncate">{a.taxpayerName}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400">
                      <div>{a.list?.municipality ?? "—"}</div>
                      <div className="text-slate-400">{a.barangay ?? "—"}</div>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-400">
                      {classCodeLabel(a.classCode)} · {RPU_TYPE_LABELS[a.rpuType]}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {formatDelinquentPeriod(a.delinquentFromYear, a.delinquentFromQuarter, a.delinquentToYear, a.delinquentToQuarter)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-700 dark:text-slate-300">{formatCurrency(Number(a.amountDue))}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(Number(a.balance))}</td>
                    <td className="px-3 py-2.5">
                      <Badge variant={SETTLEMENT_STATUS_VARIANT[a.status]} dot>{SETTLEMENT_STATUS_LABELS[a.status]}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {!loading && accounts.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold text-slate-800 dark:text-slate-200">
                  <td colSpan={6} className="px-4 py-3 text-right text-xs uppercase tracking-wide text-slate-500">Filter totals →</td>
                  <td className="px-3 py-3 text-right">{formatCurrency(totals.amountDue)}</td>
                  <td className="px-3 py-3 text-right text-red-600">{formatCurrency(totals.balance)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-800 text-sm">
            <span className="text-slate-500 dark:text-slate-400">Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
              <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
