import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { PaymentStatus, PropertyType, RemarkLabel, Taxability } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(value);
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Copy text to the clipboard. Falls back to a hidden-textarea + execCommand so
 * it still works on the office LAN, where the app is served over plain http and
 * `navigator.clipboard` is unavailable (it requires a secure context).
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy path
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getPaymentStatusColor(status: PaymentStatus): string {
  switch (status) {
    case "PAID":       return "bg-green-100 text-green-800 border-green-200";
    case "PARTIAL":    return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "UNPAID":     return "bg-red-100 text-red-800 border-red-200";
    case "DELINQUENT": return "bg-purple-100 text-purple-800 border-purple-200";
    case "ADVANCE":    return "bg-teal-100 text-teal-800 border-teal-200";
    case "CURRENT":    return "bg-sky-100 text-sky-800 border-sky-200";
    default:           return "bg-gray-100 text-gray-800 border-gray-200";
  }
}

export function getTaxabilityColor(t: Taxability): string {
  return t === "TAXABLE"
    ? "bg-blue-100 text-blue-800 border-blue-200"
    : "bg-gray-100 text-gray-700 border-gray-200";
}

export function getPropertyTypeLabel(type: PropertyType): string {
  switch (type) {
    case "LAND": return "Land";
    case "BLDG": return "Building";
    case "MACH": return "Machinery";
    case "MISC": return "Miscellaneous";
    default:     return type;
  }
}

export const REMARK_COLORS: Record<RemarkLabel, string> = {
  PAID:             "#16A34A",
  FOR_VERIFICATION: "#D97706",
  TAX_MAPPING:      "#2563EB",
  EXEMPT:           "#6B7280",
  DELINQUENT:       "#DC2626",
  ARCHIVED:         "#7C3AED",
  OTHER:            "#0891B2",
};

export const REMARK_LABELS: Record<RemarkLabel, string> = {
  PAID:             "Paid",
  FOR_VERIFICATION: "For Verification",
  TAX_MAPPING:      "Tax Mapping",
  EXEMPT:           "Exempt",
  DELINQUENT:       "Delinquent",
  ARCHIVED:         "Archived",
  OTHER:            "Other",
};

export const MUNICIPALITIES = [
  "ASUNCION",
  "BRAULIO E. DUJALI",
  "CARMEN",
  "KAPALONG",
  "NABUNTURAN",
  "NEW CORELLA",
  "PANABO CITY",
  "SAMAL ISLAND",
  "SAN ISIDRO",
  "SANTO TOMAS",
  "TAGUM CITY",
  "TALAINGOD",
];

export function parseQuarter(str: string): { year: number; quarter: number } | null {
  const match = str?.match(/(\d{4})\s*Q(\d)/i);
  if (!match) return null;
  return { year: parseInt(match[1]), quarter: parseInt(match[2]) };
}

export function formatQuarter(year?: number | null, quarter?: number | null): string {
  if (!year) return "—";
  if (!quarter) return String(year);
  return `${year} Q${quarter}`;
}

export const ACTION_LABELS: Record<string, string> = {
  DOCUMENT_UPLOAD:     "Uploaded document",
  DOCUMENT_EXTRACT:    "Extracted properties",
  PROPERTY_CREATE:     "Created property",
  PROPERTY_UPDATE:     "Updated property",
  PROPERTY_DELETE:     "Deleted property",
  PAYMENT_ADD:         "Recorded payment",
  REMARK_ADD:          "Added remark",
  REMARK_DELETE:       "Deleted remark",
  ATTACHMENT_UPLOAD:   "Uploaded attachment",
  ATTACHMENT_DELETE:   "Deleted attachment",
  USER_LOGIN:          "Logged in",
  USER_LOGOUT:         "Logged out",
  USER_CREATE:         "Created user",
  USER_UPDATE:         "Updated user",
  DELINQUENCY_IMPORT:          "Imported delinquency list",
  DELINQUENCY_ACCOUNT_UPDATE:  "Updated delinquent account",
  DELINQUENCY_ACCOUNT_DELETE:  "Deleted delinquent account",
  DELINQUENCY_SETTLEMENT_ADD:  "Recorded settlement",
  DELINQUENCY_SETTLEMENT_EDIT: "Edited settlement",
  DELINQUENCY_SETTLEMENT_VOID: "Voided settlement",
  DELINQUENCY_LIST_DELETE:     "Deleted delinquency list",
};
