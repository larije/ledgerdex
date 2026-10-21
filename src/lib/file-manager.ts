import { randomUUID } from "node:crypto";
import path from "node:path";

export const MAX_FILE_SIZE = 50 * 1024 * 1024;
export const MAX_MULTIPART_SIZE = MAX_FILE_SIZE + 1024 * 1024;

const mimeByExtension = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
} as const;

export type FileExtension = keyof typeof mimeByExtension;
export type FileType = "all" | "pdf" | "word" | "excel";

export const extensionsByType: Record<Exclude<FileType, "all">, FileExtension[]> = {
  pdf: ["pdf"],
  word: ["doc", "docx"],
  excel: ["xls", "xlsx", "csv"],
};

export class FileManagerError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof FileManagerError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error("File Manager request failed:", error);
  return Response.json({ error: "File Manager request failed. Please try again." }, { status: 500 });
}

export function assertSameOrigin(request: Request): void {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new FileManagerError("Cross-site requests are not allowed.", 403);
  }
  const origin = request.headers.get("origin");
  if (origin) {
    // Standalone Next.js may put its bind address in request.url. The incoming
    // Host is the authority the browser actually used for this request.
    const requestUrl = new URL(request.url);
    const host = request.headers.get("host");
    let expectedOrigin = requestUrl.origin;
    if (host) {
      if (/[/\\?#@\s]/.test(host)) throw new FileManagerError("Cross-origin requests are not allowed.", 403);
      try {
        expectedOrigin = new URL(`${requestUrl.protocol}//${host}`).origin;
      } catch {
        throw new FileManagerError("Cross-origin requests are not allowed.", 403);
      }
    }
    if (origin !== expectedOrigin) throw new FileManagerError("Cross-origin requests are not allowed.", 403);
  }
}

export function assertJson(request: Request): void {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new FileManagerError("Expected a JSON request.");
  }
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  assertJson(request);
  let value: unknown;
  try {
    const bytes = await readBoundedBody(request, 4096);
    value = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    if (error instanceof FileManagerError) throw error;
    throw new FileManagerError("Invalid JSON request.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new FileManagerError("Expected a JSON object.");
  }
  return value as Record<string, unknown>;
}

export async function readBoundedBody(request: Request, maxBytes: number): Promise<Buffer> {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) {
    throw new FileManagerError("Request is too large.", 413);
  }
  if (!request.body) throw new FileManagerError("Request body is missing.");
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new FileManagerError("Request is too large.", 413);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

export function hasOnlyKeys(value: Record<string, unknown>, ...keys: string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

export function cleanFileName(value: unknown): string {
  if (typeof value !== "string") throw new FileManagerError("Enter a file name.");
  const name = value.trim();
  if (!name || name.length > 255 || name === "." || name === ".." || /[\\/\x00-\x1f\x7f]/.test(name)) {
    throw new FileManagerError("Enter a valid file name of up to 255 characters.");
  }
  return name;
}

export function fileMetadata(nameValue: unknown): { name: string; extension: FileExtension; mimeType: string } {
  const name = cleanFileName(nameValue);
  const extension = name.split(".").pop()?.toLowerCase();
  if (!extension || !Object.hasOwn(mimeByExtension, extension)) {
    throw new FileManagerError("Choose a PDF, Word, Excel, or CSV file.");
  }
  return { name, extension: extension as FileExtension, mimeType: mimeByExtension[extension as FileExtension] };
}

export function validateFileSignature(bytes: Uint8Array, extension: FileExtension): void {
  const startsWith = (...signature: number[]) =>
    signature.every((byte, index) => bytes[index] === byte);
  const ole = startsWith(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
  const zip = startsWith(0x50, 0x4b, 0x03, 0x04);
  const pdf = startsWith(0x25, 0x50, 0x44, 0x46, 0x2d);
  const valid = extension === "pdf" ? pdf
    : extension === "doc" || extension === "xls" ? ole
    : extension === "docx" || extension === "xlsx" ? zip
    : !bytes.includes(0);
  if (!valid) throw new FileManagerError("File content does not match its extension.");
}

export function renamedFileName(value: unknown, originalExtension: string): string {
  const name = cleanFileName(value);
  const extension = originalExtension.toLowerCase();
  if (!Object.hasOwn(mimeByExtension, extension)) throw new FileManagerError("Unsupported file type.");
  if (name.toLowerCase().endsWith(`.${extension}`)) return name;
  const requestedExtension = name.split(".").pop()?.toLowerCase();
  if (requestedExtension && Object.hasOwn(mimeByExtension, requestedExtension)) {
    throw new FileManagerError("The file extension cannot be changed.");
  }
  if (name.length + extension.length + 1 > 255) {
    throw new FileManagerError("Enter a shorter file name.");
  }
  return `${name}.${extension}`;
}

export function folderName(value: unknown): string {
  if (typeof value !== "string") throw new FileManagerError("Enter a folder name.");
  const name = value.trim();
  if (!name || name.length > 100 || /[\x00-\x1f\x7f]/.test(name)) {
    throw new FileManagerError("Enter a folder name of up to 100 characters.");
  }
  return name;
}

export function fileManagerDirectory(): string {
  const directory = process.env.FILE_MANAGER_DIR;
  if (!directory || !path.isAbsolute(directory)) {
    throw new FileManagerError("File storage is not configured.", 503);
  }
  return directory;
}

export function newStoredName(): string {
  return randomUUID();
}

export function storedFilePath(storedName: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storedName)) {
    throw new FileManagerError("File is unavailable.", 404);
  }
  return path.join(fileManagerDirectory(), storedName);
}

export function attachmentDisposition(name: string, inline = false): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export function isUniqueConstraint(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && error.code === "P2002";
}

export function isForeignKeyConstraint(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && error.code === "P2003";
}
