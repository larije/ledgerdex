import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUser, canWrite, canManage } from "@/lib/request-user";
import { createAuditLog } from "@/lib/audit";
import { recomputeListTotals } from "@/lib/delinquency-settle";
import { normalizeEtracsPaymentHistory } from "@/lib/etracs-sync";
import { getEtracsStatusForBalance, getSettlementStatusForBalance } from "@/lib/delinquency";
import { SettlementStatus } from "@/types";

interface EtracsSnapshotRow {
  accountId: string;
  faasId: string;
  amountDue: unknown;
  amountPaid: unknown;
  balance: unknown;
  projectedAmountDue: unknown;
  projectionYear: number | null;
  status: "OUTSTANDING" | "PARTIAL" | "SETTLED";
  lastPaidYear: number | null;
  lastPaidQuarter: number | null;
  paymentHistory: unknown;
  paymentHistoryTruncated: boolean | number;
  syncedAt: Date | string;
}

function serializeEtracsSnapshot(row: EtracsSnapshotRow | undefined) {
  if (!row) return null;
  return {
    ...row,
    status: getEtracsStatusForBalance(row.status, Number(row.balance)),
    amountDue: Number(row.amountDue),
    amountPaid: Number(row.amountPaid),
    balance: Number(row.balance),
    projectedAmountDue: row.projectedAmountDue == null ? null : Number(row.projectedAmountDue),
    paymentHistory: normalizeEtracsPaymentHistory(row.paymentHistory),
    paymentHistoryTruncated: Boolean(row.paymentHistoryTruncated),
    syncedAt: row.syncedAt instanceof Date ? row.syncedAt.toISOString() : row.syncedAt,
  };
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const account = await prisma.delinquentAccount.findUnique({
      where: { id },
      include: {
        list: { select: { id: true, municipality: true, province: true, asOfDate: true } },
        settlements: {
          orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
          include: { recordedBy: { select: { name: true } } },
        },
      },
    });
    if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const snapshots = await prisma.$queryRaw<EtracsSnapshotRow[]>`
      SELECT accountId, faasId, amountDue, amountPaid, balance,
        projectedAmountDue, projectionYear, status,
        lastPaidYear, lastPaidQuarter, paymentHistory, paymentHistoryTruncated, syncedAt
      FROM etracs_sync_snapshots
      WHERE accountId = ${id}
      LIMIT 1
    `;
    return NextResponse.json({
      account: {
        ...account,
        status: getSettlementStatusForBalance(account.status, Number(account.balance)),
        etracsSnapshot: serializeEtracsSnapshot(snapshots[0]),
      },
    });
  } catch (e) {
    console.error("[GET /api/delinquencies/accounts/[id]]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getRequestUser(req);
    if (!canWrite(user.role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }
    const body = await req.json();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {};
    if (typeof body.notes === "string") data.notes = body.notes;

    if (typeof body.status === "string") {
      const valid: SettlementStatus[] = ["OUTSTANDING", "PARTIAL", "SETTLED", "RESOLVED"];
      if (!valid.includes(body.status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      const current = await prisma.delinquentAccount.findUnique({
        where: { id },
        select: { balance: true },
      });
      if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
      data.status = getSettlementStatusForBalance(body.status, Number(current.balance));
      data.settledAt = data.status === "SETTLED" ? new Date() : null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const account = await prisma.delinquentAccount.update({ where: { id }, data });
    if (data.status) await recomputeListTotals(account.listId);

    await createAuditLog({
      action: "DELINQUENCY_ACCOUNT_UPDATE",
      userId: user.id,
      details: `${account.tdNumber}: ${Object.keys(data).join(", ")}`,
    });
    return NextResponse.json({ account });
  } catch (e) {
    console.error("[PATCH /api/delinquencies/accounts/[id]]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getRequestUser(req);
    if (!canManage(user.role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }
    const account = await prisma.delinquentAccount.delete({ where: { id } });
    await recomputeListTotals(account.listId);
    await createAuditLog({
      action: "DELINQUENCY_ACCOUNT_DELETE",
      userId: user.id,
      details: `Deleted delinquent account ${account.tdNumber}`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/delinquencies/accounts/[id]]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
