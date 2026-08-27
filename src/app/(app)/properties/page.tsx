"use client";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search, Plus, Download, Filter, Loader2, Building2,
  ChevronLeft, ChevronRight, ChevronDown, X, Copy, Check, Bookmark, BookmarkCheck,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Property } from "@/types";
import {
  formatCurrency, formatQuarter,
  getPaymentStatusColor, getPropertyTypeLabel, MUNICIPALITIES,
} from "@/lib/utils";
import { exportToCSV, exportToExcel, exportToPDF } from "@/lib/export";

const PROPERTY_TYPES = ["LAND", "BLDG", "MACH", "MISC"];
const STATUSES       = ["PAID", "PARTIAL", "UNPAID", "DELINQUENT", "ADVANCE", "CURRENT"];

const HEADERS = [
  { label: "",                align: "center" },
  { label: "TD Number",       align: "left"  },
  { label: "Municipality",    align: "left"  },
  { label: "Barangay",        align: "left"  },
  { label: "Type",            align: "left"  },
  { label: "Market Value",    align: "right" },
  { label: "Assessed Value",  align: "right" },
  { label: "Payment Status",  align: "center"},
  { label: "Paid Up To",      align: "left"  },
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
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [properties, setProperties] = useState<Property[]>([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(true);

  const [search,       setSearch]       = useState(() => searchParams.get("search")       ?? "");
  const [municipality, setMunicipality] = useState(() => searchParams.get("municipality") ?? "");
  const [type,         setType]         = useState(() => searchParams.get("type")         ?? "");
  const [status,       setStatus]       = useState(() => searchParams.get("status")       ?? "");
  const [checkedFilter, setCheckedFilter] = useState<"" | "true" | "false">(
    () => (searchParams.get("isChecked") as "" | "true" | "false") ?? "false"
  );
  const [page, setPage] = useState(() => Number(searchParams.get("page") ?? 1));
  const [showFilters, setShowFilters]     = useState(
    () => !!(searchParams.get("municipality") || searchParams.get("type") || searchParams.get("status"))
  );
  const [focusedFilter, setFocusedFilter] = useState<string | null>(null);
  const [copiedTdId, setCopiedTdId]       = useState<string | null>(null);

  // Keep URL in sync with filter state so back-navigation restores them
  useEffect(() => {
    const params = new URLSearchParams();
    if (search)                    params.set("search",       search);
    if (municipality)              params.set("municipality", municipality);
    if (type)                      params.set("type",         type);
    if (status)                    params.set("status",       status);
    if (checkedFilter !== "false") params.set("isChecked",    checkedFilter);
    if (page > 1)                  params.set("page",         String(page));
    const qs = params.toString();
    router.replace(`/properties${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [search, municipality, type, status, checkedFilter, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const copyTd = (id: string, tdNumber: string) => {
    navigator.clipboard.writeText(tdNumber);
    setCopiedTdId(id);
    setTimeout(() => setCopiedTdId(null), 1500);
  };

  const toggleChecked = async (id: string, current: boolean) => {
    setProperties((prev) => prev.map((p) => p.id === id ? { ...p, isChecked: !current } : p));
    await fetch(`/api/properties/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isChecked: !current }),
    });
  };

  const openProperty = async (id: string, isChecked: boolean) => {
    if (localStorage.getItem("prop_autoCheck") === "true" && !isChecked) {
      setProperties((prev) => prev.map((p) => p.id === id ? { ...p, isChecked: true } : p));
      fetch(`/api/properties/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isChecked: true }),
      });
    }
    router.push(`/properties/${id}`);
  };

  const LIMIT = 25;

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (search)         params.set("search",       search);
    if (municipality)   params.set("municipality", municipality);
    if (type)           params.set("type",         type);
    if (status)         params.set("status",       status);
    if (checkedFilter)  params.set("isChecked",    checkedFilter);
    const res  = await fetch(`/api/properties?${params}`);
    if (!res.ok) { setLoading(false); return; }
    const data = await res.json();
    setProperties(data.properties ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [search, municipality, type, status, checkedFilter, page]);

  useEffect(() => { load(); }, [load]);

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    setPage(1);
  }, [search, municipality, type, status, checkedFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages   = Math.ceil(total / LIMIT);
  const activeFilters = [municipality, type, status].filter(Boolean).length;

  function clearFilters() {
    setMunicipality("");
    setType("");
    setStatus("");
  }

  return (
    <div className="animate-fade-in space-y-3">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Properties</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {total.toLocaleString()} record{total !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm border transition font-medium
              ${showFilters
                ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-700"
                : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500"}`}
          >
            <Filter size={15} />
            Filters
            {activeFilters > 0 && (
              <span className="ml-0.5 bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                {activeFilters}
              </span>
            )}
            <ChevronDown size={14} className="transition-transform duration-200" style={{ transform: showFilters ? "rotate(180deg)" : "rotate(0deg)" }} />
          </button>

          <div className="relative group">
            <button className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500 transition font-medium">
              <Download size={15} />
              Export
              <ChevronDown size={14} className="transition-transform duration-200 group-hover:rotate-180" />
            </button>
            <div className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg dark:shadow-slate-900/50 z-20 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
              <div className="p-1">
                {[
                  { label: "Export Excel", fn: () => exportToExcel(properties) },
                  { label: "Export CSV",   fn: () => exportToCSV(properties)   },
                  { label: "Export PDF",   fn: () => exportToPDF(properties)   },
                ].map(({ label, fn }) => (
                  <button key={label} onClick={fn}
                    className="block w-full text-left px-3 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg">
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <Link href="/properties/new">
            <button className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-700 transition font-semibold">
              <Plus size={15} />
              Add Manual
            </button>
          </Link>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Search by TD number, barangay, municipality…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 text-base rounded-xl border border-slate-200 bg-white text-slate-800 placeholder:text-slate-400
            focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition"
        />
        {search && (
          <button onClick={() => setSearch("")}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <X size={15} />
          </button>
        )}
      </div>

      {/* Checked filter pills */}
      <div className="flex items-center gap-1.5">
        {(["", "false", "true"] as const).map((val) => {
          const label = val === "" ? "All" : val === "false" ? "Unchecked" : "Checked";
          const active = checkedFilter === val;
          return (
            <button
              key={val}
              onClick={() => setCheckedFilter(val)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium border transition
                ${active
                  ? val === "true"
                    ? "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700"
                    : "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-700"
                  : "bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500"}`}
            >
              {val === "true" && <BookmarkCheck size={13} />}
              {val === "false" && <Bookmark size={13} />}
              {label}
            </button>
          );
        })}
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Filter by</p>
            {activeFilters > 0 && (
              <button onClick={clearFilters}
                className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                <X size={13} /> Clear all
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              {
                label: "Municipality", value: municipality, onChange: setMunicipality,
                placeholder: "All Municipalities",
                options: MUNICIPALITIES.map((m) => ({ value: m, label: m })),
              },
              {
                label: "Property Type", value: type, onChange: setType,
                placeholder: "All Types",
                options: PROPERTY_TYPES.map((t) => ({ value: t, label: getPropertyTypeLabel(t as Property["type"]) })),
              },
              {
                label: "Payment Status", value: status, onChange: setStatus,
                placeholder: "All Statuses",
                options: STATUSES.map((s) => ({ value: s, label: s })),
              },
            ].map(({ label, value, onChange, placeholder, options }) => (
              <div key={label}>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">{label}</label>
                <div className="relative">
                  <select
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onFocus={() => setFocusedFilter(label)}
                    onBlur={() => setFocusedFilter(null)}
                    className="w-full px-3 py-2 pr-8 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200
                      focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition appearance-none"
                  >
                    <option value="">{placeholder}</option>
                    {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <ChevronDown
                    size={14}
                    className="pointer-events-none absolute right-2.5 top-1/2 text-slate-400 transition-transform duration-200"
                    style={{ transform: focusedFilter === label ? "translateY(-50%) rotate(180deg)" : "translateY(-50%) rotate(0deg)" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[15px]">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                {HEADERS.map((h, i) => (
                  <th
                    key={i}
                    className={`px-4 py-3 text-sm font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap bg-slate-50 dark:bg-slate-800
                      ${h.align === "right" ? "text-right" : h.align === "center" ? "text-center" : "text-left"}`}
                  >
                    {h.label === "" ? <Bookmark size={14} className="mx-auto opacity-50" /> : h.label}
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
              {properties.map((p, i) => (
                <tr
                  key={p.id}
                  onClick={() => openProperty(p.id, p.isChecked)}
                  className={`group cursor-pointer transition-colors border-b border-slate-100 dark:border-slate-700/60 last:border-0
                    hover:bg-blue-50/50 dark:hover:bg-blue-950/40
                    ${i % 2 === 0 ? "bg-white dark:bg-slate-900" : "bg-slate-50/60 dark:bg-slate-800/40"}`}
                >
                  {/* Bookmark */}
                  <td className="px-3 py-3 text-center">
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
                  <td className="px-4 py-3 whitespace-nowrap">
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
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    {p.municipality ?? <span className="text-slate-300 dark:text-slate-600">—</span>}
                  </td>

                  {/* Barangay */}
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    {p.barangay ?? <span className="text-slate-300 dark:text-slate-600">—</span>}
                  </td>

                  {/* Type */}
                  <td className="px-4 py-3">
                    <Badge variant="info">{getPropertyTypeLabel(p.type)}</Badge>
                  </td>

                  {/* Market Value */}
                  <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-400 font-medium tabular-nums whitespace-nowrap">
                    {formatCurrency(p.marketValue as unknown as number)}
                  </td>

                  {/* Assessed Value */}
                  <td className="px-4 py-3 text-right text-slate-800 dark:text-slate-100 font-semibold tabular-nums whitespace-nowrap">
                    {formatCurrency(p.assessedValue as unknown as number)}
                  </td>

                  {/* Payment Status */}
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex px-3 py-1 rounded-full text-sm font-bold border ${STATUS_VARIANT[p.paymentStatus] ?? getPaymentStatusColor(p.paymentStatus)}`}>
                      {p.paymentStatus}
                    </span>
                  </td>

                  {/* Paid Up To */}
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
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
          <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/50">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Showing{" "}
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {((page - 1) * LIMIT) + 1}–{Math.min(page * LIMIT, total)}
              </span>{" "}
              of{" "}
              <span className="font-semibold text-slate-700 dark:text-slate-200">{total.toLocaleString()}</span>
            </p>
            <div className="flex items-center gap-1.5">
              <button
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800
                  text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition font-medium"
              >
                <ChevronLeft size={14} /> Prev
              </button>
              <span className="text-sm text-slate-500 dark:text-slate-400 px-2 font-medium">
                {page} / {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800
                  text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition font-medium"
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
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
