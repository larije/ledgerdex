import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { canWrite, getRequestUser } from "@/lib/request-user";
import { validateBatchNoteUpdate } from "@/lib/td-print-history";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const batch = await prisma.tDPrintBatch.findUnique({
      where: { id },
      include: {
        entries: {
          select: { id: true, tdNumber: true, position: true, isPrinted: true },
          orderBy: { position: "asc" },
        },
      },
    });

    if (!batch) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ batch });
  } catch (error) {
    console.error("[GET /api/td-print-batches/[id]]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getRequestUser(req);
  if (!canWrite(user.role)) {
    return NextResponse.json({ error: "Not authorized to update a batch note" }, { status: 403 });
  }

  let input: ReturnType<typeof validateBatchNoteUpdate>;
  try {
    input = validateBatchNoteUpdate(await req.json());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid JSON request body" },
      { status: 400 },
    );
  }

  const { id } = await params;
  try {
    const batch = await prisma.tDPrintBatch.update({
      where: { id },
      data: { note: input.note },
      select: { id: true, note: true },
    });

    await createAuditLog({
      action: "TD_PRINT_BATCH_NOTE_UPDATE",
      userId: user.id,
      details: `Batch ${batch.id}: note ${batch.note === null ? "cleared" : "updated"}`,
    });

    return NextResponse.json({ batch });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("[PATCH /api/td-print-batches/[id]]", error);
    return NextResponse.json({ error: "Unable to save batch note" }, { status: 500 });
  }
}
