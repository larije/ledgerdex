import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  const [
    propertyCount,
    documentCount,
    paymentCount,
    auditCount,
    documentSize,
    attachmentCount,
    attachmentSize,
  ] = await Promise.all([
    prisma.property.count(),
    prisma.document.count(),
    prisma.payment.count(),
    prisma.auditLog.count(),
    prisma.document.aggregate({ _sum: { fileSize: true } }),
    prisma.attachment.count(),
    prisma.attachment.aggregate({ _sum: { fileSize: true } }),
  ]);

  return NextResponse.json({
    propertyCount,
    documentCount,
    paymentCount,
    auditCount,
    attachmentCount,
    documentSizeBytes:    documentSize._sum.fileSize    ?? 0,
    attachmentSizeBytes:  attachmentSize._sum.fileSize  ?? 0,
  });
}
