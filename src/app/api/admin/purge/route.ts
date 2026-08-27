import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import fs from "fs";
import path from "path";

export async function POST(req: NextRequest) {
  const { targets } = (await req.json()) as { targets: string[] };
  const deleted: Record<string, number> = {};

  // Collect physical files before DB deletion
  const filesToDelete: string[] = [];
  if (targets.includes("properties")) {
    const atts = await prisma.attachment.findMany({ select: { storedName: true } });
    atts.forEach((a) =>
      filesToDelete.push(path.join(process.cwd(), "uploads", "attachments", a.storedName))
    );
  }
  if (targets.includes("documents")) {
    const docs = await prisma.document.findMany({ select: { storedName: true } });
    docs.forEach((d) =>
      filesToDelete.push(path.join(process.cwd(), "uploads", "documents", d.storedName))
    );
  }

  // Null out FK references on audit_logs to allow property/document deletion
  if (targets.includes("properties")) {
    await prisma.auditLog.updateMany({ where: { propertyId: { not: null } }, data: { propertyId: null } });
  }
  if (targets.includes("documents")) {
    await prisma.auditLog.updateMany({ where: { documentId: { not: null } }, data: { documentId: null } });
  }

  // Delete in safe order
  if (targets.includes("audit_logs")) {
    const r = await prisma.auditLog.deleteMany({});
    deleted.audit_logs = r.count;
  }

  // Only delete payments separately when not also deleting properties (which cascades them)
  if (targets.includes("payments") && !targets.includes("properties")) {
    const r = await prisma.payment.deleteMany({});
    deleted.payments = r.count;
  }

  if (targets.includes("properties")) {
    const r = await prisma.property.deleteMany({});
    deleted.properties = r.count;
  }

  if (targets.includes("documents")) {
    // Unlink properties from documents if properties weren't wiped
    if (!targets.includes("properties")) {
      await prisma.property.updateMany({ data: { documentId: null } });
    }
    const r = await prisma.document.deleteMany({});
    deleted.documents = r.count;
  }

  // Delete physical files after successful DB operations
  for (const fp of filesToDelete) {
    try { fs.unlinkSync(fp); } catch {}
  }

  return NextResponse.json({ ok: true, deleted });
}
