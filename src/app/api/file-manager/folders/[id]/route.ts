import prisma from "@/lib/prisma";
import {
  FileManagerError,
  assertSameOrigin,
  errorResponse,
  folderName,
  hasOnlyKeys,
  isForeignKeyConstraint,
  isUniqueConstraint,
  readJsonObject,
} from "@/lib/file-manager";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    const body = await readJsonObject(request);
    if (!hasOnlyKeys(body, "name")) throw new FileManagerError("Enter a folder name.");
    const name = folderName(body.name);
    const existing = await prisma.fileFolder.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new FileManagerError("Folder not found.", 404);
    const folder = await prisma.fileFolder.update({ where: { id }, data: { name } });
    const files = await prisma.managedFile.count({ where: { folderId: id, trashedAt: null } });
    return Response.json({ folder: { ...folder, _count: { files } } });
  } catch (error) {
    if (isUniqueConstraint(error)) return Response.json({ error: "A folder with that name already exists." }, { status: 409 });
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    const existing = await prisma.fileFolder.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new FileManagerError("Folder not found.", 404);
    const files = await prisma.managedFile.count({ where: { folderId: id } });
    if (files) throw new FileManagerError("Move all files out of this folder before deleting it.", 409);
    await prisma.fileFolder.delete({ where: { id } });
    return Response.json({ success: true });
  } catch (error) {
    if (isForeignKeyConstraint(error)) {
      return Response.json({ error: "Move all files out of this folder before deleting it." }, { status: 409 });
    }
    return errorResponse(error);
  }
}
