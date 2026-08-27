import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  let dbStatus: "connected" | "error" = "error";
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = "connected";
  } catch {}

  const payload = {
    status:    dbStatus === "connected" ? "ok" : "error",
    db:        dbStatus,
    uptime:    process.uptime(),
    version:   process.env.npm_package_version ?? "0.1.0",
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(payload, {
    status: dbStatus === "connected" ? 200 : 503,
  });
}
