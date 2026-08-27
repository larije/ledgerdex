"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { use } from "react";
import {
  ArrowLeft, RefreshCw, ExternalLink, AlertTriangle,
  CheckCircle2, FileText, Building2, RotateCcw, Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/layout/PageHeader";
import { Document, Property } from "@/types";
import { formatCurrency, formatDate, formatFileSize, getPaymentStatusColor, getPropertyTypeLabel } from "@/lib/utils";

interface DocumentWithProperties extends Document {
  properties: (Property & { _count: { remarks: number; payments: number } })[];
}

export default function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [doc, setDoc]         = useState<DocumentWithProperties | null>(null);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [confirmModal, setConfirmModal] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const [extractResult, setExtractResult] = useState<{ created: number; updated: number; skipped: number } | null>(null);
  const [extractError, setExtractError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res  = await fetch(`/api/documents/${id}`);
    const data = await res.json();
    setDoc(data.document ?? null);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const runExtraction = async () => {
    setConfirmModal(false);
    setExtracting(true);
    setExtractError("");
    try {
      const res  = await fetch(`/api/documents/${id}/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overwrite }),
      });
      const data = await res.json();
      if (!res.ok) {
        setExtractError(data.error ?? "Extraction failed. Please try again.");
      } else if (data.results) {
        const created = data.results.filter((r: { action: string }) => r.action === "created").length;
        const updated = data.results.filter((r: { action: string }) => r.action === "updated").length;
        const skipped = data.results.filter((r: { action: string }) => r.action === "skipped").length;
        setExtractResult({ created, updated, skipped });
      }
    } catch {
      setExtractError("Network error. Please try again.");
    } finally {
      setExtracting(false);
      load();
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={24} className="animate-spin text-slate-400" />
    </div>
  );

  if (!doc) return <p className="text-slate-500">Document not found.</p>;

  return (
    <div className="animate-fade-in space-y-5">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/documents" className="hover:text-slate-800 flex items-center gap-1">
          <ArrowLeft size={14} /> Documents
        </Link>
        <span>/</span>
        <span className="text-slate-800 font-medium truncate max-w-xs">{doc.originalName}</span>
      </div>

      <PageHeader
        title={doc.originalName}
        subtitle={doc.taxpayerName ? `Taxpayer: ${doc.taxpayerName}` : undefined}
        actions={
          <>
            <a
              href={`/api/documents/${id}/view`}
              target="_blank"
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50 transition"
            >
              <ExternalLink size={14} /> Open PDF
            </a>
            <Button
              size="sm"
              onClick={() => setConfirmModal(true)}
              loading={extracting}
              disabled={doc.extractionStatus === "PROCESSING"}
            >
              <RotateCcw size={14} />
              {doc.extractionStatus === "COMPLETED" ? "Re-extract" : "Extract Properties"}
            </Button>
            <Button variant="secondary" size="sm" onClick={load}>
              <RefreshCw size={14} /> Refresh
            </Button>
          </>
        }
      />

      {extractResult && (
        <div className="flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
          <CheckCircle2 size={16} />
          Extraction complete: {extractResult.created} created, {extractResult.updated} updated, {extractResult.skipped} skipped
          <button onClick={() => setExtractResult(null)} className="ml-auto text-green-600 hover:text-green-800">✕</button>
        </div>
      )}
      {extractError && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          <AlertTriangle size={16} />
          {extractError}
          <button onClick={() => setExtractError("")} className="ml-auto text-red-600 hover:text-red-800">✕</button>
        </div>
      )}

      {/* Document Info */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "NOA Count",       value: doc.noaCount ?? "—" },
          { label: "Assessment Year", value: doc.assessmentYear?.toString() ?? "—" },
          { label: "Municipality",    value: doc.municipality ?? "—" },
          { label: "File Size",       value: formatFileSize(doc.fileSize) },
        ].map(({ label, value }) => (
          <Card key={label}>
            <CardContent className="py-3">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="text-sm font-semibold text-slate-800 mt-0.5">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {doc.taxpayerAddress && (
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-slate-500">Taxpayer Address</p>
            <p className="text-sm text-slate-700 mt-0.5">{doc.taxpayerAddress}</p>
          </CardContent>
        </Card>
      )}

      {/* Properties Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">
              Extracted Properties
              <span className="ml-2 text-slate-400 font-normal">({doc.properties.length})</span>
            </h3>
            {doc.extractionStatus === "FAILED" && (
              <div className="flex items-center gap-2 text-xs text-red-600">
                <AlertTriangle size={13} /> Extraction failed
              </div>
            )}
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-y border-slate-200 text-slate-500 uppercase tracking-wide">
                {["TD Number","Property Index","Location","Lot/Block","Class","Type","Market Value","Assessed Value","Effectivity","Taxability","Taxes Begin","Status"].map((h) => (
                  <th key={h} className="text-left px-3 py-2.5 font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {doc.properties.length === 0 && (
                <tr>
                  <td colSpan={12} className="text-center py-10 text-slate-400">
                    {doc.extractionStatus === "PENDING"
                      ? "Click 'Extract Properties' to process this document."
                      : "No properties extracted yet."}
                  </td>
                </tr>
              )}
              {doc.properties.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5">
                    <Link href={`/properties/${p.id}`} className="text-blue-600 hover:underline font-mono">
                      {p.tdNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 font-mono">{p.propertyIndexNo ?? "—"}</td>
                  <td className="px-3 py-2.5 text-slate-600 max-w-[180px] truncate">{p.propertyLocation ?? "—"}</td>
                  <td className="px-3 py-2.5 text-slate-600">{p.lotBlockNo ?? "—"}</td>
                  <td className="px-3 py-2.5 text-slate-600">{p.class ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    <Badge variant="info">{getPropertyTypeLabel(p.type)}</Badge>
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-700 font-medium">{formatCurrency(p.marketValue as unknown as number)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-700 font-medium">{formatCurrency(p.assessedValue as unknown as number)}</td>
                  <td className="px-3 py-2.5 text-slate-600">{p.effectivity ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    <Badge variant={p.taxability === "TAXABLE" ? "info" : "default"}>{p.taxability}</Badge>
                  </td>
                  <td className="px-3 py-2.5 text-slate-600">
                    {p.taxesBeginYear ? `${p.taxesBeginYear} Q${p.taxesBeginQuarter ?? "?"}` : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${getPaymentStatusColor(p.paymentStatus)}`}>
                      {p.paymentStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Extraction Modal */}
      <Modal open={confirmModal} onClose={() => setConfirmModal(false)} title="Extract Properties" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            This will scan the PDF and extract all property rows into the database.
          </p>
          {doc.extractionStatus === "COMPLETED" && doc.extractedCount > 0 && (
            <div className="flex items-start gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <AlertTriangle size={15} className="text-yellow-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-yellow-800">Already extracted {doc.extractedCount} properties</p>
                <label className="flex items-center gap-2 mt-2 text-xs text-yellow-700 cursor-pointer">
                  <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
                  Overwrite existing records with same TD number
                </label>
              </div>
            </div>
          )}
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setConfirmModal(false)}>Cancel</Button>
            <Button onClick={runExtraction} loading={extracting}>
              {extracting ? "Extracting…" : "Run Extraction"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
