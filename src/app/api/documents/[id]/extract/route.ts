import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  extractFromPDFBuffer, parseNumeric, parsePropertyType, parseTaxability,
} from "@/lib/pdf-extractor";
import { parseQuarter } from "@/lib/utils";
import { createAuditLog } from "@/lib/audit";
import path from "path";
import fs from "fs/promises";

const UPLOAD_DIR = path.join(process.cwd(), process.env.UPLOAD_DIR ?? "uploads", "documents");

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = req.headers.get("x-user-id") || null;
  const body = await req.json().catch(() => ({}));
  const overwrite: boolean = body.overwrite ?? false;

  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (doc.extractionStatus === "PROCESSING") {
    return NextResponse.json({ error: "Extraction already in progress" }, { status: 409 });
  }

  const filePath = path.join(UPLOAD_DIR, doc.storedName);
  let buffer: Buffer;
  try {
    buffer = await fs.readFile(filePath);
  } catch {
    return NextResponse.json({ error: "PDF file missing from disk" }, { status: 404 });
  }

  await prisma.document.update({ where: { id }, data: { extractionStatus: "PROCESSING" } });

  try {
    const { rows, taxpayerName, taxpayerAddress, noaCount, assessmentYear, municipality } =
      await extractFromPDFBuffer(buffer);

    await prisma.document.update({
      where: { id },
      data: { taxpayerName, taxpayerAddress, noaCount, assessmentYear, municipality },
    });

    const results = [];
    for (const row of rows) {
      if (!row.tdNumber) continue;
      const existing = await prisma.property.findUnique({ where: { tdNumber: row.tdNumber } });
      const tq = parseQuarter(row.taxesBegin);
      const data = {
        documentId:       id,
        tdNumber:         row.tdNumber,
        propertyIndexNo:  row.propertyIndexNo || null,
        propertyLocation: row.propertyLocation || null,
        barangay:         row.barangay || null,
        municipality:     row.municipality || null,
        lotBlockNo:       row.lotBlockNo || null,
        class:            row.class || null,
        type:             parsePropertyType(row.type),
        area:             parseNumeric(row.area),
        marketValue:      parseNumeric(row.marketValue),
        assessedValue:    parseNumeric(row.assessedValue),
        effectivity:      row.effectivity ? parseInt(row.effectivity) : null,
        taxability:       parseTaxability(row.taxability),
        taxesBeginYear:   tq?.year ?? null,
        taxesBeginQuarter: tq?.quarter ?? null,
      };

      if (existing) {
        if (overwrite) {
          await prisma.property.update({ where: { id: existing.id }, data });
          results.push({ tdNumber: row.tdNumber, action: "updated" });
        } else {
          results.push({ tdNumber: row.tdNumber, action: "skipped", reason: "duplicate" });
        }
      } else {
        await prisma.property.create({ data });
        results.push({ tdNumber: row.tdNumber, action: "created" });
      }
    }

    const created = results.filter((r) => r.action === "created").length;
    await prisma.document.update({
      where: { id },
      data: { extractionStatus: "COMPLETED", extractedCount: created },
    });
    await createAuditLog({
      action: "DOCUMENT_EXTRACT",
      userId,
      documentId: id,
      details: `${created} created, ${results.filter((r) => r.action === "updated").length} updated, ${results.filter((r) => r.action === "skipped").length} skipped`,
    });

    return NextResponse.json({ results, total: rows.length });
  } catch (e) {
    await prisma.document.update({ where: { id }, data: { extractionStatus: "FAILED" } });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
