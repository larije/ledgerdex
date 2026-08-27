import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUser, canManage } from "@/lib/request-user";
import { createAuditLog } from "@/lib/audit";
import { recomputeAccountSettlement } from "@/lib/delinquency-settle";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sid: string }> }
) {
  const { id, sid } = await params;
  const user = await getRequestUser(req);
  if (!canManage(user.role)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  const body = await req.json();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {};
  if (body.amount != null) {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Amount must be a positive number" }, { status: 400 });
    }
    data.amount = amount;
  }
  if ("orNumber" in body) data.orNumber = body.orNumber ?? null;
  if ("collector" in body) data.collector = body.collector ?? null;
  if ("notes" in body) data.notes = body.notes ?? null;
  if ("paymentDate" in body) data.paymentDate = body.paymentDate ? new Date(body.paymentDate) : null;

  const settlement = await prisma.settlementPayment.update({ where: { id: sid }, data });
  await recomputeAccountSettlement(id);

  await createAuditLog({
    action: "DELINQUENCY_SETTLEMENT_EDIT",
    userId: user.id,
    details: `Edited settlement ${sid}`,
  });
  return NextResponse.json({ settlement });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sid: string }> }
) {
  const { id, sid } = await params;
  const user = await getRequestUser(req);
  if (!canManage(user.role)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  await prisma.settlementPayment.delete({ where: { id: sid } });
  await recomputeAccountSettlement(id);

  await createAuditLog({
    action: "DELINQUENCY_SETTLEMENT_VOID",
    userId: user.id,
    details: `Voided settlement ${sid}`,
  });
  return NextResponse.json({ ok: true });
}
