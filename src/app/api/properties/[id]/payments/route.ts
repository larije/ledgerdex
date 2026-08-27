import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payments = await prisma.payment.findMany({
    where: { propertyId: id },
    orderBy: { createdAt: "desc" },
    include: { recordedBy: { select: { name: true } } },
  });
  return NextResponse.json({ payments });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = req.headers.get("x-user-id") || null;
  const body = await req.json();

  if (!isFinite(body.amount) || body.amount <= 0) {
    return NextResponse.json({ error: "Amount must be a positive number" }, { status: 400 });
  }

  const payment = await prisma.payment.create({
    data: {
      propertyId:  id,
      orNumber:    body.orNumber    ?? null,
      paymentDate: body.paymentDate ? new Date(body.paymentDate) : null,
      amount:      body.amount,
      collector:   body.collector   ?? null,
      year:        body.year        ?? null,
      quarter:     body.quarter     ?? null,
      notes:       body.notes       ?? null,
      recordedById: userId,
    },
    include: { recordedBy: { select: { name: true } } },
  });

  // Update property payment status
  await prisma.property.update({
    where: { id },
    data: {
      paymentStatus:   body.paymentStatus  ?? "PARTIAL",
      paidUpToYear:    body.year           ?? null,
      paidUpToQuarter: body.quarter        ?? null,
    },
  });

  await createAuditLog({
    action: "PAYMENT_ADD",
    userId,
    propertyId: id,
    details: `OR#${body.orNumber ?? "N/A"} ₱${body.amount}`,
  });

  return NextResponse.json({ payment }, { status: 201 });
}
