"use client";
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Loader2, PlusCircle, CheckCircle2, Mail, Trash2, Save, RotateCcw, Receipt, Copy,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/layout/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency, formatDate, copyToClipboard } from "@/lib/utils";
import {
  RPU_TYPE_LABELS, classCodeLabel, formatDelinquentPeriod,
  SETTLEMENT_STATUS_LABELS, SETTLEMENT_STATUS_VARIANT,
} from "@/lib/delinquency";
import { generateTaxpayerNoticePDF } from "@/lib/delinquency-export";
import { DelinquentAccount } from "@/types";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</p>
      <p className="text-sm text-slate-800 dark:text-slate-200 mt-0.5">{value ?? "—"}</p>
    </div>
  );
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

  const setStatus = async (status: string) => {
    const res = await fetch(`/api/delinquencies/accounts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) { toast("success", "Updated", SETTLEMENT_STATUS_LABELS[status as keyof typeof SETTLEMENT_STATUS_LABELS]); load(); }
    else { const d = await res.json().catch(() => ({})); toast("error", "Failed", d.error ?? "Could not update."); }
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

  const generateNotice = async () => {
    if (!acc) return;
    try {
      const res = await fetch(`/api/delinquencies/accounts?search=${encodeURIComponent(acc.taxpayerName)}&limit=500`);
      const data = await res.json();
      const mine: DelinquentAccount[] = (data.accounts ?? []).filter(
        (x: DelinquentAccount) => x.taxpayerName === acc.taxpayerName && x.listId === acc.listId
      );
      generateTaxpayerNoticePDF(acc.taxpayerName, mine.length ? mine : [acc]);
      toast("success", "Notice generated", `${mine.length || 1} propert${(mine.length || 1) === 1 ? "y" : "ies"}.`);
    } catch { toast("error", "Failed", "Could not generate notice."); }
  };

  if (loading) return <div className="py-20 text-center"><Loader2 className="animate-spin text-slate-400 mx-auto" /></div>;
  if (!acc) return <div className="py-20 text-center text-slate-400">Account not found.</div>;

  const due = Number(acc.amountDue), paid = Number(acc.amountPaid), balance = Number(acc.balance);

  return (
    <div className="animate-fade-in space-y-5">
      <Link href="/delinquencies/accounts" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400">
        <ArrowLeft size={15} /> Back to accounts
      </Link>

      <PageHeader
        title={acc.taxpayerName}
        subtitle={`TD ${acc.tdNumber} · ${acc.list?.municipality ?? ""}`}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={generateNotice}><Mail size={14} /> Notice</Button>
            {acc.status !== "SETTLED"
              ? <Button variant="success" size="sm" onClick={() => setStatus("SETTLED")}><CheckCircle2 size={14} /> Mark Settled</Button>
              : <Button variant="secondary" size="sm" onClick={() => setStatus(paid > 0 ? "PARTIAL" : "OUTSTANDING")}><RotateCcw size={14} /> Reopen</Button>}
            <Button size="sm" onClick={() => setPayOpen(true)}><PlusCircle size={14} /> Record Settlement</Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={SETTLEMENT_STATUS_VARIANT[acc.status]} dot>{SETTLEMENT_STATUS_LABELS[acc.status]}</Badge>
        {!acc.isPresent && <Badge variant="default">Off current list</Badge>}
        {acc.reappearedAfterSettle && <Badge variant="warning">Reappeared after settle</Badge>}
      </div>

      {/* Money summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent><p className="text-xs uppercase tracking-wide text-slate-400">Amount Due</p><p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{formatCurrency(due)}</p></CardContent></Card>
        <Card><CardContent><p className="text-xs uppercase tracking-wide text-slate-400">Amount Paid</p><p className="text-2xl font-bold text-emerald-600 mt-1">{formatCurrency(paid)}</p></CardContent></Card>
        <Card><CardContent><p className="text-xs uppercase tracking-wide text-slate-400">Balance</p><p className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(balance)}</p></CardContent></Card>
      </div>

      {/* Details */}
      <Card>
        <CardHeader><CardTitle>Property Details</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-5">
          <Field label="TD Number" value={
            <span className="inline-flex items-center gap-1.5">
              <span className="font-mono">{acc.tdNumber}</span>
              <button
                onClick={async () => {
                  const ok = await copyToClipboard(acc.tdNumber);
                  toast(ok ? "success" : "error", ok ? "Copied" : "Copy failed", ok ? acc.tdNumber : undefined);
                }}
                className="text-slate-300 hover:text-blue-500 dark:text-slate-600 dark:hover:text-blue-400 transition"
                title="Copy TD number"
              >
                <Copy size={12} />
              </button>
            </span>
          } />
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

      {/* Settlement ledger */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Settlement Ledger</CardTitle>
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
              {(acc.settlements ?? []).length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-slate-400 text-sm">No settlements recorded yet.</td></tr>
              )}
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

      {/* Notes */}
      <Card>
        <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Add a note (compromise agreement, remarks, contact…)" />
          <Button size="sm" onClick={saveNotes} loading={savingNotes}><Save size={14} /> Save Notes</Button>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button variant="danger" size="sm" onClick={deleteAccount}><Trash2 size={14} /> Delete Account</Button>
      </div>

      {/* Record settlement modal */}
      <Modal open={payOpen} onClose={() => setPayOpen(false)} title="Record Settlement" size="md">
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
