import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { REMARK_COLORS } from "@/lib/utils";
import { RemarkLabel } from "@/types";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const remarks = await prisma.remark.findMany({
    where: { propertyId: id },
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { name: true } } },
  });
  return NextResponse.json({ remarks });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = req.headers.get("x-user-id") || null;
  const body = await req.json();

  const label = (body.label ?? "OTHER") as RemarkLabel;
  const remark = await prisma.remark.create({
    data: {
      propertyId:  id,
      label,
      text:        body.text,
      color:       REMARK_COLORS[label] ?? "#6B7280",
      createdById: userId,
    },
    include: { createdBy: { select: { name: true } } },
  });

  await createAuditLog({ action: "REMARK_ADD", userId, propertyId: id, details: label });
  return NextResponse.json({ remark }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = req.headers.get("x-user-id") || null;
  const { remarkId } = await req.json();
  await prisma.remark.delete({ where: { id: remarkId, propertyId: id } });
  await createAuditLog({ action: "REMARK_DELETE", userId, propertyId: id });
  return NextResponse.json({ ok: true });
}
