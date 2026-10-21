"use client";
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Loader2, PlusCircle, Trash2, Save, Receipt, Copy, MoreHorizontal,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { EtracsPaymentHistoryCard } from "@/components/etracs/EtracsPaymentHistoryCard";
import { formatCurrency, formatDate, copyToClipboard } from "@/lib/utils";
import {
  RPU_TYPE_LABELS, classCodeLabel, formatDelinquentPeriod,
  getAccountDisplayStatus, getEtracsStatusForBalance, getSettlementStatusForBalance,
  SETTLEMENT_STATUS_LABELS, SETTLEMENT_STATUS_VARIANT,
} from "@/lib/delinquency";
import { DelinquentAccount } from "@/types";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium leading-5 text-slate-800 dark:text-slate-200">{value ?? "—"}</p>
    </div>
  );
}

function FinancialMetric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "danger";
}) {
  const valueTone = tone === "success"
    ? "text-emerald-700 dark:text-emerald-300"
    : tone === "danger"
      ? "text-red-700 dark:text-red-300"
      : "text-slate-950 dark:text-slate-100";

  return (
    <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/80 px-3.5 py-3.5 dark:border-slate-700/80 dark:bg-slate-900/35">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">{label}</p>
      <p className={`mt-2 whitespace-nowrap text-lg font-bold leading-none tracking-tight tabular-nums sm:text-xl ${valueTone}`}>{value}</p>
    </div>
  );
}

const ETRACS_STATUS_LABELS = {
  OUTSTANDING: "Outstanding",
  PARTIAL: "Partially Settled",
  SETTLED: "Settled",
} as const;

const ETRACS_STATUS_VARIANTS = {
  OUTSTANDING: "danger",
  PARTIAL: "warning",
  SETTLED: "success",
} as const;

function formatSyncTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { toast } = useToast();

  const [acc, setAcc] = useState<DelinquentAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [pay, setPay] = useState({ amount: "", orNumber: "", paymentDate: "", collector: "", notes: "" });
  const [savingPay, setSavingPay] = useState(false);
  const [syncingEtracs, setSyncingEtracs] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/delinquencies/accounts/${id}`);
    if (res.ok) {
      const data = await res.json();
      setAcc(data.account);
      setNotes(data.account?.notes ?? "");
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const recordPayment = async () => {
    const amount = Number(pay.amount);
    if (!Number.isFinite(amount) || amount <= 0) { toast("error", "Invalid amount", "Enter a positive amount."); return; }
    setSavingPay(true);
    try {
      const res = await fetch(`/api/delinquencies/accounts/${id}/settlements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...pay, amount }),
      });
      const data = await res.json();
      if (!res.ok) { toast("error", "Failed", data.error ?? "Could not record settlement."); return; }
      toast("success", "Settlement recorded", formatCurrency(amount));
      setPayOpen(false);
      setPay({ amount: "", orNumber: "", paymentDate: "", collector: "", notes: "" });
      load();
    } finally {
      setSavingPay(false);
    }
  };

  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      const res = await fetch(`/api/delinquencies/accounts/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes }),
      });
      if (res.ok) toast("success", "Notes saved");
      else { const d = await res.json().catch(() => ({})); toast("error", "Failed", d.error ?? "Could not save."); }
    } finally { setSavingNotes(false); }
  };

  const voidSettlement = async (sid: string) => {
    if (!window.confirm("Void this settlement payment?")) return;
    const res = await fetch(`/api/delinquencies/accounts/${id}/settlements/${sid}`, { method: "DELETE" });
    if (res.ok) { toast("success", "Voided"); load(); }
    else { const d = await res.json().catch(() => ({})); toast("error", "Failed", d.error ?? "Not authorized."); }
  };

  const deleteAccount = async () => {
    if (!window.confirm("Delete this delinquent account and its settlements? This cannot be undone.")) return;
    const res = await fetch(`/api/delinquencies/accounts/${id}`, { method: "DELETE" });
    if (res.ok) { toast("success", "Deleted"); router.push("/delinquencies/accounts"); }
    else { const d = await res.json().catch(() => ({})); toast("error", "Failed", d.error ?? "Not authorized."); }
  };

  const syncEtracs = async () => {
    setSyncingEtracs(true);
    try {
      const res = await fetch(`/api/delinquencies/accounts/${id}/etracs-sync`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast("error", "eTRACS sync failed", data.error ?? "Could not refresh this account from eTRACS.");
        return;
      }
      const data = await res.json();
      const syncedAccount = data?.account;
      if (!syncedAccount || typeof syncedAccount !== "object" || Array.isArray(syncedAccount)
        || syncedAccount.id !== id || !syncedAccount.etracsSnapshot) {
        throw new Error("Invalid eTRACS sync response");
      }
      setAcc(syncedAccount);
      toast("success", "eTRACS synced", "Official account details and tax status are up to date.");
    } catch {
      toast("error", "Sync result unconfirmed", "Could not confirm whether sync completed. Reload this account to check its latest values.");
    } finally {
      setSyncingEtracs(false);
    }
  };

  if (loading) return <div className="py-20 text-center"><Loader2 className="animate-spin text-slate-400 mx-auto" /></div>;
  if (!acc) return <div className="py-20 text-center text-slate-400">Account not found.</div>;

  const due = Number(acc.amountDue), paid = Number(acc.amountPaid), balance = Number(acc.balance);
  const localStatus = getSettlementStatusForBalance(acc.status, balance);
  const accountStatus = getAccountDisplayStatus(localStatus, acc.etracsSnapshot?.status, balance);
  const etracsStatus = acc.etracsSnapshot
    ? getEtracsStatusForBalance(acc.etracsSnapshot.status, Number(acc.etracsSnapshot.balance))
    : null;

  return (
    <div className="mx-auto w-full max-w-[1720px] min-w-0 space-y-5">
      <Link
        href="/delinquencies/accounts"
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:bg-white hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-blue-300"
      >
        <ArrowLeft size={15} /> Back to accounts
      </Link>

      <section
        aria-label="Account identity and actions"
        className="flex flex-col gap-5 rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-[0_2px_10px_rgba(15,23,42,0.04)] dark:border-slate-700/80 dark:bg-slate-800/95 sm:p-6 xl:flex-row xl:items-center xl:justify-between"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">Delinquent account</p>
          <h1 className="mt-1 max-w-5xl text-[clamp(1.5rem,2.1vw,2rem)] font-bold leading-tight tracking-tight text-slate-950 dark:text-white">
            {acc.taxpayerName}
          </h1>
          <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">{acc.list?.municipality ?? "—"}</p>

          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={async () => {
                const ok = await copyToClipboard(acc.tdNumber);
                toast(ok ? "success" : "error", ok ? "Copied" : "Copy failed", ok ? acc.tdNumber : undefined);
              }}
              className="inline-flex items-center gap-2.5 rounded-xl border border-blue-200 bg-blue-50/80 px-3.5 py-2 text-left transition-colors hover:border-blue-300 hover:bg-blue-100/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:border-blue-800 dark:bg-blue-950/50 dark:hover:border-blue-600 dark:hover:bg-blue-900/60 dark:focus-visible:ring-offset-slate-900"
              title="Copy TD number"
              aria-label={`Copy TD number ${acc.tdNumber}`}
            >
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-600 dark:text-blue-300">TD Number</span>
              <span className="font-mono text-sm font-bold tracking-wide text-blue-900 dark:text-blue-100 sm:text-base">{acc.tdNumber}</span>
              <Copy size={15} className="shrink-0 text-blue-500 dark:text-blue-300" />
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Account status</span>
              <Badge variant={SETTLEMENT_STATUS_VARIANT[accountStatus]} dot>{SETTLEMENT_STATUS_LABELS[accountStatus]}</Badge>
              {!acc.isPresent && <Badge variant="default">Off current list</Badge>}
              {acc.reappearedAfterSettle && <Badge variant="warning">Reappeared after settle</Badge>}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:shrink-0 xl:justify-end">
          <Button variant="secondary" size="sm" onClick={syncEtracs} loading={syncingEtracs}>
            {!syncingEtracs && <RefreshCw size={14} />} Sync eTRACS
          </Button>
          <Button size="sm" onClick={() => setPayOpen(true)}><PlusCircle size={14} /> Add local payment</Button>
        </div>
      </section>

      <Card className="overflow-hidden border-amber-200/80 bg-gradient-to-br from-white via-white to-amber-50/70 dark:border-amber-900/50 dark:from-slate-800 dark:via-slate-800 dark:to-amber-950/20">
        <CardHeader className="flex items-start justify-between gap-4 border-amber-100/80 px-5 py-4 sm:px-6 sm:py-5 dark:border-slate-700">
          <div>
            <CardTitle className="text-lg">Year-End Estimate</CardTitle>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
              Estimated total if billed on December 31, {acc.etracsSnapshot?.projectionYear ?? new Date().getFullYear()}.
            </p>
          </div>
          <Badge variant="warning" dot>Projected</Badge>
        </CardHeader>
        <CardContent className="grid grid-cols-1 items-center gap-6 px-5 py-6 sm:px-6 md:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)] md:gap-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">Estimated amount</p>
            <p className="mt-2 text-[clamp(2.5rem,4vw,4.25rem)] font-bold leading-none tracking-[-0.045em] tabular-nums text-slate-950 dark:text-white">
              {acc.etracsSnapshot?.projectedAmountDue == null
                ? "—"
                : formatCurrency(Number(acc.etracsSnapshot.projectedAmountDue))}
            </p>
          </div>
          <div className="border-t border-amber-200/80 pt-4 md:border-l md:border-t-0 md:pl-7 md:pt-0 dark:border-slate-700">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Based on eTRACS sync</p>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
              {acc.etracsSnapshot?.projectedAmountDue == null
                ? "Sync eTRACS to show this estimate."
                : `Synced ${formatSyncTime(acc.etracsSnapshot.syncedAt)}. Assumes no later payments.`}
            </p>
            <p className="text-xs text-slate-500 mt-2">Estimate only. Not an eTRACS bill.</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-2">
        <Card className="h-full overflow-hidden">
          <CardHeader className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
            <CardTitle className="text-base">eTRACS Current Figures</CardTitle>
            {etracsStatus && <Badge variant={ETRACS_STATUS_VARIANTS[etracsStatus]} dot>eTRACS: {ETRACS_STATUS_LABELS[etracsStatus]}</Badge>}
          </CardHeader>
          <CardContent className="space-y-4 px-5 py-5 sm:px-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FinancialMetric label="Tax principal" value={acc.etracsSnapshot ? formatCurrency(Number(acc.etracsSnapshot.amountDue)) : "—"} />
              <FinancialMetric label="Paid" value={acc.etracsSnapshot ? formatCurrency(Number(acc.etracsSnapshot.amountPaid)) : "—"} tone="success" />
              <FinancialMetric label="Balance" value={acc.etracsSnapshot ? formatCurrency(Number(acc.etracsSnapshot.balance)) : "—"} tone="danger" />
            </div>
            <p className="border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500 dark:border-slate-700 dark:text-slate-400">
              {acc.etracsSnapshot
                ? <>{acc.etracsSnapshot.lastPaidYear
                    ? `Paid through ${acc.etracsSnapshot.lastPaidYear}${acc.etracsSnapshot.lastPaidQuarter ? ` Q${acc.etracsSnapshot.lastPaidQuarter}` : ""}`
                    : "No payment period reported"} · Synced {formatSyncTime(acc.etracsSnapshot.syncedAt)}</>
                : "Sync eTRACS to load official figures."}
            </p>
          </CardContent>
        </Card>

        <Card className="h-full overflow-hidden">
          <CardHeader className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
            <CardTitle className="text-base">LedgerDex Figures</CardTitle>
            <Badge variant={SETTLEMENT_STATUS_VARIANT[localStatus]} dot>Local: {SETTLEMENT_STATUS_LABELS[localStatus]}</Badge>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 px-5 py-5 sm:grid-cols-3 sm:px-6">
            <FinancialMetric label="Amount due" value={formatCurrency(due)} />
            <FinancialMetric label="Paid here" value={formatCurrency(paid)} tone="success" />
            <FinancialMetric label="Balance" value={formatCurrency(balance)} tone="danger" />
          </CardContent>
        </Card>
      </div>

      {/* Details */}
      <Card>
        <CardHeader className="px-5 py-4 sm:px-6"><CardTitle className="text-base">Property Details</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-x-5 gap-y-5 px-5 py-5 sm:grid-cols-3 sm:px-6 xl:grid-cols-4 2xl:grid-cols-6">
          <Field label="PIN" value={<span className="font-mono text-xs">{acc.pin}</span>} />
          <Field label="Barangay" value={acc.barangay} />
          <Field label="Municipality" value={acc.list?.municipality} />
          <Field label="Class" value={classCodeLabel(acc.classCode)} />
          <Field label="RPU Type" value={RPU_TYPE_LABELS[acc.rpuType]} />
          <Field label="Area (sqm)" value={acc.areaSqm != null ? Number(acc.areaSqm).toLocaleString("en-PH") : "—"} />
          <Field label="Cadastral Lot" value={acc.cadastralLotNo} />
          <Field label="Delinquent Period" value={formatDelinquentPeriod(acc.delinquentFromYear, acc.delinquentFromQuarter, acc.delinquentToYear, acc.delinquentToQuarter)} />
          <Field label="First Seen" value={formatDate(acc.firstSeenAt)} />
          <Field label="Last Seen" value={formatDate(acc.lastSeenAt)} />
          <Field label="Settled At" value={acc.settledAt ? formatDate(acc.settledAt) : "—"} />
        </CardContent>
      </Card>

      <EtracsPaymentHistoryCard
        records={acc.etracsSnapshot?.paymentHistory}
        truncated={acc.etracsSnapshot?.paymentHistoryTruncated}
        synced={Boolean(acc.etracsSnapshot)}
      />

      {/* Local settlement history; it does not determine the official eTRACS totals. */}
      {(acc.settlements ?? []).length > 0 && (
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>LedgerDex Payments</CardTitle>
            <Badge variant="info"><Receipt size={11} className="mr-1" />{acc.settlements?.length ?? 0} payment(s)</Badge>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-500 text-xs uppercase tracking-wide">
                  <th className="text-left px-5 py-2.5 font-medium">Date</th>
                  <th className="text-left px-3 py-2.5 font-medium">OR No.</th>
                  <th className="text-right px-3 py-2.5 font-medium">Amount</th>
                  <th className="text-left px-3 py-2.5 font-medium">Collector</th>
                  <th className="text-left px-3 py-2.5 font-medium">Recorded By</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(acc.settlements ?? []).map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-5 py-2.5 text-slate-600 dark:text-slate-300">{s.paymentDate ? formatDate(s.paymentDate) : formatDate(s.createdAt)}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-600 dark:text-slate-400">{s.orNumber ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-emerald-600">{formatCurrency(Number(s.amount))}</td>
                    <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400">{s.collector ?? "—"}</td>
                    <td className="px-3 py-2.5 text-slate-500 text-xs">{s.recordedBy?.name ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right">
                      <button onClick={() => voidSettlement(s.id)} className="text-slate-400 hover:text-red-500 transition" title="Void">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Notes */}
      <Card>
        <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Add a note (compromise agreement, remarks, contact…)" />
          <div className="flex justify-end">
            <Button size="sm" onClick={saveNotes} loading={savingNotes}><Save size={14} /> Save Notes</Button>
          </div>
        </CardContent>
      </Card>

      <details className="group relative flex justify-end">
        <summary
          aria-label="More account actions"
          title="More account actions"
          className="inline-flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-blue-500 [&::-webkit-details-marker]:hidden dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <MoreHorizontal size={19} aria-hidden="true" />
        </summary>
        <div className="absolute bottom-full right-0 z-10 mb-2 min-w-44 rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
          <Button variant="ghost" size="sm" className="w-full justify-start text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-300" onClick={deleteAccount}>
            <Trash2 size={14} /> Delete account
          </Button>
        </div>
      </details>

      {/* Record settlement modal */}
      <Modal open={payOpen} onClose={() => setPayOpen(false)} title="Add local payment" size="md">
        <div className="space-y-4">
          <Input label="Amount (₱)" type="number" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} placeholder="0.00" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="OR Number" value={pay.orNumber} onChange={(e) => setPay({ ...pay, orNumber: e.target.value })} />
            <Input label="Payment Date" type="date" value={pay.paymentDate} onChange={(e) => setPay({ ...pay, paymentDate: e.target.value })} />
          </div>
          <Input label="Collector" value={pay.collector} onChange={(e) => setPay({ ...pay, collector: e.target.value })} />
          <Textarea label="Notes" value={pay.notes} onChange={(e) => setPay({ ...pay, notes: e.target.value })} rows={2} />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setPayOpen(false)}>Cancel</Button>
            <Button onClick={recordPayment} loading={savingPay}>Record</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
