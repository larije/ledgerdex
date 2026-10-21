type OpenableFile = { id: string; name: string; extension: string };

export function getNamedDownloadPath(file: OpenableFile): string {
  const safeName = file.name.replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, "_");
  return `/api/file-manager/files/${encodeURIComponent(file.id)}/download/${encodeURIComponent(safeName)}`;
}

export function getOfficeOpenUrl(file: OpenableFile, origin: string): string | null {
  const extension = file.extension.toLowerCase();
  const protocol = extension === "doc" || extension === "docx" ? "ms-word"
    : extension === "xls" || extension === "xlsx" || extension === "csv" ? "ms-excel"
    : null;
  if (!protocol) return null;

  try {
    const source = new URL(origin);
    if (source.protocol !== "http:" && source.protocol !== "https:") return null;
    // Office's view command fetches a copy; edits are saved locally, not to LedgerDex.
    return `${protocol}:ofv|u|${source.origin}${getNamedDownloadPath(file)}`;
  } catch {
    return null;
  }
}
