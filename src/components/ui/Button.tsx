"use client";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "danger" | "success" | "ghost" | "outline";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center rounded-xl font-medium " +
  "transition-all duration-200 cursor-pointer " +
  "hover:scale-[1.02] active:scale-[0.98] " +
  "disabled:cursor-not-allowed disabled:scale-100 disabled:opacity-60";

const variants: Record<Variant, string> = {
  primary:
    "bg-gradient-to-r from-blue-600 to-blue-700 text-white " +
    "shadow-[0_2px_8px_rgba(37,99,235,0.30)] " +
    "hover:from-blue-700 hover:to-blue-800",
  secondary:
    "bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 border border-gray-200 dark:border-slate-600 shadow-sm " +
    "hover:bg-gray-50 dark:hover:bg-slate-700 hover:border-gray-300 dark:hover:border-slate-500",
  danger:
    "bg-gradient-to-r from-red-500 to-red-600 text-white " +
    "shadow-[0_2px_8px_rgba(239,68,68,0.28)]",
  success:
    "bg-gradient-to-r from-emerald-500 to-emerald-600 text-white " +
    "shadow-[0_2px_8px_rgba(16,185,129,0.28)]",
  ghost:
    "text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-slate-100",
  outline:
    "border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 hover:border-gray-400 dark:hover:border-slate-500",
};

const sizes: Record<Size, string> = {
  sm: "px-3.5 py-2 text-sm gap-1.5",
  md: "px-5 py-2.5 text-sm gap-2",
  lg: "px-6 py-3 text-base gap-2",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading,
      children,
      className,
      disabled,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading || undefined}
        className={cn(base, variants[variant], sizes[size], className)}
        {...props}
      >
        {loading && <Loader2 size={16} className="animate-spin shrink-0" />}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
