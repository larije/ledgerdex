import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import path from "path";
import fs from "fs/promises";
import { randomUUID } from "crypto";

const ATT_DIR = path.join(process.cwd(), process.env.UPLOAD_DIR ?? "uploads", "attachments");

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const attachments = await prisma.attachment.findMany({
    where: { propertyId: id },
    orderBy: { createdAt: "desc" },
    include: { uploadedBy: { select: { name: true } } },
  });
  return NextResponse.json({ attachments });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = req.headers.get("x-user-id") || null;

  await fs.mkdir(ATT_DIR, { recursive: true });

  const formData  = await req.formData();
  const file      = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const ext        = path.extname(file.name);
  const storedName = `${randomUUID()}${ext}`;
  const filePath   = path.join(ATT_DIR, storedName);
  const buffer     = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(filePath, buffer);

  const attachment = await prisma.attachment.create({
    data: {
      propertyId:   id,
      originalName: file.name,
      storedName,
      fileSize:     buffer.length,
      mimeType:     file.type,
      uploadedById: userId,
    },
    include: { uploadedBy: { select: { name: true } } },
  });

  await createAuditLog({ action: "ATTACHMENT_UPLOAD", userId, propertyId: id, details: file.name });
  return NextResponse.json({ attachment }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = req.headers.get("x-user-id") || null;
  const { attachmentId } = await req.json();

  const att = await prisma.attachment.findUnique({ where: { id: attachmentId } });
  if (!att) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.attachment.delete({ where: { id: attachmentId } });
  try { await fs.unlink(path.join(ATT_DIR, att.storedName)); } catch {}

  await createAuditLog({ action: "ATTACHMENT_DELETE", userId, propertyId: id, details: att.originalName });
  return NextResponse.json({ ok: true });
}
