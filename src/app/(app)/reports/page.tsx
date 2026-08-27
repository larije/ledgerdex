"use client";
import { useCallback, useEffect, useState } from "react";
import { Download, Filter, FileSpreadsheet, FileText, Table2, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { PageHeader } from "@/components/layout/PageHeader";
import { Document, Property } from "@/types";
import { exportToCSV, exportToExcelStyled, exportToPDF } from "@/lib/export";
import { formatCurrency, MUNICIPALITIES } from "@/lib/utils";

export default function ReportsPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [documents, setDocuments]   = useState<Document[]>([]);
  const [loading, setLoading]       = useState(true);
  const [total, setTotal]           = useState(0);

  const [municipality, setMunicipality] = useState("");
  const [status, setStatus]             = useState("");
  const [type, setType]                 = useState("");
  const [taxability, setTaxability]     = useState("");
  const [year, setYear]                 = useState("");
  const [documentId, setDocumentId]     = useState("");

  useEffect(() => {
    fetch("/api/documents?limit=200")
      .then((r) => r.json())
      .then((d) => setDocuments(d.documents ?? []))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: "1", limit: "1000" });
    if (municipality) params.set("municipality", municipality);
    if (status)       params.set("status",       status);
    if (type)         params.set("type",         type);
    if (taxability)   params.set("taxability",   taxability);
    if (year)         params.set("effectivity",  year);
    if (documentId)   params.set("documentId",   documentId);
    const res  = await fetch(`/api/properties?${params}`);
    const data = await res.json();
    setProperties(data.properties ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [municipality, status, type, taxability, year, documentId]);

  useEffect(() => { load(); }, [load]);

  const totalAssessed = properties.reduce((s, p) => s + Number(p.assessedValue ?? 0), 0);

  return (
    <div className="animate-fade-in space-y-5">
      <PageHeader
        title="Reports & Export"
        subtitle="Generate and export property tax reports"
      />

      {/* Filters */}
      <Card>
        <CardHeader><h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Filter size={14} /> Filter Records</h3></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <Select label="Source Document" value={documentId} onChange={(e) => setDocumentId(e.target.value)} placeholder="All Documents">
              {documents.map((d) => (
                <option key={d.id} value={d.id}>{d.originalName}</option>
              ))}
            </Select>
            <Select label="Municipality" value={municipality} onChange={(e) => setMunicipality(e.target.value)} placeholder="All">
              {MUNICIPALITIES.map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
            <Select label="Payment Status" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="All">
              {["PAID","PARTIAL","UNPAID","DELINQUENT","ADVANCE","CURRENT"].map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
            <Select label="Type" value={type} onChange={(e) => setType(e.target.value)} placeholder="All">
              {["LAND","BLDG","MACH","MISC"].map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
            <Select label="Taxability" value={taxability} onChange={(e) => setTaxability(e.target.value)} placeholder="All">
              <option value="TAXABLE">Taxable</option>
              <option value="EXEMPT">Exempt</option>
            </Select>
            <Select label="Effectivity Year" value={year} onChange={(e) => setYear(e.target.value)} placeholder="All Years">
              {[2020,2021,2022,2023,2024,2025,2026].map((y) => <option key={y} value={y}>{y}</option>)}
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Records",      value: total.toLocaleString() },
          { label: "Total Assessed Value", value: formatCurrency(totalAssessed) },
          { label: "Taxable Count",      value: properties.filter((p) => p.taxability === "TAXABLE").length.toLocaleString() },
        ].map(({ label, value }) => (
          <Card key={label}>
            <CardContent className="py-4 text-center">
              <p className="text-2xl font-bold text-slate-800">{value}</p>
              <p className="text-xs text-slate-500 mt-1">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Export Buttons */}
      <Card>
        <CardHeader><h3 className="text-sm font-semibold text-slate-700">Export Options</h3></CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Export to Excel (.xlsx)", icon: FileSpreadsheet, fn: () => {
                  const params: Record<string, string> = {};
                  if (municipality) params.municipality = municipality;
                  if (status)       params.status       = status;
                  if (type)         params.type         = type;
                  if (taxability)   params.taxability   = taxability;
                  if (year)         params.effectivity  = year;
                  if (documentId)   params.documentId   = documentId;
                  exportToExcelStyled(params).catch(console.error);
                }, color: "text-green-700 border-green-200 hover:bg-green-50" },
              { label: "Export to CSV (.csv)",    icon: Table2,          fn: () => exportToCSV(properties, "ledgerdex-properties.csv"),   color: "text-blue-700 border-blue-200 hover:bg-blue-50" },
              { label: "Export to PDF (.pdf)",    icon: FileText,        fn: () => exportToPDF(properties, "ledgerdex-properties.pdf"),   color: "text-red-700 border-red-200 hover:bg-red-50" },
            ].map(({ label, icon: Icon, fn, color }) => (
              <button
                key={label}
                onClick={fn}
                disabled={loading || properties.length === 0}
                className={`flex flex-col items-center gap-3 p-6 border rounded-xl transition disabled:opacity-50 ${color}`}
              >
                <Icon size={28} />
                <span className="text-sm font-medium">{label}</span>
                <span className="text-xs opacity-60">{properties.length} records</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-slate-400 mr-2" />
          <span className="text-sm text-slate-500">Loading records…</span>
        </div>
      )}
    </div>
  );
}
