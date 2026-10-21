import prisma from "@/lib/prisma";
import {
  FileManagerError,
  assertSameOrigin,
  errorResponse,
  folderName,
  hasOnlyKeys,
  isUniqueConstraint,
  readJsonObject,
} from "@/lib/file-manager";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readJsonObject(request);
    if (!hasOnlyKeys(body, "name")) throw new FileManagerError("Enter a folder name.");
    const name = folderName(body.name);
    const folder = await prisma.fileFolder.create({ data: { name } });
    return Response.json({ folder: { ...folder, _count: { files: 0 } } }, { status: 201 });
  } catch (error) {
    if (isUniqueConstraint(error)) return Response.json({ error: "A folder with that name already exists." }, { status: 409 });
    return errorResponse(error);
  }
}
