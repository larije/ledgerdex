import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const page   = Math.max(1, parseInt(sp.get("page")  ?? "1"));
  const limit  = Math.min(100, parseInt(sp.get("limit") ?? "30"));
  const skip   = (page - 1) * limit;
  const action = sp.get("action") ?? "";

  const where = action ? { action } : undefined;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        user:     { select: { name: true } },
        property: { select: { tdNumber: true } },
        document: { select: { originalName: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return NextResponse.json({ logs, total, page, limit });
}
