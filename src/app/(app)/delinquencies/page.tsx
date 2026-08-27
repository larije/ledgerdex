"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2, Upload, FileWarning, Wallet, Users, CheckCircle2, HandCoins,
  Building2, ArrowRight, TrendingUp, CalendarClock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatCurrency, formatDate } from "@/lib/utils";
import { classCodeLabel, RPU_TYPE_LABELS, formatQuarterPeriod } from "@/lib/delinquency";

interface Stats {
  totals: {
    outstandingBalance: number; activeAccounts: number; settledAccounts: number;
    totalCollected: number; listCount: number;
  };
  lists: {
    id: string; municipality: string; province: string; accountCount: number;
    totalAmountDue: number; totalSettled: number; asOfDate: string | null;
  }[];
  byClass: { classCode: string | null; count: number; balance: number }[];
  byRpuType: { rpuType: string; count: number; balance: number }[];
  byBarangay: { barangay: string | null; count: number; balance: number }[];
  topDelinquents: { id: string; taxpayerName: string; tdNumber: string; balance: number; barangay: string | null; list: { municipality: string } }[];
  oldest: { id: string; taxpayerName: string; tdNumber: string; balance: number; delinquentFromYear: number | null; delinquentFromQuarter: number | null; list: { municipality: string } }[];
}

function Kpi({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: string; tone: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${tone}`}>
          <Icon size={20} />
        </div>
        <div className="min-w-0">
          <p className="text-xl font-bold text-slate-900 dark:text-slate-100 leading-tight truncate">{value}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Bars({ rows }: { rows: { label: string; count: number; balance: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.balance));
  return (
    <div className="space-y-2.5">
      {rows.length === 0 && <p className="text-sm text-slate-400">No data.</p>}
      {rows.map((r, i) => (
        <div key={i}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-600 dark:text-slate-300 truncate">{r.label} <span className="text-slate-400">({r.count})</span></span>
            <span className="text-slate-500 dark:text-slate-400 shrink-0 ml-2">{formatCurrency(r.balance)}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-red-500 to-red-600 rounded-full" style={{ width: `${(r.balance / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function DelinquencyOverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/delinquencies/stats")
      .then((r) => r.json())
      .then((d) => setStats(d))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="py-20 text-center"><Loader2 className="animate-spin text-slate-400 mx-auto" /></div>;

  const t = stats?.totals;
  const noData = !stats || stats.lists.length === 0;

  return (
    <div className="animate-fade-in space-y-5">
      <PageHeader
        title="Delinquencies"
        subtitle="Real properties whose accounts were not settled (RA 7160 §254)"
        actions={
          <Link href="/delinquencies/import"><Button size="sm"><Upload size={14} /> Import List</Button></Link>
        }
      />

      {noData ? (
        <Card>
          <CardContent className="text-center py-16">
            <FileWarning size={40} className="mx-auto text-slate-300 mb-4" />
            <p className="text-slate-600 dark:text-slate-300 font-medium">No delinquency lists yet</p>
            <p className="text-sm text-slate-400 mt-1 mb-5">Import a Consolidated Summary of Delinquent Real Properties PDF to get started.</p>
            <Link href="/delinquencies/import"><Button><Upload size={15} /> Import your first list</Button></Link>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi icon={Wallet} label="Total Outstanding" value={formatCurrency(t!.outstandingBalance)} tone="bg-red-50 text-red-600 dark:bg-red-900/30" />
            <Kpi icon={Users} label="Active Delinquent Accounts" value={t!.activeAccounts.toLocaleString()} tone="bg-amber-50 text-amber-600 dark:bg-amber-900/30" />
            <Kpi icon={CheckCircle2} label="Settled Accounts" value={t!.settledAccounts.toLocaleString()} tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30" />
            <Kpi icon={HandCoins} label="Total Collected" value={formatCurrency(t!.totalCollected)} tone="bg-blue-50 text-blue-600 dark:bg-blue-900/30" />
          </div>

          {/* Lists */}
          <Card>
            <CardHeader><CardTitle>Municipal Lists</CardTitle></CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-500 text-xs uppercase tracking-wide">
                    <th className="text-left px-5 py-2.5 font-medium">Municipality</th>
                    <th className="text-left px-3 py-2.5 font-medium">As of</th>
                    <th className="text-right px-3 py-2.5 font-medium">Accounts</th>
                    <th className="text-right px-3 py-2.5 font-medium">Amount Due</th>
                    <th className="text-right px-3 py-2.5 font-medium">Collected</th>
                    <th className="px-5 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {stats!.lists.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <Building2 size={15} className="text-slate-400" />
                          <span className="font-medium text-slate-800 dark:text-slate-200">{l.municipality}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-slate-500 text-xs">{l.asOfDate ? formatDate(l.asOfDate) : "—"}</td>
                      <td className="px-3 py-3 text-right text-slate-700 dark:text-slate-300">{l.accountCount.toLocaleString()}</td>
                      <td className="px-3 py-3 text-right text-slate-700 dark:text-slate-300">{formatCurrency(Number(l.totalAmountDue))}</td>
                      <td className="px-3 py-3 text-right text-emerald-600">{formatCurrency(Number(l.totalSettled))}</td>
                      <td className="px-5 py-3 text-right">
                        <Link href={`/delinquencies/${l.id}`} className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline">
                          Open <ArrowRight size={12} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Breakdowns */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>Outstanding by Barangay</CardTitle></CardHeader>
              <CardContent>
                <Bars rows={stats!.byBarangay.map((b) => ({ label: b.barangay ?? "—", count: b.count, balance: b.balance }))} />
              </CardContent>
            </Card>
            <div className="space-y-4">
              <Card>
                <CardHeader><CardTitle>By Class</CardTitle></CardHeader>
                <CardContent>
                  <Bars rows={stats!.byClass.map((c) => ({ label: classCodeLabel(c.classCode), count: c.count, balance: c.balance }))} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>By RPU Type</CardTitle></CardHeader>
                <CardContent>
                  <Bars rows={stats!.byRpuType.map((r) => ({ label: RPU_TYPE_LABELS[r.rpuType as keyof typeof RPU_TYPE_LABELS] ?? r.rpuType, count: r.count, balance: r.balance }))} />
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Top + oldest */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="flex items-center gap-2"><TrendingUp size={16} className="text-red-500" /><CardTitle>Largest Delinquents</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {stats!.topDelinquents.map((d) => (
                  <Link key={d.id} href={`/delinquencies/accounts/${d.id}`} className="flex items-center justify-between gap-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg px-2 -mx-2">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-800 dark:text-slate-200 truncate">{d.taxpayerName}</p>
                      <p className="text-xs text-slate-400">{d.list?.municipality} · {d.barangay ?? "—"}</p>
                    </div>
                    <span className="text-sm font-semibold text-red-600 shrink-0">{formatCurrency(Number(d.balance))}</span>
                  </Link>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex items-center gap-2"><CalendarClock size={16} className="text-amber-500" /><CardTitle>Oldest Delinquencies</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {stats!.oldest.map((d) => (
                  <Link key={d.id} href={`/delinquencies/accounts/${d.id}`} className="flex items-center justify-between gap-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg px-2 -mx-2">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-800 dark:text-slate-200 truncate">{d.taxpayerName}</p>
                      <p className="text-xs text-slate-400">{d.list?.municipality} · since {formatQuarterPeriod(d.delinquentFromYear, d.delinquentFromQuarter)}</p>
                    </div>
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 shrink-0">{formatCurrency(Number(d.balance))}</span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
