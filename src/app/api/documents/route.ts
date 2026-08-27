import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { extractFromPDFBuffer, parseNumeric, parsePropertyType, parseTaxability } from "@/lib/pdf-extractor";
import { parseQuarter } from "@/lib/utils";
import path from "path";
import fs from "fs/promises";
import { randomUUID } from "crypto";

const UPLOAD_DIR = path.join(process.cwd(), process.env.UPLOAD_DIR ?? "uploads", "documents");

async function ensureDir() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page    = parseInt(searchParams.get("page")  ?? "1");
  const limit   = parseInt(searchParams.get("limit") ?? "20");
  const search  = searchParams.get("search") ?? "";
  const skip    = (page - 1) * limit;

  const where = search
    ? {
        OR: [
          { originalName:  { contains: search } },
          { taxpayerName:  { contains: search } },
          { noaCount:      { contains: search } },
          { municipality:  { contains: search } },
        ],
      }
    : {};

  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: { uploadedBy: { select: { id: true, name: true } } },
    }),
    prisma.document.count({ where }),
  ]);

  return NextResponse.json({ documents, total, page, limit });
}

export async function POST(req: NextRequest) {
  await ensureDir();
  const userId = req.headers.get("x-user-id") || null;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const storedName = `${randomUUID()}.pdf`;
  const filePath   = path.join(UPLOAD_DIR, storedName);
  const buffer     = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(filePath, buffer);

  const doc = await prisma.document.create({
    data: {
      originalName: file.name,
      storedName,
      fileSize:     buffer.length,
      uploadedById: userId ?? undefined,
      extractionStatus: "PENDING",
    },
    include: { uploadedBy: { select: { id: true, name: true } } },
  });

  await createAuditLog({ action: "DOCUMENT_UPLOAD", userId, documentId: doc.id, details: file.name });

  // Run extraction asynchronously
  runExtraction(doc.id, buffer, userId).catch(console.error);

  return NextResponse.json({ document: doc }, { status: 201 });
}

async function runExtraction(docId: string, buffer: Buffer, userId: string | null) {
  await prisma.document.update({ where: { id: docId }, data: { extractionStatus: "PROCESSING" } });
  try {
    const { rows, taxpayerName, taxpayerAddress, noaCount, assessmentYear, municipality } =
      await extractFromPDFBuffer(buffer);

    await prisma.document.update({
      where: { id: docId },
      data: { taxpayerName, taxpayerAddress, noaCount, assessmentYear, municipality },
    });

    let created = 0;
    for (const row of rows) {
      if (!row.tdNumber) continue;
      const existing = await prisma.property.findUnique({ where: { tdNumber: row.tdNumber } });
      if (existing) continue; // skip duplicates during auto-extraction

      const tq = parseQuarter(row.taxesBegin);
      await prisma.property.create({
        data: {
          documentId:      docId,
          tdNumber:        row.tdNumber,
          propertyIndexNo: row.propertyIndexNo || null,
          propertyLocation: row.propertyLocation || null,
          barangay:        row.barangay || null,
          municipality:    row.municipality || null,
          lotBlockNo:      row.lotBlockNo || null,
          class:           row.class || null,
          type:            parsePropertyType(row.type),
          area:            parseNumeric(row.area),
          marketValue:     parseNumeric(row.marketValue),
          assessedValue:   parseNumeric(row.assessedValue),
          effectivity:     row.effectivity ? parseInt(row.effectivity) : null,
          taxability:      parseTaxability(row.taxability),
          taxesBeginYear:  tq?.year  ?? null,
          taxesBeginQuarter: tq?.quarter ?? null,
        },
      });
      created++;
    }

    await prisma.document.update({
      where: { id: docId },
      data: { extractionStatus: "COMPLETED", extractedCount: created },
    });
    await createAuditLog({
      action: "DOCUMENT_EXTRACT",
      userId,
      documentId: docId,
      details: `Extracted ${created} properties`,
    });
  } catch (e) {
    console.error("Extraction failed:", e);
    await prisma.document.update({ where: { id: docId }, data: { extractionStatus: "FAILED" } });
  }
}
