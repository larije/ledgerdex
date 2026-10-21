import { NextResponse } from "next/server";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import prisma from "@/lib/prisma";
import { attachmentDisposition } from "@/lib/file-manager";

export const runtime = "nodejs";

const UPLOAD_DIR = path.join(
  process.cwd(),
  process.env.UPLOAD_DIR ?? "uploads",
  "delinquencies"
);

type Context = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Context) {
  try {
    const { id } = await params;
    const importedFile = await prisma.delinquencyImport.findUnique({
      where: { id },
      select: { fileName: true, storedName: true, fileSize: true },
    });
    if (!importedFile || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/i.test(importedFile.storedName)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const filePath = path.join(UPLOAD_DIR, importedFile.storedName);
    const fileInfo = await stat(filePath).catch(() => null);
    if (!fileInfo?.isFile() || fileInfo.size !== importedFile.fileSize) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const buffer = await readFile(filePath);
    if (buffer.length !== importedFile.fileSize) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(buffer.length),
        "Content-Disposition": attachmentDisposition(importedFile.fileName, true),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[GET /api/delinquencies/imports/[id]/view]", error);
    return NextResponse.json({ error: "Could not open the imported PDF" }, { status: 500 });
  }
}
