import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUser, canAdmin } from "@/lib/request-user";
import { createAuditLog } from "@/lib/audit";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const list = await prisma.delinquencyList.findUnique({
      where: { id },
      include: {
        _count: { select: { accounts: true } },
        imports: {
          orderBy: { createdAt: "desc" },
          include: { importedBy: { select: { name: true } } },
        },
      },
    });
    if (!list) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Status breakdown for this list.
    const byStatus = await prisma.delinquentAccount.groupBy({
      by: ["status"],
      where: { listId: id },
      _count: { _all: true },
      _sum: { balance: true },
    });

    return NextResponse.json({ list, byStatus });
  } catch (e) {
    console.error("[GET /api/delinquencies/lists/[id]]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getRequestUser(req);
    if (!canAdmin(user.role)) {
      return NextResponse.json({ error: "Only an administrator can delete a list" }, { status: 403 });
    }
    const list = await prisma.delinquencyList.delete({ where: { id } });
    await createAuditLog({
      action: "DELINQUENCY_LIST_DELETE",
      userId: user.id,
      details: `Deleted delinquency list ${list.municipality}`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/delinquencies/lists/[id]]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
