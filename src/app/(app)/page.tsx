"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { motion, useInView, useMotionValue, useSpring } from "framer-motion";
import {
  FileText, Building2, CheckCircle2,
  AlertCircle, TrendingUp, Upload,
  ArrowUpRight, Activity, Zap, FileWarning,
} from "lucide-react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/layout/PageHeader";
import { SkeletonStat, SkeletonCard, Skeleton } from "@/components/ui/Skeleton";
import { formatCurrency, formatDate } from "@/lib/utils";
import { DashboardStats } from "@/types";

/* ─── Animated counter ───────────────────────────────────────────────────── */
function AnimatedNumber({ value, prefix = "", suffix = "" }: {
  value: number; prefix?: string; suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionVal = useMotionValue(0);
  const spring    = useSpring(motionVal, { stiffness: 100, damping: 25, mass: 0.6 });
  const inView    = useInView(ref, { once: true });

  useEffect(() => {
    if (inView) motionVal.set(value);
  }, [inView, value, motionVal]);

  useEffect(() => {
    const unsubscribe = spring.on("change", (v) => {
      if (ref.current) ref.current.textContent = `${prefix}${Math.round(v).toLocaleString("en-PH")}${suffix}`;
    });
    return unsubscribe;
  }, [spring, prefix, suffix]);

  return <span ref={ref}>0</span>;
}

/* ─── Stat card ──────────────────────────────────────────────────────────── */
interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: number;
  sub?: string;
  prefix?: string;
  suffix?: string;
  gradient: [string, string];
  delay?: number;
}

