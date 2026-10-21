import { mkdir, open, unlink } from "node:fs/promises";
import type { Prisma } from "@/generated/prisma";
import prisma from "@/lib/prisma";
import {
  MAX_FILE_SIZE,
  MAX_MULTIPART_SIZE,
  FileManagerError,
  assertSameOrigin,
  errorResponse,
  extensionsByType,
  fileManagerDirectory,
  fileMetadata,
  newStoredName,
  readBoundedBody,
  storedFilePath,
  type FileType,
  validateFileSignature,
} from "@/lib/file-manager";

export const runtime = "nodejs";

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

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    const rawPage = query.get("page") ?? "1";
    if (!/^[1-9]\d*$/.test(rawPage) || !Number.isSafeInteger(Number(rawPage))) {
      throw new FileManagerError("Invalid page number.");
    }
    const page = Number(rawPage);
    const pageSize = 50;
    const folderId = query.get("folderId");
    const type = query.get("type") ?? "all";
    const trash = query.get("trash") === "1";
    const search = (query.get("search") ?? "").trim();
    if (search.length > 255) throw new FileManagerError("Search is too long.");
    if (!["all", "pdf", "word", "excel"].includes(type)) throw new FileManagerError("Invalid file type.");
    if (!trash && folderId && folderId !== "root") {
      const folder = await prisma.fileFolder.findUnique({ where: { id: folderId }, select: { id: true } });
      if (!folder) throw new FileManagerError("Folder not found.", 404);
    }

    const where: Prisma.ManagedFileWhereInput = {
      trashedAt: trash ? { not: null } : null,
      ...(!trash && folderId === "root" ? { folderId: null } : !trash && folderId ? { folderId } : {}),
      ...(search ? { name: { contains: search } } : {}),
      ...(type !== "all" ? { extension: { in: extensionsByType[type as Exclude<FileType, "all">] } } : {}),
    };

    const [files, total, folders, activeCount, trashCount, folderCounts] = await Promise.all([
      prisma.managedFile.findMany({ where, select: fileSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
      prisma.managedFile.count({ where }),
      prisma.fileFolder.findMany({ orderBy: [{ name: "asc" }, { id: "asc" }] }),
      prisma.managedFile.count({ where: { trashedAt: null } }),
      prisma.managedFile.count({ where: { trashedAt: { not: null } } }),
      prisma.managedFile.groupBy({ by: ["folderId"], where: { trashedAt: null, folderId: { not: null } }, _count: { _all: true } }),
    ]);
    const countsByFolder = new Map(folderCounts.map((item) => [item.folderId, item._count._all]));
    return Response.json({
      files,
      folders: folders.map((folder) => ({ ...folder, _count: { files: countsByFolder.get(folder.id) ?? 0 } })),
      counts: { all: activeCount, trash: trashCount },
      maxFileSize: MAX_FILE_SIZE,
      total,
      page,
      pageSize,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) {
      throw new FileManagerError("Expected a file upload.");
    }
    const length = request.headers.get("content-length");
    if (length && (!/^\d+$/.test(length) || Number(length) > MAX_MULTIPART_SIZE)) {
      throw new FileManagerError("Upload exceeds the 50 MB limit.", 413);
    }
    let form: FormData;
    try {
      const body = await readBoundedBody(request, MAX_MULTIPART_SIZE);
      form = await new Response(new Uint8Array(body), {
        headers: { "Content-Type": request.headers.get("content-type")! },
      }).formData();
    } catch (error) {
      if (error instanceof FileManagerError) throw error;
      throw new FileManagerError("Invalid file upload.");
    }
    if (form.getAll("file").length !== 1 || form.getAll("folderId").length > 1) {
      throw new FileManagerError("Upload one file at a time.");
    }
    const file = form.get("file");
    if (!(file instanceof File)) throw new FileManagerError("Choose a file to upload.");
    if (file.size === 0) throw new FileManagerError("The file is empty.");
    if (file.size > MAX_FILE_SIZE) throw new FileManagerError("Upload exceeds the 50 MB limit.", 413);
    const metadata = fileMetadata(file.name);
    const rawFolder = form.get("folderId");
    if (rawFolder !== null && typeof rawFolder !== "string") throw new FileManagerError("Invalid folder.");
    const folderId = !rawFolder || rawFolder === "root" ? null : rawFolder;
    if (folderId) {
      const folder = await prisma.fileFolder.findUnique({ where: { id: folderId }, select: { id: true } });
      if (!folder) throw new FileManagerError("Folder not found.", 404);
    }

    const directory = fileManagerDirectory();
    const storedName = newStoredName();
    const filePath = storedFilePath(storedName);
    const bytes = Buffer.from(await file.arrayBuffer());
    validateFileSignature(bytes, metadata.extension);
    await mkdir(directory, { recursive: true });
    const handle = await open(filePath, "wx", 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.close();
    } catch (error) {
      await handle.close().catch(() => undefined);
      await unlink(filePath).catch(() => undefined);
      throw error;
    }

    try {
      const created = await prisma.managedFile.create({
        data: { ...metadata, fileSize: bytes.length, storedName, folderId },
        select: fileSelect,
      });
      return Response.json({ file: created }, { status: 201 });
    } catch (error) {
      await unlink(filePath).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    return errorResponse(error);
  }
}
