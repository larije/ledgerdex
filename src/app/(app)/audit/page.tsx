"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList, ChevronLeft, ChevronRight, Filter, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatDateTime, ACTION_LABELS } from "@/lib/utils";

const ACTION_OPTIONS = [
  "DOCUMENT_UPLOAD", "DOCUMENT_EXTRACT",
  "PROPERTY_CREATE", "PROPERTY_UPDATE", "PROPERTY_DELETE",
  "PAYMENT_ADD", "REMARK_ADD", "REMARK_DELETE",
  "ATTACHMENT_UPLOAD", "ATTACHMENT_DELETE",
  "USER_LOGIN", "USER_LOGOUT", "USER_CREATE", "USER_UPDATE",
];

function actionBadgeVariant(action: string): "info" | "success" | "danger" | "warning" | "default" {
  if (action.includes("DELETE")) return "danger";
  if (action.includes("CREATE") || action.includes("UPLOAD")) return "success";
  if (action.includes("UPDATE") || action.includes("EXTRACT")) return "info";
  if (action.includes("LOGIN") || action.includes("LOGOUT")) return "default";
  return "warning";
}

interface AuditLogEntry {
  id: string;
  action: string;
  userId: string;
  propertyId?: string;
  documentId?: string;
  details?: string;
  createdAt: string;
  user: { name: string };
  property?: { tdNumber: string } | null;
  document?: { originalName: string } | null;
}

const LIMIT = 30;

export default function AuditPage() {
  const [logs, setLogs]     = useState<AuditLogEntry[]>([]);
  const [total, setTotal]   = useState(0);
  const [page, setPage]     = useState(1);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (action) params.set("action", action);
    const res  = await fetch(`/api/audit?${params}`);
    const data = await res.json();
    setLogs(data.logs ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [page, action]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [action]);

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="animate-fade-in space-y-5">
      <PageHeader
        title="Audit Trail"
        subtitle={`${total.toLocaleString()} log entries`}
        actions={
          <Button variant="secondary" size="sm" onClick={load}>
            <Filter size={14} /> Refresh
          </Button>
        }
      />

      {/* Filter */}
      <div className="flex items-end gap-3 p-4 bg-white border border-slate-200 rounded-xl">
        <div className="w-64">
          <Select
            label="Filter by Action"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="All Actions"
          >
            {ACTION_OPTIONS.map((a) => (
              <option key={a} value={a}>{ACTION_LABELS[a] ?? a}</option>
            ))}
          </Select>
        </div>
        {action && (
          <Button variant="ghost" size="sm" onClick={() => setAction("")}>
            Clear
          </Button>
        )}
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wide">
                <th className="text-left px-5 py-3 font-medium">Timestamp</th>
                <th className="text-left px-3 py-3 font-medium">Action</th>
                <th className="text-left px-3 py-3 font-medium">Entity</th>
                <th className="text-left px-5 py-3 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td colSpan={4} className="text-center py-12">
                    <Loader2 size={20} className="animate-spin text-slate-400 mx-auto" />
                  </td>
                </tr>
              )}
              {!loading && logs.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center py-12 text-slate-400">
                    <ClipboardList size={28} className="mx-auto mb-2 opacity-30" />
                    No audit logs found.
                  </td>
                </tr>
              )}
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50 transition">
                  <td className="px-5 py-3 text-slate-500 whitespace-nowrap font-mono text-xs">
                    {formatDateTime(log.createdAt)}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <Badge variant={actionBadgeVariant(log.action)}>
                      {ACTION_LABELS[log.action] ?? log.action}
                    </Badge>
                  </td>
                  <td className="px-3 py-3">
                    {log.property && (
                      <Link
                        href={`/properties/${log.propertyId}`}
                        className="text-blue-600 hover:underline font-mono"
                      >
                        {log.property.tdNumber}
                      </Link>
                    )}
                    {log.document && (
                      <Link
                        href={`/documents/${log.documentId}`}
                        className="text-blue-600 hover:underline truncate block max-w-[200px]"
                      >
                        {log.document.originalName}
                      </Link>
                    )}
                    {!log.property && !log.document && (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-600 max-w-[280px] truncate">
                    {log.details ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100">
            <p className="text-xs text-slate-500">
              Showing {((page - 1) * LIMIT) + 1}–{Math.min(page * LIMIT, total)} of {total.toLocaleString()}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft size={14} /> Prev
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                Next <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
