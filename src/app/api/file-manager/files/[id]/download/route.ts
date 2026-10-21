import { readFile, stat } from "node:fs/promises";
import prisma from "@/lib/prisma";
import {
  FileManagerError,
  MAX_FILE_SIZE,
  attachmentDisposition,
  errorResponse,
  storedFilePath,
} from "@/lib/file-manager";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const file = await prisma.managedFile.findUnique({ where: { id } });
    if (!file || file.trashedAt) throw new FileManagerError("File not found.", 404);
    const preview = new URL(request.url).searchParams.get("preview") === "1";
    if (preview && file.extension !== "pdf") {
      throw new FileManagerError("Preview is available for PDF files only.");
    }
    const filePath = storedFilePath(file.storedName);
    let bytes: Buffer;
    try {
      const info = await stat(filePath);
      if (!info.isFile() || info.size !== file.fileSize || info.size > MAX_FILE_SIZE) {
        throw new FileManagerError("File is unavailable.", 404);
      }
      bytes = await readFile(filePath);
    } catch (error) {
      if (error instanceof FileManagerError) throw error;
      throw new FileManagerError("File is unavailable.", 404);
    }
    if (bytes.length !== file.fileSize) throw new FileManagerError("File is unavailable.", 404);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(bytes.length),
        "Content-Disposition": attachmentDisposition(file.name, preview),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
