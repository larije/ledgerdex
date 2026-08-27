import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUser, canWrite } from "@/lib/request-user";
import { createAuditLog } from "@/lib/audit";
import { recomputeAccountSettlement } from "@/lib/delinquency-settle";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const settlements = await prisma.settlementPayment.findMany({
    where: { accountId: id },
    orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
    include: { recordedBy: { select: { name: true } } },
  });
  return NextResponse.json({ settlements });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getRequestUser(req);
  if (!canWrite(user.role)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await req.json();
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Amount must be a positive number" }, { status: 400 });
  }

  const account = await prisma.delinquentAccount.findUnique({ where: { id }, select: { id: true, tdNumber: true } });
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const settlement = await prisma.settlementPayment.create({
    data: {
      accountId: id,
      amount,
      orNumber: body.orNumber ?? null,
      paymentDate: body.paymentDate ? new Date(body.paymentDate) : null,
      collector: body.collector ?? null,
      notes: body.notes ?? null,
      recordedById: user.id,
    },
    include: { recordedBy: { select: { name: true } } },
  });

  await recomputeAccountSettlement(id);

  await createAuditLog({
    action: "DELINQUENCY_SETTLEMENT_ADD",
    userId: user.id,
    details: `${account.tdNumber}: OR#${body.orNumber ?? "N/A"} ₱${amount.toLocaleString("en-PH")}`,
  });

  const updated = await prisma.delinquentAccount.findUnique({
    where: { id },
    select: { amountPaid: true, balance: true, status: true },
  });

  return NextResponse.json({ settlement, account: updated }, { status: 201 });
}
