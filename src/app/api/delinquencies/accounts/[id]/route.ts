import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUser, canWrite, canManage } from "@/lib/request-user";
import { createAuditLog } from "@/lib/audit";
import { recomputeListTotals } from "@/lib/delinquency-settle";
import { SettlementStatus } from "@/types";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const account = await prisma.delinquentAccount.findUnique({
      where: { id },
      include: {
        list: { select: { id: true, municipality: true, province: true, asOfDate: true } },
        settlements: {
          orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
          include: { recordedBy: { select: { name: true } } },
        },
      },
    });
    if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ account });
  } catch (e) {
    console.error("[GET /api/delinquencies/accounts/[id]]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getRequestUser(req);
    if (!canWrite(user.role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }
    const body = await req.json();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {};
    if (typeof body.notes === "string") data.notes = body.notes;

    if (typeof body.status === "string") {
      const valid: SettlementStatus[] = ["OUTSTANDING", "PARTIAL", "SETTLED", "RESOLVED"];
      if (!valid.includes(body.status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      data.status = body.status;
      data.settledAt = body.status === "SETTLED" ? new Date() : null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const account = await prisma.delinquentAccount.update({ where: { id }, data });
    if (data.status) await recomputeListTotals(account.listId);

    await createAuditLog({
      action: "DELINQUENCY_ACCOUNT_UPDATE",
      userId: user.id,
      details: `${account.tdNumber}: ${Object.keys(data).join(", ")}`,
    });
    return NextResponse.json({ account });
  } catch (e) {
    console.error("[PATCH /api/delinquencies/accounts/[id]]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getRequestUser(req);
    if (!canManage(user.role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }
    const account = await prisma.delinquentAccount.delete({ where: { id } });
    await recomputeListTotals(account.listId);
    await createAuditLog({
      action: "DELINQUENCY_ACCOUNT_DELETE",
      userId: user.id,
      details: `Deleted delinquent account ${account.tdNumber}`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/delinquencies/accounts/[id]]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
