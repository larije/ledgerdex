import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { buildAccountWhere, buildAccountOrderBy } from "@/lib/delinquency-query";

export async function GET(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams;
    const page = Math.max(1, parseInt(sp.get("page") ?? "1"));
    // Cap high enough that a filtered set can be pulled in one go for client-side
    // CSV/PDF/notice export; the paginated table uses limit=25.
    const limit = Math.min(5000, Math.max(1, parseInt(sp.get("limit") ?? "25")));
    const skip = (page - 1) * limit;

    const where = buildAccountWhere(sp);
    const orderBy = buildAccountOrderBy(sp.get("sort"));

    const [accounts, total, sums] = await Promise.all([
      prisma.delinquentAccount.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          list: { select: { id: true, municipality: true, province: true } },
          _count: { select: { settlements: true } },
        },
      }),
      prisma.delinquentAccount.count({ where }),
      prisma.delinquentAccount.aggregate({
        where,
        _sum: { amountDue: true, amountPaid: true, balance: true },
      }),
    ]);

    return NextResponse.json({
      accounts,
      total,
      page,
      limit,
      totals: {
        amountDue: Number(sums._sum.amountDue ?? 0),
        amountPaid: Number(sums._sum.amountPaid ?? 0),
        balance: Number(sums._sum.balance ?? 0),
      },
    });
  } catch (e) {
    console.error("[GET /api/delinquencies/accounts]", e);
    return NextResponse.json(
      { accounts: [], total: 0, page: 1, limit: 25, totals: { amountDue: 0, amountPaid: 0, balance: 0 } },
      { status: 500 }
    );
  }
}
