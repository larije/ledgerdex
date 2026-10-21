import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const municipality = req.nextUrl.searchParams.get("municipality");
    const rows = await prisma.property.findMany({
      where: {
        barangay: { not: null },
        ...(municipality ? { municipality: { contains: municipality } } : {}),
      },
      distinct: ["barangay"],
      select: { barangay: true },
      orderBy: { barangay: "asc" },
    });
    return NextResponse.json({ barangays: rows.map((row) => row.barangay).filter(Boolean) });
  } catch (error) {
    console.error("[GET /api/properties/barangays]", error);
    return NextResponse.json({ barangays: [] }, { status: 500 });
  }
}