function StatCard({ icon: Icon, label, value, sub, prefix, suffix, gradient, delay = 0 }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      <Card hover className="group relative overflow-hidden">
        {/* Gradient accent strip at top */}
        <div
          className="absolute top-0 left-0 right-0 h-0.5"
          style={{ background: `linear-gradient(90deg, ${gradient[0]}, ${gradient[1]})` }}
        />
        <CardContent className="pt-5 pb-5">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--fg-muted)" }}>
                {label}
              </p>
              <p className="text-3xl font-bold tabular-nums" style={{ color: "var(--fg)" }}>
                <AnimatedNumber value={value} prefix={prefix} suffix={suffix} />
              </p>
              {sub && (
                <p className="text-sm" style={{ color: "var(--fg-muted)" }}>{sub}</p>
              )}
            </div>
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-110"
              style={{
                background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})`,
                boxShadow: `0 4px 12px ${gradient[0]}40`,
              }}
            >
              <Icon size={20} className="text-white" strokeWidth={2} />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ─── Payment status donut ───────────────────────────────────────────────── */
const STATUS_COLORS: Record<string, string> = {
  Paid:       "#10B981",
  Partial:    "#F59E0B",
  Unpaid:     "#EF4444",
  Delinquent: "#8B5CF6",
  Advance:    "#0D9488",
  Current:    "#0EA5E9",
};

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { name: string; value: number }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div
      className="px-3 py-2 rounded-xl text-xs font-medium shadow-lg"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-lg)",
        color: "var(--fg)",
      }}
    >
      {d.name}: <span className="font-bold">{d.value.toLocaleString()}</span>
    </div>
  );
}

function PaymentDonut({ paid, partial, unpaid, delinquent, advance, current }: {
  paid: number; partial: number; unpaid: number; delinquent: number; advance: number; current: number;
}) {
  const data = [
    { name: "Paid",       value: paid       },
    { name: "Partial",    value: partial    },
    { name: "Unpaid",     value: unpaid     },
    { name: "Delinquent", value: delinquent },
    { name: "Advance",    value: advance    },
    { name: "Current",    value: current    },
  ].filter((d) => d.value > 0);

  const total = paid + partial + unpaid + delinquent + advance + current;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="relative w-40 h-40 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={44}
              outerRadius={64}
              paddingAngle={3}
              dataKey="value"
              strokeWidth={0}
              animationBegin={200}
              animationDuration={900}
            >
              {data.map((entry) => (
                <Cell
                  key={entry.name}
                  fill={STATUS_COLORS[entry.name] ?? "#94A3B8"}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        {/* Centre total */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-bold" style={{ color: "var(--fg)" }}>
            {total.toLocaleString()}
          </span>
          <span className="text-xs font-medium" style={{ color: "var(--fg-muted)" }}>total</span>
        </div>
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 flex-1">
        {[
          { label: "Paid",       value: paid,       color: "#10B981" },
          { label: "Partial",    value: partial,    color: "#F59E0B" },
          { label: "Unpaid",     value: unpaid,     color: "#EF4444" },
          { label: "Delinquent", value: delinquent, color: "#8B5CF6" },
          { label: "Advance",    value: advance,    color: "#0D9488" },
          { label: "Current",    value: current,    color: "#0EA5E9" },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ background: color }}
            />
            <div className="min-w-0">
              <p className="text-xs font-medium truncate" style={{ color: "var(--fg-secondary)" }}>
                {label}
              </p>
              <p className="text-sm font-bold" style={{ color: "var(--fg)" }}>
                {value.toLocaleString()}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Status badge map ───────────────────────────────────────────────────── */
const STATUS_BADGE: Record<string, { variant: "success" | "warning" | "danger" | "info"; label: string }> = {
  PAID:       { variant: "success", label: "Paid" },
  PARTIAL:    { variant: "warning", label: "Partial" },
  UNPAID:     { variant: "danger",  label: "Unpaid" },
  DELINQUENT: { variant: "info",    label: "Delinquent" },
  ADVANCE:    { variant: "success", label: "Advance" },
  CURRENT:    { variant: "info",    label: "Current" },
};

/* ─── Container motion ───────────────────────────────────────────────────── */
const containerVariants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.08 } },
} as const;

const rowVariants = {
  hidden:  { opacity: 0, x: -10 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.3, ease: "easeOut" as const } },
} as const;

/* ─── Delinquency summary banner (self-fetching, hidden when empty) ───────── */
function DelinquencyMiniCard() {
  const [d, setD] = useState<{
    outstandingBalance: number; activeAccounts: number; settledAccounts: number; listCount: number;
  } | null>(null);

  useEffect(() => {
    fetch("/api/delinquencies/stats")
      .then((r) => r.json())
      .then((s) => setD(s?.totals ?? null))
      .catch(() => {});
  }, []);

  if (!d || d.listCount === 0) return null;

  return (
    <Link href="/delinquencies">
      <Card hover className="relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: "linear-gradient(90deg,#DC2626,#F59E0B)" }} />
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg,#DC2626,#B91C1C)", boxShadow: "0 4px 12px rgba(220,38,38,0.30)" }}>
              <FileWarning size={20} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: "var(--fg)" }}>Delinquent Real Properties</p>
              <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
                {d.activeAccounts.toLocaleString()} active · {d.settledAccounts.toLocaleString()} settled · {d.listCount} list(s)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-xs uppercase tracking-widest" style={{ color: "var(--fg-muted)" }}>Outstanding</p>
              <p className="text-xl font-bold text-red-600 tabular-nums">{formatCurrency(d.outstandingBalance)}</p>
            </div>
            <ArrowUpRight size={16} style={{ color: "var(--fg-muted)" }} />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */
export default function DashboardPage() {
  const [stats,   setStats]   = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then(setStats)
      .finally(() => setLoading(false));
  }, []);

  /* Loading skeleton */
  if (loading) {
    return (
      <div className="space-y-7">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <Skeleton className="h-7 w-36" />
            <Skeleton className="h-4 w-52" />
          </div>
          <Skeleton className="h-9 w-32 rounded-xl" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => <SkeletonStat key={i} />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <SkeletonCard className="lg:col-span-2" />
          <SkeletonCard />
        </div>
        <SkeletonCard className="h-64" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div
        className="flex flex-col items-center justify-center h-64 rounded-2xl gap-3"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          color: "var(--fg-muted)",
        }}
      >
        <AlertCircle size={32} />
        <p className="text-sm font-medium">Failed to load dashboard data.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Dashboard"
        subtitle="Property tax ledger overview for Davao del Norte"
        actions={
          <Link href="/documents">
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
              style={{
                background: "linear-gradient(135deg, #4F46E5 0%, #6D28D9 100%)",
                boxShadow: "0 4px 14px rgba(79,70,229,0.35)",
              }}
            >
              <Upload size={14} strokeWidth={2.5} />
              Upload PDF
            </motion.div>
          </Link>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={FileText}
          label="Documents"
          value={stats.totalDocuments}
          gradient={["#4F46E5", "#7C3AED"]}
          delay={0}
        />
        <StatCard
          icon={Building2}
          label="Properties"
          value={stats.totalProperties}
          gradient={["#0EA5E9", "#0284C7"]}
          delay={0.07}
        />
        <StatCard
          icon={CheckCircle2}
          label="Paid"
          value={stats.paidCount}
          gradient={["#10B981", "#059669"]}
          delay={0.14}
        />
        <StatCard
          icon={TrendingUp}
          label="Advance"
          value={stats.advanceCount}
          gradient={["#0D9488", "#0F766E"]}
          delay={0.21}
        />
      </div>

      {/* Delinquency summary */}
      <DelinquencyMiniCard />

      {/* Middle row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Payment status donut */}
        <motion.div
          className="lg:col-span-2"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.28, ease: [0.16, 1, 0.3, 1] }}
        >
          <Card>
            <CardHeader className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: "var(--brand-subtle)" }}
                >
                  <Activity size={13} style={{ color: "var(--brand)" }} />
                </div>
                <CardTitle>Payment Status Distribution</CardTitle>
              </div>
              <Badge variant="info" dot>{stats.paidCount + stats.partialCount + stats.unpaidCount + stats.delinquentCount + stats.advanceCount + stats.currentCount} total</Badge>
            </CardHeader>
            <CardContent className="pt-5">
              <PaymentDonut
                paid={stats.paidCount}
                partial={stats.partialCount}
                unpaid={stats.unpaidCount}
                delinquent={stats.delinquentCount}
                advance={stats.advanceCount}
                current={stats.currentCount}
              />
            </CardContent>
          </Card>
        </motion.div>

        {/* Recent documents */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          <Card className="h-full flex flex-col">
            <CardHeader className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: "#FEF2F2" }}
                >
                  <FileText size={13} className="text-red-500" />
                </div>
                <CardTitle>Recent Documents</CardTitle>
              </div>
              <Link
                href="/documents"
                className="inline-flex items-center gap-1 text-xs font-medium transition-colors"
                style={{ color: "var(--brand)" }}
              >
                View all <ArrowUpRight size={11} />
              </Link>
            </CardHeader>

            <div className="flex-1 overflow-hidden">
              {stats.recentDocuments.length === 0 ? (
                <div
                  className="flex flex-col items-center justify-center py-10 gap-2"
                  style={{ color: "var(--fg-muted)" }}
                >
                  <FileText size={24} strokeWidth={1.5} />
                  <p className="text-xs">No documents yet</p>
                </div>
              ) : (
                <motion.div
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                >
                  {stats.recentDocuments.map((doc) => (
                    <motion.div key={doc.id} variants={rowVariants}>
                      <Link
                        href={`/documents/${doc.id}`}
                        className="flex items-center gap-3 px-5 py-3 transition-colors"
                        style={{ borderBottom: "1px solid var(--border)" }}
                        onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = "var(--surface-raised)"}
                        onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = ""}
                      >
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: "#FEF2F2" }}
                        >
                          <FileText size={13} className="text-red-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate" style={{ color: "var(--fg)" }}>
                            {doc.originalName}
                          </p>
                          <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
                            {formatDate(doc.createdAt)}
                          </p>
                        </div>
                        <ArrowUpRight size={12} className="shrink-0" style={{ color: "var(--fg-muted)" }} />
                      </Link>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </div>
          </Card>
        </motion.div>
      </div>

      {/* Recent properties table */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.42, ease: [0.16, 1, 0.3, 1] }}
      >
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: "var(--info-subtle)" }}
              >
                <Zap size={13} style={{ color: "var(--info)" }} />
              </div>
              <CardTitle>Recently Added Properties</CardTitle>
            </div>
            <Link
              href="/properties"
              className="inline-flex items-center gap-1 text-xs font-medium transition-colors"
              style={{ color: "var(--brand)" }}
            >
              View all <ArrowUpRight size={11} />
            </Link>
          </CardHeader>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--surface-raised)" }}>
                  {["TD Number", "Location", "Municipality", "Type", "Assessed Value", "Status", "Date"].map((h) => (
                    <th
                      key={h}
                      className={`px-5 py-3.5 text-xs font-bold uppercase tracking-widest whitespace-nowrap text-left ${
                        h === "Assessed Value" ? "text-right" : ""
                      } ${h === "Status" || h === "Date" ? "text-right" : ""}`}
                      style={{ color: "var(--fg-muted)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <motion.tbody
                variants={containerVariants}
                initial="hidden"
                animate="visible"
              >
                {stats.recentProperties.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12">
                      <Building2 size={28} className="mx-auto mb-2" style={{ color: "var(--border-strong)" }} />
                      <p className="text-xs" style={{ color: "var(--fg-muted)" }}>No properties yet</p>
                    </td>
                  </tr>
                ) : (
                  stats.recentProperties.map((p) => {
                    const sb = STATUS_BADGE[p.paymentStatus];
                    return (
                      <motion.tr
                        key={p.id}
                        variants={rowVariants}
                        className="group transition-colors"
                        style={{ borderBottom: "1px solid var(--border)" }}
                        onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = "var(--surface-raised)"}
                        onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = ""}
                      >
                        <td className="px-5 py-3.5 font-mono">
                          <Link
                            href={`/properties/${p.id}`}
                            className="font-semibold hover:underline transition-colors"
                            style={{ color: "var(--brand)" }}
                          >
                            {p.tdNumber}
                          </Link>
                        </td>
                        <td className="px-5 py-3.5 max-w-[160px] truncate" style={{ color: "var(--fg-secondary)" }}>
                          {p.propertyLocation ?? <span style={{ color: "var(--border-strong)" }}>—</span>}
                        </td>
                        <td className="px-5 py-3.5" style={{ color: "var(--fg-secondary)" }}>
                          {p.municipality ?? <span style={{ color: "var(--border-strong)" }}>—</span>}
                        </td>
                        <td className="px-5 py-3.5">
                          <Badge variant="info">{p.type}</Badge>
                        </td>
                        <td className="px-5 py-3.5 text-right font-semibold tabular-nums" style={{ color: "var(--fg)" }}>
                          {formatCurrency(p.assessedValue as unknown as number)}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          {sb ? (
                            <Badge variant={sb.variant} dot>{sb.label}</Badge>
                          ) : (
                            <Badge>{p.paymentStatus}</Badge>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right" style={{ color: "var(--fg-muted)" }}>
                          {formatDate(p.createdAt)}
                        </td>
                      </motion.tr>
                    );
                  })
                )}
              </motion.tbody>
            </table>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
