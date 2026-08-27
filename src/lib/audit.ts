import prisma from "./prisma";

export async function createAuditLog(params: {
  action: string;
  userId?: string | null;
  propertyId?: string;
  documentId?: string;
  details?: string;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        action:     params.action,
        userId:     params.userId || null,
        propertyId: params.propertyId,
        documentId: params.documentId,
        details:    params.details,
      },
    });
  } catch {
    // audit log failure should never break the main flow
  }
}
