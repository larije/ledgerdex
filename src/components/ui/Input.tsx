"use client";
import { cn } from "@/lib/utils";
import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: React.ReactNode;
  suffix?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, icon, suffix, className, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="flex flex-col gap-2">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-semibold"
            style={{ color: "var(--fg)" }}
          >
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <span
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "var(--fg-muted)" }}
            >
              {icon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              "w-full text-sm rounded-xl border transition-all duration-150 outline-none",
              "placeholder:text-[var(--fg-muted)]",
              icon ? "pl-10 pr-3.5 py-3" : "px-3.5 py-3",
              suffix && "pr-10",
              error
                ? "border-red-400 focus:border-red-500 focus:shadow-[0_0_0_3px_rgba(239,68,68,0.15)]"
                : "focus:border-indigo-400 focus:shadow-[0_0_0_3px_rgba(79,70,229,0.15)]",
              className
            )}
            style={{
              background: "var(--surface)",
              color: "var(--fg)",
              borderColor: error ? undefined : "var(--border-strong)",
            }}
            {...props}
          />
          {suffix && (
            <span
              className="absolute right-3 top-1/2 -translate-y-1/2"
              style={{ color: "var(--fg-muted)" }}
            >
              {suffix}
            </span>
          )}
        </div>
        {error && (
          <span className="text-sm font-medium text-red-500 flex items-center gap-1">
            {error}
          </span>
        )}
        {hint && !error && (
          <span className="text-sm" style={{ color: "var(--fg-muted)" }}>
            {hint}
          </span>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";
