import prisma from "./prisma";

/**
 * Recompute a delinquent account's paid/balance/status from its settlement
 * payments, then refresh the parent list's totalSettled. Called after any
 * settlement is created, edited, or deleted.
 *
 * Status is derived purely from the money EXCEPT for RESOLVED accounts (dropped
 * off a newer list), which keep their status. Manual "Mark Settled" is a
 * separate action on the account, not routed through here.
 */
export async function recomputeAccountSettlement(accountId: string) {
  const acc = await prisma.delinquentAccount.findUnique({
    where: { id: accountId },
    select: { amountDue: true, status: true, settledAt: true, listId: true },
  });
  if (!acc) return;

  const agg = await prisma.settlementPayment.aggregate({
    where: { accountId },
    _sum: { amount: true },
  });
  const paid = Number(agg._sum.amount ?? 0);
  const due = Number(acc.amountDue);
  const balance = due - paid;

  let status = acc.status;
  if (status !== "RESOLVED") {
    status = balance <= 0 ? "SETTLED" : paid <= 0 ? "OUTSTANDING" : "PARTIAL";
  }

  await prisma.delinquentAccount.update({
    where: { id: accountId },
    data: {
      amountPaid: paid,
      balance,
      status,
      settledAt: status === "SETTLED" ? acc.settledAt ?? new Date() : null,
    },
  });

  const listAgg = await prisma.delinquentAccount.aggregate({
    where: { listId: acc.listId },
    _sum: { amountPaid: true },
  });
  await prisma.delinquencyList.update({
    where: { id: acc.listId },
    data: { totalSettled: listAgg._sum.amountPaid ?? 0 },
  });
}

/** Refresh a list's account/amount roll-ups (after account delete, etc.). */
export async function recomputeListTotals(listId: string) {
  const [dueAgg, paidAgg, presentCount] = await Promise.all([
    prisma.delinquentAccount.aggregate({
      where: { listId, isPresent: true },
      _sum: { amountDue: true },
    }),
    prisma.delinquentAccount.aggregate({ where: { listId }, _sum: { amountPaid: true } }),
    prisma.delinquentAccount.count({ where: { listId, isPresent: true } }),
  ]);
  await prisma.delinquencyList.update({
    where: { id: listId },
    data: {
      accountCount: presentCount,
      totalAmountDue: dueAgg._sum.amountDue ?? 0,
      totalSettled: paidAgg._sum.amountPaid ?? 0,
    },
  });
}
