import prisma from "@/lib/prisma";
import {
  FileManagerError,
  assertSameOrigin,
  errorResponse,
  hasOnlyKeys,
  readJsonObject,
  renamedFileName,
} from "@/lib/file-manager";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

const fileSelect = {
  id: true,
  name: true,
  extension: true,
  mimeType: true,
  fileSize: true,
  folderId: true,
  trashedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function PATCH(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    const body = await readJsonObject(request);
    const existing = await prisma.managedFile.findUnique({ where: { id }, select: { id: true, extension: true } });
    if (!existing) throw new FileManagerError("File not found.", 404);

    if (hasOnlyKeys(body, "name")) {
      const name = renamedFileName(body.name, existing.extension);
      const file = await prisma.managedFile.update({ where: { id }, data: { name }, select: fileSelect });
      return Response.json({ file });
    }
    if (hasOnlyKeys(body, "folderId")) {
      if (body.folderId !== null && (typeof body.folderId !== "string" || !body.folderId || body.folderId === "root")) {
        throw new FileManagerError("Invalid folder.");
      }
      if (body.folderId) {
        const folder = await prisma.fileFolder.findUnique({ where: { id: body.folderId }, select: { id: true } });
        if (!folder) throw new FileManagerError("Folder not found.", 404);
      }
      const file = await prisma.managedFile.update({ where: { id }, data: { folderId: body.folderId }, select: fileSelect });
      return Response.json({ file });
    }
    if (hasOnlyKeys(body, "trashed")) {
      if (typeof body.trashed !== "boolean") throw new FileManagerError("Invalid trash action.");
      const file = await prisma.managedFile.update({
        where: { id },
        data: { trashedAt: body.trashed ? new Date() : null },
        select: fileSelect,
      });
      return Response.json({ file });
    }
    throw new FileManagerError("Choose one file action.");
  } catch (error) {
    return errorResponse(error);
  }
}
