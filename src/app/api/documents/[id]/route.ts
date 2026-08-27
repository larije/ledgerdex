import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import path from "path";
import fs from "fs/promises";

const UPLOAD_DIR = path.join(process.cwd(), process.env.UPLOAD_DIR ?? "uploads", "documents");

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await prisma.document.findUnique({
    where: { id },
    include: {
      uploadedBy: { select: { id: true, name: true } },
      properties: {
        orderBy: { createdAt: "asc" },
        include: { _count: { select: { remarks: true, payments: true, attachments: true } } },
      },
    },
  });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ document: doc });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.document.delete({ where: { id } });
  try {
    await fs.unlink(path.join(UPLOAD_DIR, doc.storedName));
  } catch {}
  return NextResponse.json({ ok: true });
}
