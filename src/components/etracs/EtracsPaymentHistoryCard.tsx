"use client";

import { Receipt } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { EtracsPaymentRecord } from "@/types";

interface EtracsPaymentHistoryCardProps {
  records?: EtracsPaymentRecord[];
  truncated?: boolean;
  synced: boolean;
}

function formatPeriod(year: number | null, quarter: number | null) {
  if (year == null) return "—";
  return `${year}${quarter ? ` Q${quarter}` : ""}`;
}

export function EtracsPaymentHistoryCard({
  records = [],
  truncated = false,
  synced,
}: EtracsPaymentHistoryCardProps) {
  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>eTRACS Payment History</CardTitle>
        <Badge variant="info"><Receipt size={11} className="mr-1" />{records.length} receipt(s)</Badge>
      </CardHeader>
      <div className="max-h-80 overflow-auto">
        <table className="w-full min-w-[1000px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800">
              <th className="sticky top-0 bg-slate-50 px-5 py-2.5 text-left font-medium dark:bg-slate-800">Date</th>
              <th className="sticky top-0 bg-slate-50 px-3 py-2.5 text-left font-medium dark:bg-slate-800">OR No.</th>
              <th className="sticky top-0 bg-slate-50 px-3 py-2.5 text-left font-medium dark:bg-slate-800">Paid by</th>
              <th className="sticky top-0 bg-slate-50 px-3 py-2.5 text-left font-medium dark:bg-slate-800">Period</th>
              <th className="sticky top-0 bg-slate-50 px-3 py-2.5 text-right font-medium dark:bg-slate-800">Principal</th>
              <th className="sticky top-0 bg-slate-50 px-3 py-2.5 text-right font-medium dark:bg-slate-800">Interest</th>
              <th className="sticky top-0 bg-slate-50 px-3 py-2.5 text-right font-medium dark:bg-slate-800">Discount</th>
              <th className="sticky top-0 bg-slate-50 px-3 py-2.5 text-right font-medium dark:bg-slate-800">Amnesty</th>
              <th className="sticky top-0 bg-slate-50 px-3 py-2.5 text-center font-medium dark:bg-slate-800">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {records.length === 0 && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-sm text-slate-400">
                  {synced ? "No eTRACS receipts found for this TD." : "Sync eTRACS to load receipt history."}
                </td>
              </tr>
            )}
            {records.map((payment) => {
              const period = payment.fromYear == null && payment.toYear == null
                ? "—"
                : `${formatPeriod(payment.fromYear, payment.fromQuarter)} – ${formatPeriod(payment.toYear, payment.toQuarter)}`;
              return (
                <tr key={payment.paymentId} className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 ${payment.voided ? "opacity-60" : ""}`}>
                  <td className="px-5 py-2.5 text-slate-600 dark:text-slate-300">{payment.receiptDate ? formatDate(payment.receiptDate) : "—"}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-slate-600 dark:text-slate-400">{payment.receiptNo ?? "—"}</td>
                  <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">{payment.paidBy ?? "—"}</td>
                  <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">{period}</td>
                  <td className="px-3 py-2.5 text-right font-semibold text-slate-800 dark:text-slate-200">{formatCurrency(Number(payment.principal))}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600 dark:text-slate-300">{formatCurrency(Number(payment.interest))}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600 dark:text-slate-300">{formatCurrency(Number(payment.discount))}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600 dark:text-slate-300">{formatCurrency(Number(payment.amnesty))}</td>
                  <td className="px-3 py-2.5 text-center">{payment.voided ? <Badge variant="danger">Voided</Badge> : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {truncated && <p className="px-5 pt-3 text-xs text-slate-500">Showing the latest 5,000 receipts.</p>}
      <p className="px-5 py-3 text-xs text-slate-500">Amounts are the portions allocated to this TD. Voided receipts are listed but excluded from eTRACS totals.</p>
    </Card>
  );
}
