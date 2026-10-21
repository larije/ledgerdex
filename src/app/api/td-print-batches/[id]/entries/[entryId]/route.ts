import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { canWrite, getRequestUser } from "@/lib/request-user";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2025";
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  const user = await getRequestUser(req);
  if (!canWrite(user.role)) {
    return NextResponse.json({ error: "Not authorized to update a print mark" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
  }

  if (!isRecord(body) || Object.keys(body).length !== 1 || typeof body.isPrinted !== "boolean") {
    return NextResponse.json({ error: "isPrinted must be a boolean" }, { status: 400 });
  }

  const { id: batchId, entryId } = await params;
  try {
    const entry = await prisma.tDPrintEntry.update({
      where: { id: entryId, batchId },
      data: { isPrinted: body.isPrinted },
      select: { id: true, tdNumber: true, position: true, isPrinted: true },
    });

    return NextResponse.json({ entry });
  } catch (error) {
    if (isNotFound(error)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    console.error("[PATCH /api/td-print-batches/[id]/entries/[entryId]]", error);
    return NextResponse.json({ error: "Unable to update print mark" }, { status: 500 });
  }
}
