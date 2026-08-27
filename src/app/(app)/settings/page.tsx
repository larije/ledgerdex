"use client";
import { useEffect, useState } from "react";
import {
  Database, HardDrive, Server, RefreshCw, CheckCircle2, XCircle,
  Loader2, FileText, CreditCard, ClipboardList, Paperclip, AlertTriangle, Trash2,
  MapPin, WifiOff, Layers, Activity,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { DeleteConfirmModal } from "@/components/ui/DeleteConfirmModal";
import { PageHeader } from "@/components/layout/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { formatDate, formatFileSize } from "@/lib/utils";

interface HealthData {
  status: "ok" | "error";
  db: "connected" | "error";
  uptime: number;
  version: string;
  timestamp: string;
}

interface StatsData {
  propertyCount: number;
  documentCount: number;
  paymentCount: number;
  auditCount: number;
  attachmentCount: number;
  documentSizeBytes: number;
  attachmentSizeBytes: number;
}

const PURGE_OPTIONS = [
  {
    key: "payments",
    label: "Payment History",
    description: "All payment records across every property",
    icon: CreditCard,
    color: "text-orange-500",
    bg: "bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800",
  },
  {
    key: "documents",
    label: "PDF Documents",
    description: "Uploaded PDF files and their extracted metadata",
    icon: FileText,
    color: "text-blue-500",
    bg: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800",
  },
  {
    key: "properties",
    label: "All Properties",
    description: "Every property record including payments, remarks, and attachments",
    icon: Database,
    color: "text-purple-500",
    bg: "bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800",
  },
  {
    key: "audit_logs",
    label: "Audit Trail",
    description: "All activity log entries",
    icon: ClipboardList,
    color: "text-slate-500",
    bg: "bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600",
  },
];

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}

