import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import path from "path";
import fs from "fs/promises";

const UPLOAD_DIR = path.join(process.cwd(), process.env.UPLOAD_DIR ?? "uploads", "documents");

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const filePath = path.join(UPLOAD_DIR, doc.storedName);
  try {
    const buffer = await fs.readFile(filePath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${doc.originalName}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found on disk" }, { status: 404 });
  }
}
