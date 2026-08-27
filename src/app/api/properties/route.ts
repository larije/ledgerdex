import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";

export async function GET(req: NextRequest) {
  try {
  const sp = new URL(req.url).searchParams;
  const page         = Math.max(1, parseInt(sp.get("page")  ?? "1"));
  const limit        = Math.min(100, parseInt(sp.get("limit") ?? "25"));
  const skip         = (page - 1) * limit;
  const search       = sp.get("search")       ?? "";
  const municipality = sp.get("municipality") ?? "";
  const barangay     = sp.get("barangay")     ?? "";
  const type         = sp.get("type")         ?? "";
  const taxability   = sp.get("taxability")   ?? "";
  const status       = sp.get("status")       ?? "";
  const effectivity  = sp.get("effectivity")  ?? "";
  const isManual     = sp.get("isManual");
  const isChecked    = sp.get("isChecked");
  const documentId   = sp.get("documentId") ?? "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const AND: any[] = [];

  if (search) {
    AND.push({
      OR: [
        { tdNumber:        { contains: search } },
        { propertyIndexNo: { contains: search } },
        { propertyLocation:{ contains: search } },
        { barangay:        { contains: search } },
        { municipality:    { contains: search } },
        { lotBlockNo:      { contains: search } },
      ],
    });
  }
  if (municipality) AND.push({ municipality:  { contains: municipality } });
  if (barangay)     AND.push({ barangay:      { contains: barangay } });
  if (type)         AND.push({ type });
  if (taxability)   AND.push({ taxability });
  if (status)       AND.push({ paymentStatus: status });
  if (effectivity)  AND.push({ effectivity:   parseInt(effectivity) });
  if (isManual  !== null && isManual  !== undefined) AND.push({ isManualEntry: isManual  === "true" });
  if (isChecked !== null && isChecked !== undefined) AND.push({ isChecked:    isChecked === "true" });
  if (documentId) AND.push({ documentId });

  const where = AND.length ? { AND } : {};

  const [properties, total] = await Promise.all([
    prisma.property.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        document: { select: { id: true, originalName: true } },
        _count: { select: { remarks: true, payments: true, attachments: true } },
        payments: {
          orderBy: [{ year: "desc" }, { quarter: "desc" }],
          take: 1,
          select: { year: true, quarter: true },
        },
      },
    }),
    prisma.property.count({ where }),
  ]);

  return NextResponse.json({ properties, total, page, limit });
  } catch (e) {
    console.error("[GET /api/properties]", e);
    return NextResponse.json({ properties: [], total: 0, page: 1, limit: 25 }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const userId = req.headers.get("x-user-id") || null;
  const body = await req.json();

  if (!body.tdNumber || !body.type) {
    return NextResponse.json({ error: "tdNumber and type are required" }, { status: 400 });
  }

  const existing = await prisma.property.findUnique({ where: { tdNumber: body.tdNumber } });
  if (existing) {
    return NextResponse.json({ error: "TD Number already exists", existingId: existing.id }, { status: 409 });
  }

  const property = await prisma.property.create({
    data: {
      tdNumber:          body.tdNumber,
      propertyIndexNo:   body.propertyIndexNo   ?? null,
      propertyLocation:  body.propertyLocation  ?? null,
      barangay:          body.barangay          ?? null,
      municipality:      body.municipality      ?? null,
      lotBlockNo:        body.lotBlockNo        ?? null,
      class:             body.class             ?? null,
      type:              body.type,
      area:              body.area              ?? null,
      marketValue:       body.marketValue       ?? null,
      assessedValue:     body.assessedValue     ?? null,
      effectivity:       body.effectivity       ?? null,
      taxability:        body.taxability        ?? "TAXABLE",
      taxesBeginYear:    body.taxesBeginYear    ?? null,
      taxesBeginQuarter: body.taxesBeginQuarter ?? null,
      isManualEntry:     true,
    },
  });

  await createAuditLog({
    action: "PROPERTY_CREATE",
    userId,
    propertyId: property.id,
    details: `Manual entry: ${property.tdNumber}`,
  });

  return NextResponse.json({ property }, { status: 201 });
}
