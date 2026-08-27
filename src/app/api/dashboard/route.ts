import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
  const [
    totalDocuments,
    totalProperties,
    statusCounts,
    taxabilityCounts,
    totalAssessedValue,
    recentDocuments,
    recentProperties,
  ] = await Promise.all([
    prisma.document.count(),
    prisma.property.count(),
    prisma.property.groupBy({ by: ["paymentStatus"], _count: { _all: true } }),
    prisma.property.groupBy({ by: ["taxability"], _count: { _all: true } }),
    prisma.property.aggregate({ _sum: { assessedValue: true } }),
    prisma.document.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: { uploadedBy: { select: { name: true } } },
    }),
    prisma.property.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      select: {
        id: true, tdNumber: true, propertyLocation: true, municipality: true,
        paymentStatus: true, assessedValue: true, type: true, taxability: true,
        createdAt: true,
      },
    }),
  ]);

  const byStatus = Object.fromEntries(statusCounts.map((s) => [s.paymentStatus, s._count._all]));
  const byTaxability = Object.fromEntries(taxabilityCounts.map((t) => [t.taxability, t._count._all]));

  return NextResponse.json({
    totalDocuments,
    totalProperties,
    paidCount:       byStatus.PAID       ?? 0,
    unpaidCount:     byStatus.UNPAID     ?? 0,
    partialCount:    byStatus.PARTIAL    ?? 0,
    delinquentCount: byStatus.DELINQUENT ?? 0,
    advanceCount:    byStatus.ADVANCE    ?? 0,
    currentCount:    byStatus.CURRENT    ?? 0,
    taxableProperties: byTaxability.TAXABLE ?? 0,
    exemptProperties:  byTaxability.EXEMPT  ?? 0,
    totalAssessedValue: Number(totalAssessedValue._sum.assessedValue ?? 0),
    recentDocuments,
    recentProperties,
  });
  } catch (err) {
    console.error("[dashboard]", err);
    return NextResponse.json({ error: "Failed to load dashboard data" }, { status: 500 });
  }
}
