"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search, Plus, Loader2, Building2, FileSpreadsheet, FileDown, FileText,
  ChevronLeft, ChevronRight, X, Copy, Check, Bookmark, BookmarkCheck,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { PageHeader } from "@/components/layout/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { Property } from "@/types";
import {
  copyToClipboard, formatCurrency, formatQuarter,
  getPaymentStatusColor, getPropertyTypeLabel, MUNICIPALITIES,
} from "@/lib/utils";
import { exportToCSV, exportToExcel, exportToPDF } from "@/lib/export";
import { classCodeLabel } from "@/lib/delinquency";

const PROPERTY_TYPES = ["LAND", "BLDG", "MACH", "MISC"];
const STATUSES       = ["PAID", "PARTIAL", "UNPAID", "DELINQUENT", "ADVANCE", "CURRENT"];

interface PropertyHeader {
  label: string;
  align: "left" | "right" | "center";
  sortKey?: string;
}

const HEADERS: PropertyHeader[] = [
  { label: "", align: "center" },
  { label: "TD No.", align: "left", sortKey: "tdNumber" },
  { label: "Municipality", align: "left", sortKey: "municipality" },
  { label: "Barangay", align: "left", sortKey: "barangay" },
  { label: "Class / Type", align: "left", sortKey: "classType" },
  { label: "Market Value", align: "right", sortKey: "marketValue" },
  { label: "Assessed Value", align: "right", sortKey: "assessedValue" },
  { label: "Payment Status", align: "center", sortKey: "status" },
  { label: "Paid Up To", align: "left", sortKey: "paidUpTo" },
];

const STATUS_VARIANT: Record<string, string> = {
  PAID:       "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
  PARTIAL:    "bg-amber-50  dark:bg-amber-900/30  text-amber-700  dark:text-amber-400  border-amber-200  dark:border-amber-800",
  UNPAID:     "bg-red-50    dark:bg-red-900/30    text-red-700    dark:text-red-400    border-red-200    dark:border-red-800",
  DELINQUENT: "bg-rose-100  dark:bg-rose-900/30   text-rose-800   dark:text-rose-400   border-rose-300   dark:border-rose-800",
  ADVANCE:    "bg-teal-50   dark:bg-teal-900/30   text-teal-700   dark:text-teal-400   border-teal-200   dark:border-teal-800",
  CURRENT:    "bg-sky-50    dark:bg-sky-900/30    text-sky-700    dark:text-sky-400    border-sky-200    dark:border-sky-800",
};

function PropertiesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [properties, setProperties] = useState<Property[]>([]);
  const [total, setTotal] = useState(0);
  const [totals, setTotals] = useState({ assessedValue: 0 });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [barangays, setBarangays] = useState<string[]>([]);
  const [search, setSearch] = useState(() => searchParams.get("search") ?? "");
  const [municipality, setMunicipality] = useState(() => searchParams.get("municipality") ?? "");
  const [barangay, setBarangay] = useState(() => searchParams.get("barangay") ?? "");
  const [type, setType] = useState(() => searchParams.get("type") ?? "");
  const [classCode, setClassCode] = useState(() => searchParams.get("classCode") ?? "");
  const [status, setStatus] = useState(() => searchParams.get("status") ?? "");
  const [checkedFilter, setCheckedFilter] = useState<"" | "true" | "false">(
    () => (searchParams.get("isChecked") as "" | "true" | "false") ?? "false"
  );
  const [page, setPage] = useState(() => Number(searchParams.get("page") ?? 1));
  const [sort, setSort] = useState(() => searchParams.get("sort") ?? "recent");
  const [copiedTdId, setCopiedTdId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const rowRef = useRef<HTMLTableRowElement | null>(null);
  const LIMIT = 25;
  const LAST_VIEWED_KEY = "properties_lastViewed";

  const filterParams = useMemo(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (municipality) params.set("municipality", municipality);
    if (barangay) params.set("barangay", barangay);
    if (type) params.set("type", type);
    if (classCode) params.set("classCode", classCode);
    if (status) params.set("status", status);
    if (checkedFilter) params.set("isChecked", checkedFilter);
    if (sort) params.set("sort", sort);
    return params;
  }, [search, municipality, barangay, type, classCode, status, checkedFilter, sort]);

  // Keep filters and page in the URL so returning from a property restores the list.
  useEffect(() => {
    const params = new URLSearchParams(filterParams);
    if (sort === "recent") params.delete("sort");
    if (page > 1) params.set("page", String(page));
    const query = params.toString();
    router.replace(`/properties${query ? `?${query}` : ""}`, { scroll: false });
  }, [filterParams, page, router, sort]);

  const copyTd = async (id: string, tdNumber: string) => {
    const copied = await copyToClipboard(tdNumber);
    if (!copied) {
      toast("error", "Copy failed");
      return;
    }
    setCopiedTdId(id);
    toast("success", "Copied", tdNumber);
    setTimeout(() => setCopiedTdId(null), 1200);
  };
  const toggleChecked = async (id: string, current: boolean) => {
    setProperties((prev) => prev.map((property) => property.id === id ? { ...property, isChecked: !current } : property));
    await fetch(`/api/properties/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isChecked: !current }),
    });
  };

  const openProperty = async (id: string, isChecked: boolean) => {
    try { sessionStorage.setItem(LAST_VIEWED_KEY, id); } catch { /* ignore */ }
    setHighlightId(id);
    if (localStorage.getItem("prop_autoCheck") === "true" && !isChecked) {
      setProperties((prev) => prev.map((property) => property.id === id ? { ...property, isChecked: true } : property));
      fetch(`/api/properties/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isChecked: true }),
      });
    }
    router.push(`/properties/${id}`);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams(filterParams);
    params.set("page", String(page));
    params.set("limit", String(LIMIT));
    try {
      const response = await fetch(`/api/properties?${params}`);
      if (!response.ok) throw new Error("Could not load properties");
      const data = await response.json();
      setProperties(data.properties ?? []);
      setTotal(data.total ?? 0);
      setTotals(data.totals ?? { assessedValue: 0 });
    } catch {
      setProperties([]);
      setTotal(0);
      setTotals({ assessedValue: 0 });
      toast("error", "Could not load properties", "Please try again.");
    } finally {
      setLoading(false);
    }
  }, [filterParams, page, toast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (municipality) params.set("municipality", municipality);
    fetch(`/api/properties/barangays?${params}`)
      .then((response) => response.json())
      .then((data) => setBarangays(data.barangays ?? []))
      .catch(() => setBarangays([]));
  }, [municipality]);

  useEffect(() => {
    try { setHighlightId(sessionStorage.getItem(LAST_VIEWED_KEY)); } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    if (!loading && rowRef.current) rowRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [loading, properties, highlightId]);
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    setPage(1);
  }, [search, municipality, barangay, type, classCode, status, checkedFilter, sort]);

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const sortCls = (key: string) => `inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200 ${sort === key ? "text-blue-600 dark:text-blue-400 font-bold" : ""}`;
  const activeFilters = [search, municipality, barangay, type, classCode, status].filter(Boolean).length + (checkedFilter !== "false" ? 1 : 0) + (sort !== "recent" ? 1 : 0);

  function clearFilters() {
    setSearch("");
    setMunicipality("");
    setBarangay("");
    setType("");
    setClassCode("");
    setStatus("");
    setCheckedFilter("false");
    setSort("recent");
  }

  const fetchAllForExport = async (): Promise<Property[]> => {
    const all: Property[] = [];
    let expectedTotal = Number.POSITIVE_INFINITY;
    let exportPage = 1;
    while (all.length < expectedTotal) {
      const params = new URLSearchParams(filterParams);
      params.set("page", String(exportPage));
      params.set("limit", "5000");
      const response = await fetch(`/api/properties?${params}`);
      if (!response.ok) throw new Error("Could not export properties");
      const data = await response.json();
      const rows: Property[] = data.properties ?? [];
      all.push(...rows);
      expectedTotal = data.total ?? all.length;
      if (rows.length === 0) break;
      exportPage += 1;
    }
    return all;
  };

  const runExport = async (kind: "excel" | "csv" | "pdf") => {
    setExporting(true);
    try {
      const all = await fetchAllForExport();
      if (all.length === 0) {
        toast("warning", "Nothing to export", "No properties match these filters.");
        return;
      }
      if (kind === "excel") exportToExcel(all);
      if (kind === "csv") exportToCSV(all);
      if (kind === "pdf") exportToPDF(all);
      toast("success", "Exported", `${all.length.toLocaleString()} properties.`);
    } catch {
      toast("error", "Export failed", "Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const sortBy = (key: string) => setSort(key);
  return (
    <div className="animate-fade-in space-y-5">
      <PageHeader
        title="Properties"
        subtitle={`${total.toLocaleString()} propert${total === 1 ? "y" : "ies"} · ${formatCurrency(totals.assessedValue)} assessed`}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => runExport("excel")} loading={exporting}>
              <FileSpreadsheet size={14} /> Excel
            </Button>
            <Button variant="secondary" size="sm" onClick={() => runExport("csv")} loading={exporting}>
              <FileDown size={14} /> CSV
            </Button>
            <Button variant="secondary" size="sm" onClick={() => runExport("pdf")} loading={exporting}>
              <FileText size={14} /> PDF
            </Button>
            <Button size="sm" onClick={() => router.push("/properties/new")}>
              <Plus size={14} /> Add Manual
            </Button>
          </>
        }
      />

      {/* Filters */}
      <Card>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <Input
              placeholder="Search TD number, barangay, or municipality…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              icon={<Search size={14} />}
            />
          </div>
          <Select value={municipality} onChange={(e) => { setMunicipality(e.target.value); setBarangay(""); }} placeholder="All municipalities">
            {MUNICIPALITIES.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
          <Select value={barangay} onChange={(e) => setBarangay(e.target.value)} placeholder="All barangays" disabled={barangays.length === 0}>
            {barangays.map((name) => <option key={name} value={name}>{name}</option>)}
          </Select>
          <Select value={type} onChange={(e) => setType(e.target.value)} placeholder="All types">
            {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{getPropertyTypeLabel(t as Property["type"])}</option>)}
          </Select>
          <Select value={classCode} onChange={(e) => setClassCode(e.target.value)} placeholder="All classes">
            {["A", "R", "C", "I", "S", "T", "M"].map((code) => <option key={code} value={code}>{classCodeLabel(code)}</option>)}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} placeholder="All statuses">
            {STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
          </Select>
          <Select value={checkedFilter} onChange={(e) => setCheckedFilter(e.target.value as "" | "true" | "false")}>
            <option value="false">Unchecked</option>
            <option value="">All properties</option>
            <option value="true">Checked</option>
          </Select>
          {activeFilters > 0 && (
            <div className="md:col-span-2 lg:col-span-4 flex justify-end">
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X size={14} /> Clear filters
              </Button>
            </div>
          )}
        </div>
      </Card>
      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide">
                {HEADERS.map((h, i) => (
                  <th
                    key={i}
                    className={`px-3 py-3 font-medium whitespace-nowrap
                      ${h.align === "right" ? "text-right" : h.align === "center" ? "text-center" : "text-left"}`}
                  >
                    {h.label === "" ? <Bookmark size={14} className="mx-auto opacity-50" /> : h.sortKey ? (
                      <button className={sortCls(h.sortKey)} onClick={() => sortBy(h.sortKey!)}>
                        {h.label}
                      </button>
                    ) : h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={HEADERS.length} className="text-center py-14">
                    <Loader2 size={24} className="animate-spin text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                    <p className="text-slate-400 text-sm">Loading properties…</p>
                  </td>
                </tr>
              )}
              {!loading && properties.length === 0 && (
                <tr>
                  <td colSpan={HEADERS.length} className="text-center py-14">
                    <Building2 size={36} className="mx-auto mb-3 text-slate-200 dark:text-slate-700" />
                    <p className="text-slate-400 text-base font-medium">No properties found</p>
                    {!search && (
                      <p className="text-slate-400 text-sm mt-1">
                        <Link href="/documents" className="text-blue-600 hover:underline">Upload a PDF</Link>
                        {" "}to get started.
                      </p>
                    )}
                  </td>
                </tr>
              )}
              {properties.map((p) => (
                <tr
                  key={p.id}
                  ref={p.id === highlightId ? rowRef : null}
                  onClick={() => openProperty(p.id, p.isChecked)}
                  className={`group cursor-pointer transition border-b border-slate-100 dark:border-slate-800 ${p.id === highlightId ? "bg-blue-50/80 dark:bg-blue-900/25 ring-1 ring-inset ring-blue-300 dark:ring-blue-700" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"}`}
                >
                  {/* Bookmark */}
                  <td className="px-3 py-2.5 text-center">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleChecked(p.id, p.isChecked); }}
                      title={p.isChecked ? "Mark as unchecked" : "Mark as checked"}
                      className="p-1 rounded transition hover:scale-110"
                    >
                      {p.isChecked
                        ? <BookmarkCheck size={16} className="text-amber-500" />
                        : <Bookmark size={16} className="text-slate-300 dark:text-slate-600 group-hover:text-slate-400 dark:group-hover:text-slate-500 transition-colors" />}
                    </button>
                  </td>

                  {/* TD Number — click to copy */}
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <button
                      onClick={(e) => { e.stopPropagation(); copyTd(p.id, p.tdNumber); }}
                      title="Click to copy TD Number"
                      className="flex items-center gap-1.5 font-mono font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors group/td"
                    >
                      {copiedTdId === p.id
                        ? <Check size={14} className="text-green-500 shrink-0" />
                        : <Copy size={13} className="opacity-0 group-hover/td:opacity-60 shrink-0 transition-opacity" />}
                      {p.tdNumber}
                    </button>
                  </td>

                  {/* Municipality */}
                  <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    {p.municipality ?? <span className="text-slate-300 dark:text-slate-600">—</span>}
                  </td>

                  {/* Barangay */}
                  <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">
                    {p.barangay ?? <span className="text-slate-300 dark:text-slate-600">—</span>}
                  </td>

                  {/* Class / type */}
                  <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                    {classCodeLabel(p.class)} · {getPropertyTypeLabel(p.type)}
                  </td>

                  {/* Market Value */}
                  <td className="px-3 py-2.5 text-right text-slate-600 dark:text-slate-400 font-medium tabular-nums whitespace-nowrap">
                    {formatCurrency(p.marketValue as unknown as number)}
                  </td>

                  {/* Assessed Value */}
                  <td className="px-3 py-2.5 text-right text-slate-800 dark:text-slate-100 font-semibold tabular-nums whitespace-nowrap">
                    {formatCurrency(p.assessedValue as unknown as number)}
                  </td>

                  {/* Payment Status */}
                  <td className="px-3 py-2.5 text-center">
                    <span className={`inline-flex px-3 py-1 rounded-full text-sm font-bold border ${STATUS_VARIANT[p.paymentStatus] ?? getPaymentStatusColor(p.paymentStatus)}`}>
                      {p.paymentStatus}
                    </span>
                  </td>

                  {/* Paid Up To */}
                  <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {(() => {
                      const lp = p.payments?.[0] as { year?: number; quarter?: number } | undefined;
                      const year    = lp?.year    ?? p.paidUpToYear;
                      const quarter = lp?.quarter ?? p.paidUpToQuarter;
                      return formatQuarter(year, quarter) ?? <span className="text-slate-300 dark:text-slate-600">—</span>;
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-800 text-sm">
            <span className="text-slate-500 dark:text-slate-400">Page {page} of {totalPages}</span>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft size={14} /> Prev
              </Button>
              <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

export default function PropertiesPageWrapper() {
  return (
    <Suspense>
      <PropertiesPage />
    </Suspense>
  );
}