export default function SettingsPage() {
  const [health, setHealth]   = useState<HealthData | null>(null);
  const [stats, setStats]     = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(false);

  const { toast } = useToast();
  const [selected, setSelected]         = useState<string[]>([]);
  const [confirmModal, setConfirmModal] = useState(false);

  const load = async () => {
    setLoading(true);
    const [healthRes, statsRes] = await Promise.allSettled([
      fetch("/api/health").then((r) => r.json()),
      fetch("/api/admin/stats").then((r) => r.json()),
    ]);
    if (healthRes.status === "fulfilled") setHealth(healthRes.value);
    if (statsRes.status  === "fulfilled") setStats(statsRes.value);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggleSelect = (key: string) =>
    setSelected((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);

  const openConfirm = () => setConfirmModal(true);

  const runPurge = async () => {
    const res  = await fetch("/api/admin/purge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targets: selected }),
    });
    const data = await res.json();
    if (!data.ok) {
      toast("error", "Failed to delete data", "Please try again.");
      throw new Error("purge failed");
    }
    const summary = Object.entries(data.deleted as Record<string, number>)
      .map(([k, v]) => `${v} ${k.replace("_", " ")}`)
      .join(", ");
    toast("success", "Data deleted successfully", summary || "All selected data removed.");
    setSelected([]);
    load();
  };

  return (
    <div className="animate-fade-in space-y-5">
      <PageHeader
        title="Settings"
        subtitle="System information and data management"
        actions={
          <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
        }
      />

      {/* Top row: Status + App Info side by side */}
      <div className="grid grid-cols-2 gap-5">
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <Server size={14} /> System Status
            </h3>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Loader2 size={16} className="animate-spin" /> Checking…
              </div>
            ) : health ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-slate-400 mb-1.5">Application</p>
                    <div className="flex items-center gap-2">
                      {health.status === "ok"
                        ? <CheckCircle2 size={15} className="text-green-500" />
                        : <XCircle size={15} className="text-red-500" />}
                      <Badge variant={health.status === "ok" ? "success" : "danger"}>
                        {health.status === "ok" ? "Running" : "Error"}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-1.5">Database</p>
                    <div className="flex items-center gap-2">
                      {health.db === "connected"
                        ? <CheckCircle2 size={15} className="text-green-500" />
                        : <XCircle size={15} className="text-red-500" />}
                      <Badge variant={health.db === "connected" ? "success" : "danger"}>
                        {health.db === "connected" ? "Connected" : "Error"}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-100 dark:border-slate-700">
                  <div>
                    <p className="text-xs text-slate-400">Server Uptime</p>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mt-0.5">{formatUptime(health.uptime)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Last Checked</p>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mt-0.5">{formatDate(health.timestamp)}</p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-red-600">Failed to load system status.</p>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          {/* Branded header */}
          <div className="bg-gradient-to-br from-blue-600 via-blue-600 to-indigo-700 px-5 py-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-11 h-11 bg-white/15 rounded-xl flex items-center justify-center ring-1 ring-white/20">
                <FileText size={20} className="text-white" />
              </div>
              <div>
                <p className="text-white font-bold text-lg leading-none tracking-tight">LedgerDex</p>
                <p className="text-blue-200 text-xs mt-0.5 font-medium">Property Tax System</p>
              </div>
            </div>
            <p className="text-blue-100 text-xs leading-relaxed">
              PDF intelligence & ledger management for real property taxation.
            </p>
          </div>

          {/* Spec rows */}
          <CardContent className="py-3 px-0 divide-y divide-slate-100 dark:divide-slate-700">
            {[
              { icon: MapPin,   color: "text-rose-500",   bg: "bg-rose-50 dark:bg-rose-900/30",    label: "Province",   value: "Davao del Norte" },
              { icon: WifiOff,  color: "text-amber-500",  bg: "bg-amber-50 dark:bg-amber-900/30",   label: "Network",    value: "Offline LAN — no internet" },
              { icon: Database, color: "text-blue-500",   bg: "bg-blue-50 dark:bg-blue-900/30",    label: "Database",   value: "MySQL via Prisma ORM" },
              { icon: Layers,   color: "text-violet-500", bg: "bg-violet-50 dark:bg-violet-900/30",  label: "Framework",  value: "Next.js 16 — App Router" },
              { icon: HardDrive,color: "text-slate-500",  bg: "bg-slate-100 dark:bg-slate-700",  label: "Runtime",    value: "Node.js — Turbopack" },
            ].map(({ icon: Icon, color, bg, label, value }) => (
              <div key={label} className="flex items-center gap-3 px-5 py-2.5">
                <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
                  <Icon size={13} className={color} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">{label}</p>
                  <p className="text-xs text-slate-700 dark:text-slate-300 font-medium truncate">{value}</p>
                </div>
              </div>
            ))}
          </CardContent>

          {/* Live pulse indicator */}
          <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-700 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            <span className="text-xs text-slate-400">System active</span>
            <Activity size={11} className="text-slate-300 dark:text-slate-600 ml-auto" />
          </div>
        </Card>
      </div>

      {/* Data Summary — 3-column grid */}
      <Card>
        <CardHeader>
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <Database size={14} /> Data Summary
          </h3>
        </CardHeader>
        <CardContent>
          {stats ? (
            <div className="grid grid-cols-3 gap-3">
              {[
                { icon: Database,      label: "Properties",    value: stats.propertyCount.toLocaleString(),   sub: null },
                { icon: FileText,      label: "PDF Documents", value: stats.documentCount.toLocaleString(),   sub: formatFileSize(stats.documentSizeBytes) },
                { icon: CreditCard,    label: "Payments",      value: stats.paymentCount.toLocaleString(),    sub: null },
                { icon: ClipboardList, label: "Audit Logs",    value: stats.auditCount.toLocaleString(),      sub: null },
                { icon: Paperclip,     label: "Attachments",   value: stats.attachmentCount.toLocaleString(), sub: formatFileSize(stats.attachmentSizeBytes) },
              ].map(({ icon: Icon, label, value, sub }) => (
                <div key={label} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-200 dark:border-slate-600">
                  <div className="w-9 h-9 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex items-center justify-center shrink-0">
                    <Icon size={15} className="text-slate-500 dark:text-slate-400" />
                  </div>
                  <div>
                    <p className="text-xl font-bold text-slate-800 dark:text-slate-100 leading-none">{value}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{label}{sub ? ` · ${sub}` : ""}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">Loading…</p>
          )}
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-red-200 dark:border-red-900">
        <CardHeader className="border-b border-red-100 dark:border-red-900 bg-red-50 dark:bg-red-900/20 rounded-t-xl">
          <h3 className="text-sm font-semibold text-red-700 dark:text-red-400 flex items-center gap-2">
            <AlertTriangle size={14} /> Danger Zone
          </h3>
          <p className="text-xs text-red-500 dark:text-red-400/80 mt-0.5">Select what to permanently delete, then confirm. This cannot be undone.</p>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          {PURGE_OPTIONS.map(({ key, label, description, icon: Icon, color, bg }) => (
            <label
              key={key}
              className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition ${
                selected.includes(key) ? bg : "border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700/50"
              }`}
            >
              <input
                type="checkbox"
                checked={selected.includes(key)}
                onChange={() => toggleSelect(key)}
                className="accent-red-600 w-4 h-4 shrink-0"
              />
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${selected.includes(key) ? bg : "bg-slate-100 dark:bg-slate-700"}`}>
                <Icon size={14} className={color} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{label}</p>
                <p className="text-xs text-slate-400">{description}</p>
              </div>
            </label>
          ))}

          <div className="pt-2 flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              className="text-slate-400 text-xs"
              onClick={() =>
                selected.length === PURGE_OPTIONS.length
                  ? setSelected([])
                  : setSelected(PURGE_OPTIONS.map((o) => o.key))
              }
            >
              {selected.length === PURGE_OPTIONS.length ? "Deselect all" : "Select all"}
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={selected.length === 0}
              onClick={openConfirm}
            >
              <Trash2 size={13} /> Delete Selected ({selected.length})
            </Button>
          </div>
        </CardContent>
      </Card>

      <DeleteConfirmModal
        open={confirmModal}
        onClose={() => setConfirmModal(false)}
        items={selected.map((key) => PURGE_OPTIONS.find((o) => o.key === key)?.label ?? key)}
        onConfirm={runPurge}
      />
    </div>
  );
}
