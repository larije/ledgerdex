"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2, CheckCircle2, AlertTriangle, FileWarning,
  PlusCircle, RefreshCw, Archive, RotateCcw, X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/layout/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency, formatDate } from "@/lib/utils";
import { classCodeLabel, RPU_TYPE_LABELS, formatDelinquentPeriod } from "@/lib/delinquency";
import { ParsedDelinquencyDoc, ReconcilePreview } from "@/types";

interface PreviewResponse {
  storedName: string;
  originalName: string;
  fileSize: number;
  doc: ParsedDelinquencyDoc;
  preview: ReconcilePreview;
  existingListId: string | null;
}

function StatCard({
  label, value, tone = "default", icon: Icon,
}: {
  label: string; value: number | string;
  tone?: "default" | "success" | "warning" | "danger" | "info";
  icon: React.ElementType;
}) {
  const tones: Record<string, string> = {
    default: "text-slate-600 bg-slate-100 dark:bg-slate-700",
    success: "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30",
    warning: "text-amber-600 bg-amber-50 dark:bg-amber-900/30",
    danger: "text-red-600 bg-red-50 dark:bg-red-900/30",
    info: "text-blue-600 bg-blue-50 dark:bg-blue-900/30",
  };
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200/70 dark:border-slate-700 p-3.5">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${tones[tone]}`}>
        <Icon size={16} />
      </div>
      <div className="min-w-0">
        <p className="text-lg font-bold text-gray-900 dark:text-slate-100 leading-none">{value}</p>
        <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">{label}</p>
      </div>
    </div>
  );
}

