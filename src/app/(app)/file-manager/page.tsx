"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  ArrowDownToLine, ChevronLeft, ChevronRight, Eye, FileSpreadsheet,
  FileText, Folder, FolderPlus, Loader2, Pencil, RefreshCw, RotateCcw,
  ExternalLink, MoreHorizontal, Search, Trash2, Upload, X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatDate, formatFileSize } from "@/lib/utils";
import { getOfficeOpenUrl } from "@/lib/file-open";

type ManagedFile = {
  id: string;
  name: string;
  extension: string;
  mimeType: string;
  fileSize: number;
  folderId: string | null;
  trashedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
type ManagedFolder = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  _count: { files: number };
};
type Listing = {
  files: ManagedFile[];
  folders: ManagedFolder[];
  counts: { all: number; trash: number };
  maxFileSize: number;
  total: number;
  page: number;
  pageSize: number;
};
type FileType = "all" | "pdf" | "word" | "excel";
type View = { kind: "all" | "root" | "trash" } | { kind: "folder"; id: string };
type Dialog =
  | { kind: "create-folder" }
  | { kind: "rename-folder"; folder: ManagedFolder }
  | { kind: "rename-file"; file: ManagedFile }
  | { kind: "move-file"; file: ManagedFile }
  | null;

const EMPTY: Listing = {
  files: [], folders: [], counts: { all: 0, trash: 0 },
  maxFileSize: 50 * 1024 * 1024, total: 0, page: 1, pageSize: 50,
};
const ALLOWED_EXTENSIONS = new Set(["pdf", "doc", "docx", "xls", "xlsx", "csv"]);
const SELECT_CLASS = "w-full rounded-xl border border-gray-300 bg-white px-3.5 py-3 text-sm text-gray-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-blue-900/40";

async function responseError(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  return typeof body?.error === "string" ? body.error : `Request failed (${response.status}).`;
}

function fileKind(file: ManagedFile): "pdf" | "word" | "excel" {
  const extension = file.extension.toLowerCase().replace(/^\./, "");
  if (extension === "pdf") return "pdf";
  if (extension === "doc" || extension === "docx") return "word";
  return "excel";
}

