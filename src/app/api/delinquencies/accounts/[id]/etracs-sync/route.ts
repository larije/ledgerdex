import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import prisma from "@/lib/prisma";
import { EtracsSyncError, fetchEtracsAccountData, normalizeEtracsPaymentHistory } from "@/lib/etracs-sync";
import { getEtracsStatusForBalance, getSettlementStatusForBalance } from "@/lib/delinquency";
import { canWrite, getRequestUser } from "@/lib/request-user";

export const runtime = "nodejs";
export const maxDuration = 150;

const accountDetailInclude = {
  list: { select: { id: true, municipality: true, province: true, asOfDate: true } },
  settlements: {
    orderBy: [{ paymentDate: "desc" as const }, { createdAt: "desc" as const }],
    include: { recordedBy: { select: { name: true } } },
  },
};

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
  if (!row) throw new Error("Snapshot row was not returned after upsert");
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

function safeSyncError(error: EtracsSyncError) {
  switch (error.code) {
    case "NOT_CONFIGURED":
      return NextResponse.json({ error: "eTRACS sync is not configured. Contact an administrator." }, { status: 503 });
    case "TIMEOUT":
      return NextResponse.json({ error: "This eTRACS record took too long to load. LedgerDex was not changed; try again or ask an administrator to check the source database." }, { status: 504 });
    case "NOT_FOUND":
      return NextResponse.json({ error: "No eTRACS account matched this TD number. LedgerDex was not changed." }, { status: 404 });
    case "AMBIGUOUS":
      return NextResponse.json({ error: "More than one eTRACS account matched this TD number. LedgerDex was not changed." }, { status: 409 });
    case "INVALID_DATA":
      return NextResponse.json({ error: "eTRACS returned incomplete or invalid account data. LedgerDex was not changed." }, { status: 422 });
    default:
      return NextResponse.json({ error: "eTRACS is unavailable. LedgerDex was not changed; try again later." }, { status: 503 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRequestUser(req);
  if (!canWrite(user.role)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const account = await prisma.delinquentAccount.findUnique({
      where: { id },
      select: { id: true, tdNumber: true },
    });
    if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

    // Read and validate the entire eTRACS result before opening the LedgerDex transaction.
    const source = await fetchEtracsAccountData(account.tdNumber);
    const propertyUpdate: Prisma.DelinquentAccountUpdateInput = {};
    if (source.pin) propertyUpdate.pin = source.pin;
    if (source.classCode) propertyUpdate.classCode = source.classCode;
    if (source.rpuType) propertyUpdate.rpuType = source.rpuType;
    if (source.taxpayerName) propertyUpdate.taxpayerName = source.taxpayerName;
    if (source.cadastralLotNo) propertyUpdate.cadastralLotNo = source.cadastralLotNo;

    const snapshotFields = {
      faasId: source.faasId,
      amountDue: source.amountDue,
      amountPaid: source.amountPaid,
      balance: source.balance,
      projectedAmountDue: source.projectedAmountDue,
      projectionYear: source.projectionYear,
      status: source.status,
      lastPaidYear: source.lastPaidYear,
      lastPaidQuarter: source.lastPaidQuarter,
      paymentHistory: source.paymentHistory,
      paymentHistoryTruncated: source.paymentHistoryTruncated,
      syncedAt: new Date(),
    };

    const result = await prisma.$transaction(async (tx) => {
      if (Object.keys(propertyUpdate).length > 0) {
        await tx.delinquentAccount.update({ where: { id }, data: propertyUpdate });
      }

      await tx.$executeRaw`
        INSERT INTO etracs_sync_snapshots
          (accountId, faasId, amountDue, amountPaid, balance,
           projectedAmountDue, projectionYear, status, lastPaidYear, lastPaidQuarter,
           paymentHistory, paymentHistoryTruncated, syncedAt)
        VALUES
          (${id}, ${snapshotFields.faasId}, ${snapshotFields.amountDue},
           ${snapshotFields.amountPaid}, ${snapshotFields.balance}, ${snapshotFields.projectedAmountDue},
           ${snapshotFields.projectionYear}, ${snapshotFields.status},
           ${snapshotFields.lastPaidYear}, ${snapshotFields.lastPaidQuarter},
           CAST(${JSON.stringify(snapshotFields.paymentHistory)} AS JSON),
           ${snapshotFields.paymentHistoryTruncated}, ${snapshotFields.syncedAt})
        ON DUPLICATE KEY UPDATE
          faasId = VALUES(faasId),
          amountDue = VALUES(amountDue),
          amountPaid = VALUES(amountPaid),
          balance = VALUES(balance),
          projectedAmountDue = VALUES(projectedAmountDue),
          projectionYear = VALUES(projectionYear),
          status = VALUES(status),
          lastPaidYear = VALUES(lastPaidYear),
          lastPaidQuarter = VALUES(lastPaidQuarter),
          paymentHistory = VALUES(paymentHistory),
          paymentHistoryTruncated = VALUES(paymentHistoryTruncated),
          syncedAt = VALUES(syncedAt)
      `;

      const auditUser = user.id
        ? await tx.user.findUnique({ where: { id: user.id }, select: { id: true } })
        : null;
      await tx.auditLog.create({
        data: {
          action: "DELINQUENCY_ETRACS_SYNC",
          userId: auditUser?.id ?? null,
          details: `TD ${account.tdNumber}: eTRACS snapshot updated (FAAS ${source.faasId})`,
        },
      });

      const updatedAccount = await tx.delinquentAccount.findUnique({ where: { id }, include: accountDetailInclude });
      if (!updatedAccount) throw new Error("Account disappeared during eTRACS sync");
      const snapshotRows = await tx.$queryRaw<EtracsSnapshotRow[]>`
        SELECT accountId, faasId, amountDue, amountPaid, balance,
          projectedAmountDue, projectionYear, status,
          lastPaidYear, lastPaidQuarter, paymentHistory, paymentHistoryTruncated, syncedAt
        FROM etracs_sync_snapshots
        WHERE accountId = ${id}
        LIMIT 1
      `;
      return { updatedAccount, snapshot: serializeEtracsSnapshot(snapshotRows[0]) };
    });

    return NextResponse.json({
      account: {
        ...result.updatedAccount,
        status: getSettlementStatusForBalance(
          result.updatedAccount.status,
          Number(result.updatedAccount.balance)
        ),
        etracsSnapshot: result.snapshot,
      },
    });
  } catch (error) {
    if (error instanceof EtracsSyncError) return safeSyncError(error);
    return NextResponse.json({ error: "Could not confirm the sync result. Reload this account before retrying." }, { status: 500 });
  }
}
