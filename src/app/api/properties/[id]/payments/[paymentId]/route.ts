import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string; paymentId: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id, paymentId } = await params;
  const userId = req.headers.get("x-user-id") || null;
  const body = await req.json();

  const payment = await prisma.payment.update({
    where: { id: paymentId },
    data: {
      orNumber:    body.orNumber    ?? null,
      paymentDate: body.paymentDate ? new Date(body.paymentDate) : null,
      amount:      body.amount      != null ? parseFloat(body.amount) : undefined,
      collector:   body.collector   ?? null,
      year:        body.year        != null ? parseInt(body.year)    : null,
      quarter:     body.quarter     != null ? parseInt(body.quarter) : null,
      notes:       body.notes       ?? null,
    },
  });

  await createAuditLog({
    action: "PAYMENT_ADD",
    userId,
    propertyId: id,
    details: `Edited OR#${body.orNumber ?? "N/A"} ₱${body.amount}`,
  });

  return NextResponse.json({ payment });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { id, paymentId } = await params;
  const userId = req.headers.get("x-user-id") || null;

  await prisma.payment.delete({ where: { id: paymentId } });

  await createAuditLog({
    action: "PAYMENT_ADD",
    userId,
    propertyId: id,
    details: `Deleted payment ${paymentId}`,
  });

  return NextResponse.json({ ok: true });
}
