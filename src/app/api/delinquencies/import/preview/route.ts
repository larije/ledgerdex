import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { randomUUID } from "crypto";
import prisma from "@/lib/prisma";
import { getRequestUser, canWrite } from "@/lib/request-user";
import { extractDelinquencyPDF } from "@/lib/delinquency-extractor";
import { reconcile, ExistingAccountLite } from "@/lib/delinquency-reconcile";
import { ReconcilePreview } from "@/types";

const UPLOAD_DIR = path.join(
  process.cwd(),
  process.env.UPLOAD_DIR ?? "uploads",
  "delinquencies"
);

/**
 * Parse an uploaded delinquency-summary PDF and preview how it would reconcile
 * against the existing living list — WITHOUT writing any account data. The file
 * is saved so the subsequent /commit can re-parse it by storedName.
 */
export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!canWrite(user.role)) {
    return NextResponse.json({ error: "Not authorized to import" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());

  let doc;
  try {
    doc = await extractDelinquencyPDF(buffer);
  } catch (e) {
    console.error("[delinquency preview] parse failed", e);
    return NextResponse.json(
      { error: "Could not read this PDF. Make sure it is a valid PDF file." },
      { status: 422 }
    );
  }

  if (doc.rows.length === 0) {
    return NextResponse.json(
      {
        error:
          "This does not look like a Consolidated Summary of Delinquent Real Properties. No delinquent-account rows were found.",
      },
      { status: 422 }
    );
  }
  if (!doc.municipality) {
    return NextResponse.json(
      { error: "Could not detect the municipality from the PDF header." },
      { status: 422 }
    );
  }

  // Save the file for the commit step to re-parse.
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const storedName = `${randomUUID()}.pdf`;
  await fs.writeFile(path.join(UPLOAD_DIR, storedName), buffer);

  // Load existing accounts for this municipality's list (if any).
  const list = await prisma.delinquencyList.findUnique({
    where: { province_municipality: { province: doc.province, municipality: doc.municipality } },
    select: { id: true },
  });

  let existing: ExistingAccountLite[] = [];
  if (list) {
    existing = await prisma.delinquentAccount.findMany({
      where: { listId: list.id },
      select: { id: true, tdNumber: true, status: true, isPresent: true },
    });
  }

  const plan = reconcile(existing, doc.rows);

  const preview: ReconcilePreview = {
    province: doc.province,
    municipality: doc.municipality,
    asOfDate: doc.asOfDate,
    listExists: !!list,
    rowsParsed: plan.counts.rowsParsed,
    added: plan.counts.added,
    updated: plan.counts.updated,
    resolved: plan.counts.resolved,
    reappeared: plan.counts.reappeared,
    rowErrors: doc.rowErrors.length,
    totalAmountDue: plan.totalAmountDue,
  };

  return NextResponse.json({
    storedName,
    originalName: file.name,
    fileSize: buffer.length,
    doc,
    preview,
    existingListId: list?.id ?? null,
  });
}
