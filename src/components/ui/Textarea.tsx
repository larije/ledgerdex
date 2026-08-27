"use client";
import { cn } from "@/lib/utils";
import { TextareaHTMLAttributes, forwardRef } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    const areaId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="flex flex-col gap-2">
        {label && (
          <label
            htmlFor={areaId}
            className="text-sm font-semibold"
            style={{ color: "var(--fg)" }}
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={areaId}
          rows={3}
          className={cn(
            "w-full px-3.5 py-3 text-sm rounded-xl border transition-all duration-150 outline-none resize-none",
            "placeholder:text-[var(--fg-muted)]",
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
        {error && (
          <span className="text-sm font-medium text-red-500">{error}</span>
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
Textarea.displayName = "Textarea";
