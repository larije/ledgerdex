import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import prisma from "@/lib/prisma";
import { getRequestUser, canWrite } from "@/lib/request-user";
import { createAuditLog } from "@/lib/audit";
import { extractDelinquencyPDF } from "@/lib/delinquency-extractor";
import { reconcile, ExistingAccountLite } from "@/lib/delinquency-reconcile";

const UPLOAD_DIR = path.join(
  process.cwd(),
  process.env.UPLOAD_DIR ?? "uploads",
  "delinquencies"
);

const STORED_NAME_RE = /^[a-f0-9-]+\.pdf$/i;

/**
 * Commit a previewed import: re-parse the saved PDF, reconcile against the
 * living list for its municipality, and persist everything in one transaction.
 */
export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!canWrite(user.role)) {
    return NextResponse.json({ error: "Not authorized to import" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const storedName: string = body.storedName ?? "";
  const originalName: string = body.originalName ?? "delinquency-list.pdf";
  const fileSize: number = Number(body.fileSize) || 0;

  if (!STORED_NAME_RE.test(storedName)) {
    return NextResponse.json({ error: "Invalid file reference" }, { status: 400 });
  }

  let buffer: Buffer;
  try {
    buffer = await fs.readFile(path.join(UPLOAD_DIR, storedName));
  } catch {
    return NextResponse.json(
      { error: "Uploaded file not found. Please upload it again." },
      { status: 400 }
    );
  }

  const doc = await extractDelinquencyPDF(buffer);
  if (doc.rows.length === 0 || !doc.municipality) {
    return NextResponse.json({ error: "Nothing to import from this file." }, { status: 422 });
  }

  // Load the existing list + accounts (with amountPaid, needed to recompute balance).
  const existingList = await prisma.delinquencyList.findUnique({
    where: { province_municipality: { province: doc.province, municipality: doc.municipality } },
    select: { id: true },
  });

  const existingAccounts = existingList
    ? await prisma.delinquentAccount.findMany({
        where: { listId: existingList.id },
        select: { id: true, tdNumber: true, status: true, isPresent: true, amountPaid: true },
      })
    : [];

  const paidById = new Map(existingAccounts.map((a) => [a.id, Number(a.amountPaid)]));
  const plan = reconcile(existingAccounts as ExistingAccountLite[], doc.rows);

  const asOf = doc.asOfDate ? new Date(doc.asOfDate) : null;

  const result = await prisma.$transaction(
    async (tx) => {
      const now = new Date();
      const list = await tx.delinquencyList.upsert({
        where: {
          province_municipality: { province: doc.province, municipality: doc.municipality },
        },
        create: {
          province: doc.province,
          municipality: doc.municipality,
          title: doc.title,
          asOfDate: asOf,
        },
        update: {},
        select: { id: true },
      });

      if (plan.toCreate.length) {
        await tx.delinquentAccount.createMany({
          data: plan.toCreate.map((row) => ({
            listId: list.id,
            rowNo: row.rowNo,
            tdNumber: row.tdNumber,
            pin: row.pin,
            barangay: row.barangay,
            classCode: row.classCode,
            rpuType: row.rpuType,
            areaSqm: row.areaSqm,
            taxpayerName: row.taxpayerName || "—",
            cadastralLotNo: row.cadastralLotNo,
            delinquentFromYear: row.delinquentFromYear,
            delinquentFromQuarter: row.delinquentFromQuarter,
            delinquentToYear: row.delinquentToYear,
            delinquentToQuarter: row.delinquentToQuarter,
            amountDue: row.amountDue,
            amountPaid: 0,
            balance: row.amountDue,
            status: "OUTSTANDING",
            isPresent: true,
            firstSeenAt: now,
            lastSeenAt: now,
          })),
        });
      }

      for (const u of plan.toUpdate) {
        const paid = paidById.get(u.id) ?? 0;
        await tx.delinquentAccount.update({
          where: { id: u.id },
          data: {
            rowNo: u.row.rowNo,
            pin: u.row.pin,
            barangay: u.row.barangay,
            classCode: u.row.classCode,
            rpuType: u.row.rpuType,
            areaSqm: u.row.areaSqm,
            taxpayerName: u.row.taxpayerName || "—",
            cadastralLotNo: u.row.cadastralLotNo,
            delinquentFromYear: u.row.delinquentFromYear,
            delinquentFromQuarter: u.row.delinquentFromQuarter,
            delinquentToYear: u.row.delinquentToYear,
            delinquentToQuarter: u.row.delinquentToQuarter,
            amountDue: u.row.amountDue,
            balance: Number(u.row.amountDue) - paid,
            lastSeenAt: now,
            isPresent: true,
            ...(u.reappearedAfterSettle ? { reappearedAfterSettle: true } : {}),
          },
        });
      }

      if (plan.toResolve.length) {
        await tx.delinquentAccount.updateMany({
          where: { id: { in: plan.toResolve } },
          data: { status: "RESOLVED", isPresent: false },
        });
      }
      if (plan.toMarkAbsent.length) {
        await tx.delinquentAccount.updateMany({
          where: { id: { in: plan.toMarkAbsent } },
          data: { isPresent: false },
        });
      }

      const [dueAgg, paidAgg, presentCount] = await Promise.all([
        tx.delinquentAccount.aggregate({
          where: { listId: list.id, isPresent: true },
          _sum: { amountDue: true },
        }),
        tx.delinquentAccount.aggregate({
          where: { listId: list.id },
          _sum: { amountPaid: true },
        }),
        tx.delinquentAccount.count({ where: { listId: list.id, isPresent: true } }),
      ]);

      await tx.delinquencyList.update({
        where: { id: list.id },
        data: {
          title: doc.title ?? undefined,
          asOfDate: asOf ?? undefined,
          lastImportedAt: now,
          accountCount: presentCount,
          totalAmountDue: dueAgg._sum.amountDue ?? 0,
          totalSettled: paidAgg._sum.amountPaid ?? 0,
        },
      });

      const imp = await tx.delinquencyImport.create({
        data: {
          listId: list.id,
          fileName: originalName,
          storedName,
          fileSize,
          asOfDate: asOf,
          rowsParsed: plan.counts.rowsParsed,
          rowsAdded: plan.counts.added,
          rowsUpdated: plan.counts.updated,
          rowsResolved: plan.counts.resolved,
          rowsReappeared: plan.counts.reappeared,
          rowErrors: doc.rowErrors.length,
          totalAmountDue: plan.totalAmountDue,
          importedById: user.id,
        },
      });

      return { listId: list.id, importId: imp.id };
    },
    { timeout: 120_000, maxWait: 20_000 }
  );

  await createAuditLog({
    action: "DELINQUENCY_IMPORT",
    userId: user.id,
    details: `${doc.municipality}: +${plan.counts.added} new, ${plan.counts.updated} updated, ${plan.counts.resolved} resolved (${originalName})`,
  });

  return NextResponse.json({
    listId: result.listId,
    importId: result.importId,
    counts: plan.counts,
  });
}
