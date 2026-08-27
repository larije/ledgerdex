import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4 mb-7", className)}>
      <div className="min-w-0">
        <h1
          className="text-2xl font-bold tracking-tight leading-tight"
          style={{ color: "var(--fg)" }}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            className="text-sm mt-0.5 leading-relaxed"
            style={{ color: "var(--fg-muted)" }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      )}
    </div>
  );
}
