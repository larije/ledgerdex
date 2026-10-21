import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { canWrite, getRequestUser } from "@/lib/request-user";
import { validatePrintBatch } from "@/lib/td-print-history";

const PAGE_SIZE = 10;
const MAX_SKIP = 100_000;

function parsePage(value: string | null): number | null {
  if (value === null) return 1;
  if (!/^\d+$/.test(value)) return null;
  const page = Number(value);
  if (!Number.isSafeInteger(page) || page < 1 || (page - 1) * PAGE_SIZE > MAX_SKIP) return null;
  return page;
}

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const page = parsePage(searchParams.get("page"));
  const search = (searchParams.get("search") ?? "").trim();

  if (page === null) {
    return NextResponse.json({ error: "Page must be a positive integer within the supported range" }, { status: 400 });
  }
  if (search.length > 255) {
    return NextResponse.json({ error: "Search must be 255 characters or fewer" }, { status: 400 });
  }

  const where = search
    ? {
        OR: [
          { location: { contains: search } },
          { entries: { some: { tdNumber: { contains: search } } } },
        ],
      }
    : undefined;
  const skip = (page - 1) * PAGE_SIZE;

  try {
    const [batches, total] = await Promise.all([
      prisma.tDPrintBatch.findMany({
        where,
        skip,
        take: PAGE_SIZE,
        orderBy: [{ printedOn: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          location: true,
          note: true,
          printedOn: true,
          createdAt: true,
          _count: { select: { entries: true } },
        },
      }),
      prisma.tDPrintBatch.count({ where }),
    ]);

    return NextResponse.json({ batches, total, page, pageSize: PAGE_SIZE });
  } catch (error) {
    console.error("[GET /api/td-print-batches]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!canWrite(user.role)) {
    return NextResponse.json({ error: "Not authorized to record a print batch" }, { status: 403 });
  }

  let input: ReturnType<typeof validatePrintBatch>;
  let requestId: string | undefined;
  try {
    const body: unknown = await req.json();
    input = validatePrintBatch(body);
    const suppliedId = (body as { requestId?: unknown }).requestId;
    if (suppliedId !== undefined) {
      if (typeof suppliedId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(suppliedId)) {
        throw new Error("Request ID must be a valid UUID.");
      }
      requestId = suppliedId.toLowerCase();
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid JSON request body" },
      { status: 400 },
    );
  }

  try {
    const batch = await prisma.tDPrintBatch.create({
      data: {
        // Reusing a client request ID makes retrying a lost response safe.
        id: requestId,
        location: input.location,
        printedOn: new Date(`${input.printedOn}T00:00:00.000Z`),
        entries: {
          create: input.tdNumbers.map((tdNumber, index) => ({
            tdNumber,
            position: index + 1,
          })),
        },
      },
      include: {
        entries: {
          select: { id: true, tdNumber: true, position: true, isPrinted: true },
          orderBy: { position: "asc" },
        },
      },
    });

    await createAuditLog({
      action: "TD_PRINT_BATCH_CREATE",
      userId: user.id,
      details: `${batch.location}: ${batch.entries.length} TD number(s), printed ${input.printedOn}`,
    });

    return NextResponse.json({ batch }, { status: 201 });
  } catch (error) {
    // Check the code across module reloads; the shared Prisma client can outlive its error class.
    if (requestId && typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      const existing = await prisma.tDPrintBatch.findUnique({
        where: { id: requestId },
        include: { entries: { select: { id: true, tdNumber: true, position: true, isPrinted: true }, orderBy: { position: "asc" } } },
      }).catch(() => null);
      if (existing) {
        const sameBatch = existing.location === input.location
          && existing.printedOn.toISOString().slice(0, 10) === input.printedOn
          && existing.entries.length === input.tdNumbers.length
          && existing.entries.every((entry, index) => entry.tdNumber === input.tdNumbers[index]);
        if (sameBatch) return NextResponse.json({ batch: existing });
        return NextResponse.json({ error: "This request ID already belongs to a different batch." }, { status: 409 });
      }
    }
    console.error("[POST /api/td-print-batches]", error);
    return NextResponse.json({ error: "Unable to save print batch" }, { status: 500 });
  }
}
