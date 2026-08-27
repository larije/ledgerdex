import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/** Distinct barangays for the account filter, optionally scoped to a municipality. */
export async function GET(req: NextRequest) {
  try {
    const municipality = new URL(req.url).searchParams.get("municipality");
    const rows = await prisma.delinquentAccount.findMany({
      where: {
        barangay: { not: null },
        ...(municipality ? { list: { municipality } } : {}),
      },
      distinct: ["barangay"],
      select: { barangay: true },
      orderBy: { barangay: "asc" },
    });
    return NextResponse.json({ barangays: rows.map((r) => r.barangay).filter(Boolean) });
  } catch (e) {
    console.error("[GET /api/delinquencies/barangays]", e);
    return NextResponse.json({ barangays: [] }, { status: 500 });
  }
}