export default function ImportDelinquencyPage() {
  const router = useRouter();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [data, setData] = useState<PreviewResponse | null>(null);

  const upload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast("error", "PDF only", "Please choose a .pdf file.");
      return;
    }
    setBusy(true);
    setData(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/delinquencies/import/preview", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) {
        toast("error", "Could not read file", body.error ?? "Parsing failed.");
        return;
      }
      setData(body);
      toast("success", "Parsed", `${body.preview.rowsParsed} accounts read from ${body.doc.municipality}.`);
    } catch {
      toast("error", "Network error", "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!data) return;
    setCommitting(true);
    try {
      const res = await fetch("/api/delinquencies/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storedName: data.storedName,
          originalName: data.originalName,
          fileSize: data.fileSize,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast("error", "Import failed", body.error ?? "Please try again.");
        return;
      }
      toast("success", "Imported", `${data.doc.municipality} list updated.`);
      router.push(`/delinquencies/${body.listId}`);
    } catch {
      toast("error", "Network error", "Please try again.");
    } finally {
      setCommitting(false);
    }
  };

  const p = data?.preview;

  return (
    <div className="animate-fade-in space-y-5">
      <PageHeader
        title="Import Delinquency List"
        subtitle="Upload a Consolidated Summary of Delinquent Real Properties (RA 7160 §254) PDF"
      />

      {!data && (
        <>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) upload(e.dataTransfer.files[0]); }}
            onClick={() => !busy && fileRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition ${
              dragOver ? "border-red-500 bg-red-50 dark:bg-red-900/20" : "border-slate-300 dark:border-slate-600 hover:border-red-400 hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
          >
            {busy ? (
              <>
                <Loader2 size={30} className="mx-auto mb-3 text-red-500 animate-spin" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Reading PDF…</p>
              </>
            ) : (
              <>
                <FileWarning size={30} className={`mx-auto mb-3 ${dragOver ? "text-red-500" : "text-slate-400"}`} />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Drop the delinquency summary PDF here, or click to choose</p>
                <p className="text-xs text-slate-400 mt-1">Nothing is saved until you review and confirm the import.</p>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            />
          </div>
        </>
      )}

      {data && p && (
        <>
          {/* Summary header */}
          <Card>
            <CardContent>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100">{data.doc.municipality}</h2>
                    <Badge variant={p.listExists ? "info" : "success"}>
                      {p.listExists ? "Updates existing list" : "New list"}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
                    {data.doc.province}
                    {data.doc.asOfDate ? ` · as of ${formatDate(data.doc.asOfDate)}` : ""}
                    {` · ${data.originalName}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Total amount due</p>
                  <p className="text-2xl font-bold text-red-600">{formatCurrency(p.totalAmountDue)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mt-5">
                <StatCard label="Rows parsed" value={p.rowsParsed} icon={CheckCircle2} tone="info" />
                <StatCard label="New accounts" value={p.added} icon={PlusCircle} tone="success" />
                <StatCard label="Updated" value={p.updated} icon={RefreshCw} tone="default" />
                <StatCard label="Resolved (dropped)" value={p.resolved} icon={Archive} tone="warning" />
                <StatCard label="Settled reappeared" value={p.reappeared} icon={RotateCcw} tone={p.reappeared ? "danger" : "default"} />
                <StatCard label="Unreadable rows" value={p.rowErrors} icon={AlertTriangle} tone={p.rowErrors ? "warning" : "default"} />
              </div>

              {p.reappeared > 0 && (
                <div className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-300">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <span>{p.reappeared} account(s) you previously marked <b>Settled</b> appear again on this newer list. They will stay Settled — review them afterward.</span>
                </div>
              )}

              <div className="flex items-center gap-2 mt-5">
                <Button onClick={confirm} loading={committing}>
                  <CheckCircle2 size={15} /> Confirm Import
                </Button>
                <Button variant="secondary" onClick={() => setData(null)} disabled={committing}>
                  <X size={15} /> Cancel
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Parsed rows preview */}
          <Card>
            <div className="px-5 py-3 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700 dark:text-slate-200">
                Parsed accounts <span className="text-gray-400 font-normal">({data.doc.rows.length})</span>
              </p>
              {data.doc.rows.length > 300 && (
                <span className="text-xs text-gray-400">showing first 300</span>
              )}
            </div>
            <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-500 uppercase tracking-wide">
                  <tr>
                    <th className="text-right px-3 py-2 font-medium">#</th>
                    <th className="text-left px-3 py-2 font-medium">TD No.</th>
                    <th className="text-left px-3 py-2 font-medium">Barangay</th>
                    <th className="text-left px-3 py-2 font-medium">Class</th>
                    <th className="text-left px-3 py-2 font-medium">Type</th>
                    <th className="text-left px-3 py-2 font-medium">Taxpayer</th>
                    <th className="text-left px-3 py-2 font-medium">Cadastral</th>
                    <th className="text-left px-3 py-2 font-medium">Delinquent</th>
                    <th className="text-right px-3 py-2 font-medium">Amount Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.doc.rows.slice(0, 300).map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-3 py-1.5 text-right text-slate-400 tabular-nums">{r.rowNo ?? i + 1}</td>
                      <td className="px-3 py-1.5 font-mono text-slate-700 dark:text-slate-300">{r.tdNumber}</td>
                      <td className="px-3 py-1.5 text-slate-600 dark:text-slate-400">{r.barangay ?? "—"}</td>
                      <td className="px-3 py-1.5 text-slate-600 dark:text-slate-400">{classCodeLabel(r.classCode)}</td>
                      <td className="px-3 py-1.5 text-slate-600 dark:text-slate-400">{RPU_TYPE_LABELS[r.rpuType]}</td>
                      <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300 max-w-[240px] truncate">{r.taxpayerName}</td>
                      <td className="px-3 py-1.5 text-slate-600 dark:text-slate-400">{r.cadastralLotNo ?? "—"}</td>
                      <td className="px-3 py-1.5 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {formatDelinquentPeriod(r.delinquentFromYear, r.delinquentFromQuarter, r.delinquentToYear, r.delinquentToQuarter)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-medium text-slate-800 dark:text-slate-200">{formatCurrency(r.amountDue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {data.doc.rowErrors.length > 0 && (
            <Card>
              <div className="px-5 py-3 border-b border-gray-100 dark:border-slate-700">
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                  {data.doc.rowErrors.length} row(s) could not be read
                </p>
              </div>
              <CardContent className="space-y-1 max-h-52 overflow-y-auto">
                {data.doc.rowErrors.slice(0, 40).map((e, i) => (
                  <p key={i} className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
                    {e.reason}: {e.raw}
                  </p>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
