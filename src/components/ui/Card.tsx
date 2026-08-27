import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  style?: React.CSSProperties;
}

export function Card({ children, className, hover, style }: CardProps) {
  return (
    <div
      className={cn(
        "bg-white dark:bg-slate-800 rounded-2xl border border-gray-200/80 dark:border-slate-700/80 shadow-[0_1px_3px_rgba(0,0,0,0.05),_0_4px_12px_rgba(0,0,0,0.04)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.2),_0_4px_12px_rgba(0,0,0,0.15)]",
        hover && "card-lift cursor-pointer",
        className
      )}
      style={style}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("px-7 py-5 border-b border-gray-100 dark:border-slate-700", className)}>
      {children}
    </div>
  );
}

export function CardTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h3
      className={cn(
        "font-semibold text-gray-900 dark:text-slate-100 text-base tracking-[-0.01em]",
        className
      )}
    >
      {children}
    </h3>
  );
}

export function CardContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("px-7 py-6", className)}>{children}</div>;
}
