import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import prisma from "@/lib/prisma";
import { EtracsSyncError, fetchEtracsAccountData, normalizeEtracsPaymentHistory } from "@/lib/etracs-sync";
import { canWrite, getRequestUser } from "@/lib/request-user";

export const runtime = "nodejs";
export const maxDuration = 150;

interface PropertyEtracsSnapshotRow {
  propertyId: string;
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

function serializeSnapshot(row: PropertyEtracsSnapshotRow | undefined) {
  if (!row) throw new Error("Snapshot row was not returned after upsert");
  return {
    ...row,
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
    const property = await prisma.property.findUnique({
      where: { id },
      select: { id: true, tdNumber: true },
    });
    if (!property) return NextResponse.json({ error: "Property not found" }, { status: 404 });

    // Fetch and validate before writing anything to LedgerDex.
    const source = await fetchEtracsAccountData(property.tdNumber);
    const propertyUpdate: Prisma.PropertyUpdateInput = {};
    if (source.pin) propertyUpdate.propertyIndexNo = source.pin;
    if (source.classCode) propertyUpdate.class = source.classCode;
    if (source.cadastralLotNo) propertyUpdate.lotBlockNo = source.cadastralLotNo;
    if (source.rpuType === "LAND" || source.rpuType === "BLDG" || source.rpuType === "MACH" || source.rpuType === "MISC") {
      propertyUpdate.type = source.rpuType;
    }

    const snapshot = {
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
        await tx.property.update({ where: { id }, data: propertyUpdate });
      }

      await tx.$executeRaw`
        INSERT INTO property_etracs_sync_snapshots
          (propertyId, faasId, amountDue, amountPaid, balance,
           projectedAmountDue, projectionYear, status, lastPaidYear, lastPaidQuarter,
           paymentHistory, paymentHistoryTruncated, syncedAt)
        VALUES
          (${id}, ${snapshot.faasId}, ${snapshot.amountDue}, ${snapshot.amountPaid},
           ${snapshot.balance}, ${snapshot.projectedAmountDue}, ${snapshot.projectionYear},
           ${snapshot.status}, ${snapshot.lastPaidYear}, ${snapshot.lastPaidQuarter},
           CAST(${JSON.stringify(snapshot.paymentHistory)} AS JSON),
           ${snapshot.paymentHistoryTruncated}, ${snapshot.syncedAt})
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
          action: "PROPERTY_ETRACS_SYNC",
          userId: auditUser?.id ?? null,
          propertyId: id,
          details: `TD ${property.tdNumber}: eTRACS snapshot updated (FAAS ${source.faasId})`,
        },
      });

      const updatedProperty = await tx.property.findUnique({
        where: { id },
        include: {
          document: { select: { id: true, originalName: true, taxpayerName: true } },
          remarks: { orderBy: { createdAt: "desc" }, include: { createdBy: { select: { name: true } } } },
          payments: { orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }], include: { recordedBy: { select: { name: true } } } },
          attachments: { orderBy: { createdAt: "desc" }, include: { uploadedBy: { select: { name: true } } } },
        },
      });
      if (!updatedProperty) throw new Error("Property disappeared during eTRACS sync");
      const snapshotRows = await tx.$queryRaw<PropertyEtracsSnapshotRow[]>`
        SELECT propertyId, faasId, amountDue, amountPaid, balance,
          projectedAmountDue, projectionYear, status,
          lastPaidYear, lastPaidQuarter, paymentHistory, paymentHistoryTruncated, syncedAt
        FROM property_etracs_sync_snapshots
        WHERE propertyId = ${id}
        LIMIT 1
      `;
      return { updatedProperty, snapshot: serializeSnapshot(snapshotRows[0]) };
    });

    return NextResponse.json({ property: { ...result.updatedProperty, etracsSnapshot: result.snapshot } });
  } catch (error) {
    if (error instanceof EtracsSyncError) return safeSyncError(error);
    return NextResponse.json({ error: "Could not confirm the sync result. Reload this property before retrying." }, { status: 500 });
  }
}
