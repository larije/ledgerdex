"use client";
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Loader2, Upload, ListFilter, Trash2, FileClock, Building2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/layout/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { SETTLEMENT_STATUS_LABELS, SETTLEMENT_STATUS_VARIANT } from "@/lib/delinquency";
import { DelinquencyList, DelinquencyImport, SettlementStatus } from "@/types";

interface ListResponse {
  list: DelinquencyList & { imports: DelinquencyImport[]; _count: { accounts: number } };
  byStatus: { status: SettlementStatus; _count: { _all: number }; _sum: { balance: string | null } }[];
}

export default function ListDetailPage({ params }: { params: Promise<{ listId: string }> }) {
  const { listId } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/delinquencies/lists/${listId}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [listId]);

  useEffect(() => { load(); }, [load]);

  const deleteList = async () => {
    if (!window.confirm("Delete this entire municipal list, including all accounts and settlement records? This cannot be undone.")) return;
    const res = await fetch(`/api/delinquencies/lists/${listId}`, { method: "DELETE" });
    if (res.ok) { toast("success", "List deleted"); router.push("/delinquencies"); }
    else { const d = await res.json().catch(() => ({})); toast("error", "Failed", d.error ?? "Not authorized."); }
  };

  if (loading) return <div className="py-20 text-center"><Loader2 className="animate-spin text-slate-400 mx-auto" /></div>;
  if (!data) return <div className="py-20 text-center text-slate-400">List not found.</div>;

  const { list, byStatus } = data;
  const due = Number(list.totalAmountDue), settled = Number(list.totalSettled);

  return (
    <div className="animate-fade-in space-y-5">
      <Link href="/delinquencies" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400">
        <ArrowLeft size={15} /> Back to Delinquencies
      </Link>

      <PageHeader
        title={list.municipality}
        subtitle={`${list.province}${list.asOfDate ? ` · as of ${formatDate(list.asOfDate)}` : ""}${list.lastImportedAt ? ` · last imported ${formatDate(list.lastImportedAt)}` : ""}`}
        actions={
          <>
            <Link href="/delinquencies/accounts"><Button variant="secondary" size="sm"><ListFilter size={14} /> View Accounts</Button></Link>
            <Link href="/delinquencies/import"><Button size="sm"><Upload size={14} /> Import Newer</Button></Link>
          </>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card><CardContent><div className="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-wide"><Building2 size={13} /> Accounts</div><p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{list.accountCount.toLocaleString()}</p></CardContent></Card>
        <Card><CardContent><p className="text-xs uppercase tracking-wide text-slate-400">Total Amount Due</p><p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{formatCurrency(due)}</p></CardContent></Card>
        <Card><CardContent><p className="text-xs uppercase tracking-wide text-slate-400">Collected</p><p className="text-2xl font-bold text-emerald-600 mt-1">{formatCurrency(settled)}</p></CardContent></Card>
        <Card><CardContent><p className="text-xs uppercase tracking-wide text-slate-400">Outstanding</p><p className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(due - settled)}</p></CardContent></Card>
      </div>

      {/* Status breakdown */}
      <Card>
        <CardHeader><CardTitle>Status Breakdown</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {byStatus.length === 0 && <p className="text-sm text-slate-400">No accounts.</p>}
          {byStatus.map((s) => (
            <div key={s.status} className="flex items-center gap-3 rounded-xl border border-gray-200/70 dark:border-slate-700 px-4 py-3">
              <Badge variant={SETTLEMENT_STATUS_VARIANT[s.status]} dot>{SETTLEMENT_STATUS_LABELS[s.status]}</Badge>
              <div>
                <p className="text-lg font-bold text-slate-900 dark:text-slate-100 leading-none">{s._count._all}</p>
                <p className="text-xs text-slate-400 mt-0.5">{formatCurrency(Number(s._sum.balance ?? 0))} bal.</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Import history */}
      <Card>
        <CardHeader className="flex items-center gap-2"><FileClock size={16} className="text-slate-400" /><CardTitle>Import History</CardTitle></CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-500 text-xs uppercase tracking-wide">
                <th className="text-left px-5 py-2.5 font-medium">Date</th>
                <th className="text-left px-3 py-2.5 font-medium">File</th>
                <th className="text-right px-3 py-2.5 font-medium">Parsed</th>
                <th className="text-right px-3 py-2.5 font-medium">Added</th>
                <th className="text-right px-3 py-2.5 font-medium">Updated</th>
                <th className="text-right px-3 py-2.5 font-medium">Resolved</th>
                <th className="text-right px-3 py-2.5 font-medium">Errors</th>
                <th className="text-left px-3 py-2.5 font-medium">By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {list.imports.length === 0 && (
                <tr><td colSpan={8} className="text-center py-8 text-slate-400 text-sm">No imports recorded.</td></tr>
              )}
              {list.imports.map((imp) => (
                <tr key={imp.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-5 py-2.5 text-slate-600 dark:text-slate-300 text-xs">{formatDateTime(imp.createdAt)}</td>
                  <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400 text-xs max-w-[220px] truncate">{imp.fileName}</td>
                  <td className="px-3 py-2.5 text-right text-slate-700 dark:text-slate-300">{imp.rowsParsed}</td>
                  <td className="px-3 py-2.5 text-right text-emerald-600">{imp.rowsAdded}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600 dark:text-slate-400">{imp.rowsUpdated}</td>
                  <td className="px-3 py-2.5 text-right text-amber-600">{imp.rowsResolved}</td>
                  <td className="px-3 py-2.5 text-right text-slate-400">{imp.rowErrors}</td>
                  <td className="px-3 py-2.5 text-slate-500 text-xs">{imp.importedBy?.name ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button variant="danger" size="sm" onClick={deleteList}><Trash2 size={14} /> Delete List</Button>
      </div>
    </div>
  );
}
