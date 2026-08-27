import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const property = await prisma.property.findUnique({
      where: { id },
      include: {
        document: { select: { id: true, originalName: true, taxpayerName: true } },
        remarks: {
          orderBy: { createdAt: "desc" },
          include: { createdBy: { select: { name: true } } },
        },
        payments: {
          orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
          include: { recordedBy: { select: { name: true } } },
        },
        attachments: {
          orderBy: { createdAt: "desc" },
          include: { uploadedBy: { select: { name: true } } },
        },
      },
    });
    if (!property) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ property });
  } catch (e) {
    console.error("[GET /api/properties/[id]]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const userId = req.headers.get("x-user-id") || null;
    const body = await req.json();

    const allowed = [
      "tdNumber","propertyIndexNo","propertyLocation","barangay","municipality",
      "lotBlockNo","class","type","area","marketValue","assessedValue",
      "effectivity","taxability","taxesBeginYear","taxesBeginQuarter",
      "paymentStatus","paidUpToYear","paidUpToQuarter","isChecked",
    ];
    const data: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) data[key] = body[key];
    }

    const property = await prisma.property.update({ where: { id }, data });
    await createAuditLog({
      action: "PROPERTY_UPDATE",
      userId,
      propertyId: id,
      details: `Updated fields: ${Object.keys(data).join(", ")}`,
    });
    return NextResponse.json({ property });
  } catch (e) {
    console.error("[PATCH /api/properties/[id]]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = req.headers.get("x-user-id") || null;
  await prisma.property.delete({ where: { id } });
  await createAuditLog({ action: "PROPERTY_DELETE", userId, details: `Deleted property ${id}` });
  return NextResponse.json({ ok: true });
}
