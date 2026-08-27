import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({ className, style }: SkeletonProps) {
  return (
    <div
      className={cn("skeleton", className)}
      style={style}
      aria-hidden="true"
    />
  );
}

export function SkeletonText({ lines = 1, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-3.5"
          style={{ width: i === lines - 1 && lines > 1 ? "70%" : "100%" }}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn("rounded-2xl p-5 space-y-4", className)}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="h-2.5 w-1/2" />
        </div>
      </div>
      <Skeleton className="h-7 w-1/3" />
      <Skeleton className="h-2.5 w-2/3" />
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {/* Header */}
      <div
        className="grid gap-4 px-5 py-3"
        style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          borderBottom: "1px solid var(--border)",
          background: "var(--surface-raised)",
        }}
      >
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-3/4" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, ri) => (
        <div
          key={ri}
          className="grid gap-4 px-5 py-3.5"
          style={{
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            borderBottom: ri < rows - 1 ? "1px solid var(--border)" : "none",
          }}
        >
          {Array.from({ length: cols }).map((_, ci) => (
            <Skeleton
              key={ci}
              className="h-3"
              style={{ width: `${60 + Math.random() * 30}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonStat({ className }: { className?: string }) {
  return (
    <div
      className={cn("rounded-2xl p-5", className)}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-3 flex-1">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-2.5 w-36" />
        </div>
        <Skeleton className="w-11 h-11 rounded-xl" />
      </div>
    </div>
  );
}
