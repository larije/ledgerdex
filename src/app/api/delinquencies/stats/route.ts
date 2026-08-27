import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";

/**
 * Aggregated figures for the Delinquencies overview dashboard.
 * "Active" delinquent = still on the latest list (isPresent) and not settled.
 */
export async function GET() {
  try {
    const activeWhere: Prisma.DelinquentAccountWhereInput = {
      isPresent: true,
      status: { in: ["OUTSTANDING", "PARTIAL"] },
    };

    const [
      lists,
      outstanding,
      activeCount,
      settledCount,
      collected,
      byClass,
      byRpuType,
      byBarangay,
      topDelinquents,
      oldest,
    ] = await Promise.all([
      prisma.delinquencyList.findMany({
        orderBy: [{ municipality: "asc" }],
        select: {
          id: true,
          municipality: true,
          province: true,
          accountCount: true,
          totalAmountDue: true,
          totalSettled: true,
          asOfDate: true,
        },
      }),
      prisma.delinquentAccount.aggregate({ where: activeWhere, _sum: { balance: true } }),
      prisma.delinquentAccount.count({ where: activeWhere }),
      prisma.delinquentAccount.count({ where: { status: "SETTLED" } }),
      prisma.delinquentAccount.aggregate({ _sum: { amountPaid: true } }),
      prisma.delinquentAccount.groupBy({
        by: ["classCode"],
        where: { isPresent: true },
        _count: { _all: true },
        _sum: { balance: true },
      }),
      prisma.delinquentAccount.groupBy({
        by: ["rpuType"],
        where: { isPresent: true },
        _count: { _all: true },
        _sum: { balance: true },
      }),
      prisma.delinquentAccount.groupBy({
        by: ["barangay"],
        where: activeWhere,
        _count: { _all: true },
        _sum: { balance: true },
        orderBy: { _sum: { balance: "desc" } },
        take: 12,
      }),
      prisma.delinquentAccount.findMany({
        where: activeWhere,
        orderBy: { balance: "desc" },
        take: 10,
        select: {
          id: true,
          taxpayerName: true,
          tdNumber: true,
          balance: true,
          barangay: true,
          list: { select: { municipality: true } },
        },
      }),
      prisma.delinquentAccount.findMany({
        where: { ...activeWhere, delinquentFromYear: { not: null } },
        orderBy: { delinquentFromYear: "asc" },
        take: 10,
        select: {
          id: true,
          taxpayerName: true,
          tdNumber: true,
          balance: true,
          delinquentFromYear: true,
          delinquentFromQuarter: true,
          list: { select: { municipality: true } },
        },
      }),
    ]);

    return NextResponse.json({
      totals: {
        outstandingBalance: Number(outstanding._sum.balance ?? 0),
        activeAccounts: activeCount,
        settledAccounts: settledCount,
        totalCollected: Number(collected._sum.amountPaid ?? 0),
        listCount: lists.length,
      },
      lists,
      byClass: byClass.map((c) => ({
        classCode: c.classCode,
        count: c._count._all,
        balance: Number(c._sum.balance ?? 0),
      })),
      byRpuType: byRpuType.map((r) => ({
        rpuType: r.rpuType,
        count: r._count._all,
        balance: Number(r._sum.balance ?? 0),
      })),
      byBarangay: byBarangay.map((b) => ({
        barangay: b.barangay,
        count: b._count._all,
        balance: Number(b._sum.balance ?? 0),
      })),
      topDelinquents,
      oldest,
    });
  } catch (e) {
    console.error("[GET /api/delinquencies/stats]", e);
    return NextResponse.json({ error: "Failed to load stats" }, { status: 500 });
  }
}
