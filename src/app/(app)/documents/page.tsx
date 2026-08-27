"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Upload, FileText, Search, RefreshCw, Eye,
  CheckCircle2, AlertCircle, Clock, XCircle, Loader2,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/layout/PageHeader";
import { Document } from "@/types";
import { formatDate, formatFileSize } from "@/lib/utils";

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "COMPLETED":  return <Badge variant="success"><CheckCircle2 size={11} className="mr-1" />Extracted</Badge>;
    case "PROCESSING": return <Badge variant="info"><Loader2 size={11} className="mr-1 animate-spin" />Processing</Badge>;
    case "FAILED":     return <Badge variant="danger"><XCircle size={11} className="mr-1" />Failed</Badge>;
    default:           return <Badge variant="default"><Clock size={11} className="mr-1" />Pending</Badge>;
  }
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [total, setTotal]         = useState(0);
  const [search, setSearch]       = useState("");
  const [loading, setLoading]     = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver]   = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: "1", limit: "50" });
    if (search) params.set("search", search);
    const res  = await fetch(`/api/documents?${params}`);
    const data = await res.json();
    setDocuments(data.documents ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const uploadFile = async (file: File) => {
    if (!file.name.endsWith(".pdf")) {
      alert("Only PDF files are accepted.");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/documents", { method: "POST", body: form });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error ?? "Upload failed. Please try again.");
      }
    } catch {
      alert("Network error. Please try again.");
    } finally {
      setUploading(false);
      load();
    }
  };

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach(uploadFile);
  };

  return (
    <div className="animate-fade-in space-y-5">
      <PageHeader
        title="Documents"
        subtitle={`${total} NOA / Tax Declaration PDF${total !== 1 ? "s" : ""}`}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={load}>
              <RefreshCw size={14} /> Refresh
            </Button>
            <Button size="sm" onClick={() => fileRef.current?.click()} loading={uploading}>
              <Upload size={14} /> Upload PDF
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </>
        }
      />

      {/* Drop Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
          dragOver ? "border-blue-500 bg-blue-50" : "border-slate-300 hover:border-blue-400 hover:bg-slate-50"
        }`}
      >
        <Upload size={28} className={`mx-auto mb-2 ${dragOver ? "text-blue-500" : "text-slate-400"}`} />
        <p className="text-sm font-medium text-slate-700">Drop PDF files here or click to upload</p>
        <p className="text-xs text-slate-400 mt-1">NOA, Tax Declaration, Assessment documents — properties are auto-extracted</p>
      </div>

      {/* Search */}
      <Input
        placeholder="Search by filename, taxpayer, NOA number, municipality…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        icon={<Search size={14} />}
      />

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wide">
                <th className="text-left px-5 py-3 font-medium">File</th>
                <th className="text-left px-3 py-3 font-medium">Taxpayer</th>
                <th className="text-left px-3 py-3 font-medium">NOA Count</th>
                <th className="text-left px-3 py-3 font-medium">Municipality</th>
                <th className="text-left px-3 py-3 font-medium">Year</th>
                <th className="text-right px-3 py-3 font-medium">Extracted</th>
                <th className="text-left px-3 py-3 font-medium">Status</th>
                <th className="text-left px-3 py-3 font-medium">Uploaded</th>
                <th className="text-right px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td colSpan={9} className="text-center py-12">
                    <Loader2 size={20} className="animate-spin text-slate-400 mx-auto" />
                  </td>
                </tr>
              )}
              {!loading && documents.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-slate-400 text-sm">
                    No documents yet. Upload a PDF to get started.
                  </td>
                </tr>
              )}
              {documents.map((doc) => (
                <tr key={doc.id} className="hover:bg-slate-50 transition">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center shrink-0">
                        <FileText size={14} className="text-red-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-800 truncate max-w-[220px]">
                          {doc.originalName}
                        </p>
                        <p className="text-xs text-slate-400">{formatFileSize(doc.fileSize)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-xs text-slate-600 max-w-[180px] truncate">
                    {doc.taxpayerName ?? "—"}
                  </td>
                  <td className="px-3 py-3 text-xs font-mono text-slate-600">{doc.noaCount ?? "—"}</td>
                  <td className="px-3 py-3 text-xs text-slate-600">{doc.municipality ?? "—"}</td>
                  <td className="px-3 py-3 text-xs text-slate-600">{doc.assessmentYear ?? "—"}</td>
                  <td className="px-3 py-3 text-right text-xs font-medium text-slate-700">
                    {doc.extractedCount > 0 ? doc.extractedCount : "—"}
                  </td>
                  <td className="px-3 py-3"><StatusBadge status={doc.extractionStatus} /></td>
                  <td className="px-3 py-3 text-xs text-slate-500">
                    <div>{formatDate(doc.createdAt)}</div>
                    <div className="text-slate-400">{(doc.uploadedBy as { name: string })?.name}</div>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/documents/${doc.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-md hover:bg-slate-100 transition"
                    >
                      <Eye size={13} /> View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
