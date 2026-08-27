import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const lists = await prisma.delinquencyList.findMany({
      orderBy: [{ province: "asc" }, { municipality: "asc" }],
      include: { _count: { select: { accounts: true, imports: true } } },
    });
    return NextResponse.json({ lists });
  } catch (e) {
    console.error("[GET /api/delinquencies/lists]", e);
    return NextResponse.json({ lists: [] }, { status: 500 });
  }
}
