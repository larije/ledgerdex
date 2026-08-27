"use client";
import { cn } from "@/lib/utils";
import { SelectHTMLAttributes, forwardRef } from "react";
import { ChevronDown } from "lucide-react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, placeholder, children, className, id, ...props }, ref) => {
    const selectId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="flex flex-col gap-2">
        {label && (
          <label
            htmlFor={selectId}
            className="text-sm font-semibold text-gray-800 dark:text-slate-200"
          >
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={cn(
              "w-full rounded-xl border px-3.5 py-3 pr-10 text-sm bg-white dark:bg-slate-800 appearance-none peer",
              "border-gray-300 dark:border-slate-600 text-gray-900 dark:text-slate-100",
              "focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none",
              "transition-colors duration-150",
              className
            )}
            {...props}
          >
            {placeholder && <option value="">{placeholder}</option>}
            {children}
          </select>
          <ChevronDown
            size={16}
            className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 transition-transform duration-200 peer-focus:rotate-180"
          />
        </div>
        {error && (
          <span className="text-sm font-medium text-red-600">{error}</span>
        )}
      </div>
    );
  }
);
Select.displayName = "Select";