function FileIcon({ file }: { file: ManagedFile }) {
  const kind = fileKind(file);
  const classes = kind === "pdf"
    ? "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400"
    : kind === "word"
      ? "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400"
      : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400";
  const Icon = kind === "excel" ? FileSpreadsheet : FileText;
  return <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${classes}`}><Icon size={19} /></span>;
}

function FileActionsMenu({ file, busy, inTrash, onOpen, onRename, onMove, onTrashChange }: {
  file: ManagedFile;
  busy: boolean;
  inTrash: boolean;
  onOpen: () => void;
  onRename: () => void;
  onMove: () => void;
  onTrashChange: (trashed: boolean) => void;
}) {
  const afterClose = useRef<(() => void) | null>(null);
  const itemClass = "flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none data-[highlighted]:bg-gray-100 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 dark:text-slate-200 dark:data-[highlighted]:bg-slate-700";
  const downloadUrl = `/api/file-manager/files/${encodeURIComponent(file.id)}/download`;

  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          disabled={busy}
          aria-label={`Actions for ${file.name}`}
          title="File actions"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50 data-[state=open]:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100 dark:data-[state=open]:bg-slate-700"
        >
          <MoreHorizontal size={19} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          collisionPadding={12}
          aria-label={`Actions for ${file.name}`}
          className="z-50 w-44 max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-lg outline-none dark:border-slate-700 dark:bg-slate-800"
          onCloseAutoFocus={(event) => {
            const action = afterClose.current;
            if (action) {
              // Open dialogs after the menu releases focus, so their inputs keep it.
              event.preventDefault();
              afterClose.current = null;
              action();
            }
          }}
        >
          {inTrash ? (
            <DropdownMenu.Item className={itemClass} disabled={busy} onSelect={() => onTrashChange(false)}>
              <RotateCcw size={15} aria-hidden="true" /> Restore
            </DropdownMenu.Item>
          ) : (
            <>
              <DropdownMenu.Item asChild className={itemClass}>
                <a href={downloadUrl}><ArrowDownToLine size={15} aria-hidden="true" /> Download</a>
              </DropdownMenu.Item>
              {fileKind(file) === "pdf" ? (
                <DropdownMenu.Item asChild className={itemClass}>
                  <a href={`${downloadUrl}?preview=1`} target="_blank" rel="noopener noreferrer"><Eye size={15} aria-hidden="true" /> Preview PDF</a>
                </DropdownMenu.Item>
              ) : (
                <DropdownMenu.Item className={itemClass} disabled={busy} onSelect={onOpen}>
                  <ExternalLink size={15} aria-hidden="true" /> Open in {fileKind(file) === "word" ? "Word" : "Excel"}
                </DropdownMenu.Item>
              )}
              <DropdownMenu.Item className={itemClass} disabled={busy} onSelect={() => { afterClose.current = onRename; }}>
                <Pencil size={15} aria-hidden="true" /> Rename
              </DropdownMenu.Item>
              <DropdownMenu.Item className={itemClass} disabled={busy} onSelect={() => { afterClose.current = onMove; }}>
                <Folder size={15} aria-hidden="true" /> Move to folder
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-gray-100 dark:bg-slate-700" />
              <DropdownMenu.Item
                disabled={busy}
                onSelect={() => { afterClose.current = () => onTrashChange(true); }}
                className="flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-red-600 outline-none data-[highlighted]:bg-red-50 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 dark:text-red-400 dark:data-[highlighted]:bg-red-950/40"
              >
                <Trash2 size={15} aria-hidden="true" /> Move to Trash
              </DropdownMenu.Item>
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export default function FileManagerPage() {
  const [view, setView] = useState<View>({ kind: "all" });
  const [listing, setListing] = useState<Listing>(EMPTY);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [type, setType] = useState<FileType>("all");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [uploadTargetName, setUploadTargetName] = useState("");
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [dialogName, setDialogName] = useState("");
  const [destination, setDestination] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [busy, setBusy] = useState(false);
  const pickerRef = useRef<HTMLInputElement>(null);
  const uploadGuard = useRef(false);
  const busyGuard = useRef(false);
  const mounted = useRef(true);
  const { confirm } = useConfirm();
  const { toast } = useToast();

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), type });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (view.kind === "root") params.set("folderId", "root");
    if (view.kind === "folder") params.set("folderId", view.id);
    if (view.kind === "trash") params.set("trash", "1");
    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setLoading(true);
        setLoadError("");
      }
    });
    fetch(`/api/file-manager?${params}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(await responseError(res));
        return res.json() as Promise<Listing>;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setListing(data);
        const lastPage = Math.max(1, Math.ceil(data.total / data.pageSize));
        if (page > lastPage) setPage(lastPage);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "Could not load files.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [view, debouncedSearch, type, page, revision]);

  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const selectView = (next: View) => { setView(next); setPage(1); };
  const currentFolder = view.kind === "folder" ? listing.folders.find((folder) => folder.id === view.id) : null;
  const viewTitle = view.kind === "all" ? "All files" : view.kind === "root" ? "Unfiled" : view.kind === "trash" ? "Trash" : currentFolder?.name ?? "Folder";
  const pageCount = Math.max(1, Math.ceil(listing.total / listing.pageSize));

  const openFile = (file: ManagedFile) => {
    if (file.trashedAt || busyGuard.current) return;
    if (fileKind(file) === "pdf") {
      window.open(`/api/file-manager/files/${encodeURIComponent(file.id)}/download?preview=1`, "_blank", "noopener,noreferrer");
      return;
    }
    const officeUrl = getOfficeOpenUrl(file, window.location.origin);
    if (!officeUrl) {
      toast("error", "Could not open this file", "Use Download from the file menu.");
      return;
    }
    window.location.assign(officeUrl);
    toast("info", `Opening in ${fileKind(file) === "word" ? "Word" : "Excel"}`, "Allow the browser prompt. Opens for viewing; save edits separately. If it does not open, use Download.");
  };

  const handleUpload = async (selected: FileList | File[]) => {
    const files = Array.from(selected);
    if (!files.length || uploadGuard.current || view.kind === "trash") return;
    uploadGuard.current = true;
    setUploading(true);
    setUploadErrors([]);
    const targetFolder = view.kind === "folder" ? view.id : null;
    setUploadTargetName(view.kind === "folder" ? listing.folders.find((folder) => folder.id === view.id)?.name ?? "selected folder" : "Unfiled");
    const failures: string[] = [];
    let succeeded = 0;
    for (const [index, file] of files.entries()) {
      if (!mounted.current) break;
      setUploadProgress(`Uploading ${index + 1} of ${files.length}: ${file.name}`);
      const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (!ALLOWED_EXTENSIONS.has(extension)) {
        failures.push(`${file.name}: unsupported file type.`);
        continue;
      }
      if (file.size > listing.maxFileSize) {
        failures.push(`${file.name}: exceeds ${formatFileSize(listing.maxFileSize)}.`);
        continue;
      }
      try {
        const form = new FormData();
        form.append("file", file);
        if (targetFolder) form.append("folderId", targetFolder);
        const response = await fetch("/api/file-manager", { method: "POST", body: form });
        if (!response.ok) throw new Error(await responseError(response));
        succeeded += 1;
      } catch (error) {
        failures.push(`${file.name}: ${error instanceof Error ? error.message : "upload failed."}`);
      }
    }
    uploadGuard.current = false;
    if (!mounted.current) return;
    setUploading(false);
    setUploadProgress("");
    setUploadErrors(failures);
    if (succeeded) toast("success", `${succeeded} file${succeeded === 1 ? "" : "s"} uploaded`);
    if (failures.length) toast("error", `${failures.length} file${failures.length === 1 ? "" : "s"} could not be uploaded`, "See the details below the upload area.");
    refresh();
  };

  const openDialog = (next: NonNullable<Dialog>) => {
    if (busyGuard.current) return;
    setDialog(next);
    setDialogError("");
    setDialogName(next.kind === "create-folder" || next.kind === "move-file" ? "" : next.kind === "rename-folder" ? next.folder.name : next.file.name);
    setDestination(next.kind === "move-file" ? next.file.folderId ?? "" : "");
  };

  const closeDialog = () => { if (!busyGuard.current) setDialog(null); };

  const submitDialog = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dialog || busyGuard.current) return;
    const name = dialogName.trim();
    if (dialog.kind !== "move-file" && !name) { setDialogError("Enter a name."); return; }
    busyGuard.current = true;
    setBusy(true);
    setDialogError("");
    try {
      let url: string;
      let method: string;
      let body: Record<string, unknown>;
      if (dialog.kind === "create-folder") {
        url = "/api/file-manager/folders"; method = "POST"; body = { name };
      } else if (dialog.kind === "rename-folder") {
        url = `/api/file-manager/folders/${encodeURIComponent(dialog.folder.id)}`; method = "PATCH"; body = { name };
      } else if (dialog.kind === "rename-file") {
        url = `/api/file-manager/files/${encodeURIComponent(dialog.file.id)}`; method = "PATCH"; body = { name };
      } else {
        url = `/api/file-manager/files/${encodeURIComponent(dialog.file.id)}`; method = "PATCH"; body = { folderId: destination || null };
      }
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(await responseError(response));
      if (!mounted.current) return;
      setDialog(null);
      toast("success", dialog.kind === "create-folder" ? "Folder created" : dialog.kind === "rename-folder" ? "Folder renamed" : dialog.kind === "rename-file" ? "File renamed" : "File moved");
      refresh();
    } catch (error) {
      if (mounted.current) setDialogError(error instanceof Error ? error.message : "Could not save changes.");
    } finally {
      busyGuard.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const deleteFolder = async (folder: ManagedFolder) => {
    if (busyGuard.current) return;
    const accepted = await confirm({
      title: "Delete folder?", message: `Delete “${folder.name}”? Only empty folders can be deleted.`,
      variant: "danger", confirmLabel: "Delete folder",
    });
    if (!accepted || busyGuard.current) return;
    busyGuard.current = true; setBusy(true);
    try {
      const response = await fetch(`/api/file-manager/folders/${encodeURIComponent(folder.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await responseError(response));
      if (!mounted.current) return;
      if (view.kind === "folder" && view.id === folder.id) selectView({ kind: "all" });
      toast("success", "Folder deleted"); refresh();
    } catch (error) {
      if (mounted.current) toast("error", "Could not delete folder", error instanceof Error ? error.message : undefined);
    } finally { busyGuard.current = false; if (mounted.current) setBusy(false); }
  };

  const changeTrash = async (file: ManagedFile, trashed: boolean) => {
    if (busyGuard.current) return;
    if (trashed) {
      const accepted = await confirm({
        title: "Move file to Trash?", message: `Move “${file.name}” to Trash? You can restore it later.`,
        variant: "danger", confirmLabel: "Move to Trash",
      });
      if (!accepted) return;
    }
    if (busyGuard.current) return;
    busyGuard.current = true; setBusy(true);
    try {
      const response = await fetch(`/api/file-manager/files/${encodeURIComponent(file.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      if (!mounted.current) return;
      toast("success", trashed ? "File moved to Trash" : "File restored"); refresh();
    } catch (error) {
      if (mounted.current) toast("error", trashed ? "Could not move file to Trash" : "Could not restore file", error instanceof Error ? error.message : undefined);
    } finally { busyGuard.current = false; if (mounted.current) setBusy(false); }
  };

  const navClass = (active: boolean) => `flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${active ? "bg-blue-50 font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "text-gray-600 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-700/60"}`;

  return (
    <div className="animate-fade-in space-y-5">
      <PageHeader title="File Manager" subtitle="Keep working copies of your PDF, Word, and Excel files organized." actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={refresh} disabled={loading} aria-label="Refresh files"><RefreshCw size={15} /> Refresh</Button>
          <Button size="sm" onClick={() => pickerRef.current?.click()} disabled={uploading || view.kind === "trash"}><Upload size={15} /> Upload files</Button>
        </div>
      } />
      <input ref={pickerRef} type="file" className="hidden" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.csv" onChange={(event) => {
        if (event.target.files) void handleUpload(event.target.files);
        event.target.value = "";
      }} />

      <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
        <Card className="h-fit p-3">
          <nav aria-label="File locations" className="space-y-1">
            <button type="button" className={navClass(view.kind === "all")} onClick={() => selectView({ kind: "all" })}><FileText size={17} /> <span className="flex-1">All files</span><span className="text-xs opacity-70">{listing.counts.all}</span></button>
            <button type="button" className={navClass(view.kind === "root")} onClick={() => selectView({ kind: "root" })}><Folder size={17} /> Unfiled</button>
            <button type="button" className={navClass(view.kind === "trash")} onClick={() => selectView({ kind: "trash" })}><Trash2 size={17} /> <span className="flex-1">Trash</span><span className="text-xs opacity-70">{listing.counts.trash}</span></button>
          </nav>
          <div className="my-4 border-t border-gray-100 dark:border-slate-700" />
          <div className="mb-2 flex items-center justify-between px-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">Folders</h2>
            <button type="button" onClick={() => openDialog({ kind: "create-folder" })} disabled={busy} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-blue-700 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-700" aria-label="Create folder" title="Create folder"><FolderPlus size={17} /></button>
          </div>
          {listing.folders.length === 0 ? <p className="px-3 pb-2 text-xs text-gray-500 dark:text-slate-400">No folders yet.</p> : (
            <div className="space-y-1">
              {listing.folders.map((folder) => (
                <div key={folder.id} className="group flex items-center gap-0.5">
                  <button type="button" className={`${navClass(view.kind === "folder" && view.id === folder.id)} min-w-0 flex-1`} onClick={() => selectView({ kind: "folder", id: folder.id })} title={folder.name}><Folder size={17} className="shrink-0" /><span className="min-w-0 flex-1 truncate">{folder.name}</span></button>
                  <button type="button" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-blue-700 disabled:opacity-50 dark:hover:bg-slate-700" onClick={() => openDialog({ kind: "rename-folder", folder })} disabled={busy} aria-label={`Rename ${folder.name}`} title="Rename folder"><Pencil size={13} /></button>
                  <button type="button" className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/30" onClick={() => void deleteFolder(folder)} disabled={busy} aria-label={`Delete ${folder.name}`} title="Delete empty folder"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="min-w-0 space-y-5">
          {view.kind !== "trash" && <div
            className={`rounded-2xl border-2 border-dashed px-5 py-7 text-center transition-colors ${dragOver ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30" : "border-gray-300 bg-white hover:border-blue-400 dark:border-slate-600 dark:bg-slate-800"}`}
            onDragEnter={(event) => { event.preventDefault(); setDragOver(true); }}
            onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
            onDragLeave={(event) => { event.preventDefault(); if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(false); }}
            onDrop={(event) => { event.preventDefault(); setDragOver(false); if (!uploading) void handleUpload(event.dataTransfer.files); }}
          >
            <Upload size={25} className="mx-auto mb-2 text-blue-500" />
            <p className="text-sm font-semibold text-gray-800 dark:text-slate-100">Drop files here or <button type="button" className="text-blue-600 underline underline-offset-2 hover:text-blue-700 dark:text-blue-400" onClick={() => pickerRef.current?.click()} disabled={uploading}>browse your computer</button></p>
            <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">PDF, Word, Excel, and CSV · Up to {formatFileSize(listing.maxFileSize)} each · Uploading to {uploading ? uploadTargetName : view.kind === "folder" ? currentFolder?.name ?? "selected folder" : "Unfiled"}</p>
            {uploading && <p role="status" className="mt-3 flex items-center justify-center gap-2 text-xs font-medium text-blue-700 dark:text-blue-300"><Loader2 size={14} className="animate-spin" />{uploadProgress}</p>}
          </div>}
          {uploadErrors.length > 0 && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"><div className="flex items-center justify-between gap-2"><p className="font-semibold">Some files could not be uploaded</p><button type="button" onClick={() => setUploadErrors([])} aria-label="Dismiss upload errors"><X size={15} /></button></div><ul className="mt-2 list-disc space-y-1 pl-4">{uploadErrors.map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}</ul></div>}

          <Card>
            <div className="flex flex-col gap-4 border-b border-gray-100 p-5 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
              <div><h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">{viewTitle}</h2><p className="text-xs text-gray-500 dark:text-slate-400">{listing.total} file{listing.total === 1 ? "" : "s"}</p></div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} icon={<Search size={16} />} placeholder="Search file names" aria-label="Search file names" className="py-2.5 sm:w-56" />
                <select value={type} onChange={(event) => { setType(event.target.value as FileType); setPage(1); }} aria-label="Filter by file type" className={`${SELECT_CLASS} py-2.5 sm:w-32`}><option value="all">All types</option><option value="pdf">PDF</option><option value="word">Word</option><option value="excel">Excel / CSV</option></select>
              </div>
            </div>
            {loadError ? <div role="alert" className="p-10 text-center"><p className="mb-4 text-sm text-red-600 dark:text-red-400">{loadError}</p><Button variant="secondary" size="sm" onClick={refresh}><RefreshCw size={15} /> Try again</Button></div> : loading ? <div role="status" className="flex items-center justify-center gap-2 p-14 text-sm text-gray-500 dark:text-slate-400"><Loader2 size={18} className="animate-spin" />Loading files…</div> : listing.files.length === 0 ? <div className="p-12 text-center"><Folder size={30} className="mx-auto mb-3 text-gray-300 dark:text-slate-600" /><p className="text-sm font-medium text-gray-700 dark:text-slate-200">{view.kind === "trash" ? "Trash is empty" : search || type !== "all" ? "No files match your search" : "No files here yet"}</p><p className="mt-1 text-xs text-gray-500 dark:text-slate-400">{view.kind === "trash" ? "Files moved to Trash appear here." : search || type !== "all" ? "Try another name or file type." : "Upload files to start organizing them."}</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead><tr className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"><th className="px-5 py-3 font-medium">Name</th><th className="px-3 py-3 font-medium">Type</th><th className="px-3 py-3 font-medium">Size</th><th className="px-3 py-3 font-medium">{view.kind === "trash" ? "Trashed" : "Uploaded"}</th><th className="px-5 py-3 text-right font-medium">Actions</th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-slate-700">{listing.files.map((file) => <tr key={file.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/30"><td className="max-w-[300px] px-5 py-3"><button type="button" onClick={() => openFile(file)} disabled={busy || view.kind === "trash"} className="flex w-full min-w-0 items-center gap-3 rounded-lg text-left text-gray-800 enabled:hover:text-blue-600 enabled:hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-default dark:text-slate-100 dark:enabled:hover:text-blue-400" title={view.kind === "trash" ? "Restore this file to open it" : `${file.name} - ${fileKind(file) === "pdf" ? "Preview PDF" : fileKind(file) === "word" ? "Open in Word" : "Open in Excel"}`}><FileIcon file={file} /><span className="min-w-0 truncate font-medium">{file.name}</span></button></td><td className="px-3 py-3 text-xs uppercase text-gray-500 dark:text-slate-400">{file.extension.replace(/^\./, "")}</td><td className="px-3 py-3 whitespace-nowrap text-xs text-gray-600 dark:text-slate-300">{formatFileSize(file.fileSize)}</td><td className="px-3 py-3 whitespace-nowrap text-xs text-gray-600 dark:text-slate-300">{formatDate(view.kind === "trash" ? file.trashedAt : file.createdAt)}</td><td className="px-5 py-3"><div className="flex justify-end"><FileActionsMenu file={file} busy={busy} inTrash={view.kind === "trash"} onOpen={() => openFile(file)} onRename={() => openDialog({ kind: "rename-file", file })} onMove={() => openDialog({ kind: "move-file", file })} onTrashChange={(trashed) => void changeTrash(file, trashed)} /></div></td></tr>)}</tbody></table></div>}
            {!loadError && !loading && listing.total > listing.pageSize && <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-5 py-4 text-xs text-gray-500 dark:border-slate-700 dark:text-slate-400"><span>Page {page} of {pageCount} · {listing.total} files</span><div className="flex gap-2"><Button variant="secondary" size="sm" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1}><ChevronLeft size={15} /> Previous</Button><Button variant="secondary" size="sm" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={page >= pageCount}>Next <ChevronRight size={15} /></Button></div></div>}
          </Card>
        </div>
      </div>

      <Modal open={dialog !== null} onClose={closeDialog} title={dialog?.kind === "create-folder" ? "New folder" : dialog?.kind === "rename-folder" ? "Rename folder" : dialog?.kind === "rename-file" ? "Rename file" : "Move file"}>
        {dialog && <form onSubmit={(event) => void submitDialog(event)} className="space-y-5">
          {dialog.kind === "move-file" ? <div><label htmlFor="file-destination" className="mb-2 block text-sm font-semibold text-gray-800 dark:text-slate-100">Destination for {dialog.file.name}</label><select autoFocus id="file-destination" className={SELECT_CLASS} value={destination} onChange={(event) => setDestination(event.target.value)}><option value="">Unfiled</option>{listing.folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></div> : <Input autoFocus label={dialog.kind === "rename-file" ? "File name" : "Folder name"} value={dialogName} onChange={(event) => setDialogName(event.target.value)} maxLength={dialog.kind === "rename-file" ? 255 : 100} hint={dialog.kind === "rename-file" ? "Keep the file extension unchanged." : undefined} />}
          {dialogError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{dialogError}</p>}
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={closeDialog} disabled={busy}>Cancel</Button><Button type="submit" loading={busy}>{dialog.kind === "create-folder" ? "Create folder" : dialog.kind === "move-file" ? "Move file" : "Save changes"}</Button></div>
        </form>}
      </Modal>
    </div>
  );
}
