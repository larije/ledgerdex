export type Role = "ADMIN" | "ASSESSOR" | "ENCODER" | "VIEWER";
export type ExtractionStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
export type PropertyType = "LAND" | "BLDG" | "MACH" | "MISC";
export type Taxability = "TAXABLE" | "EXEMPT";
export type PaymentStatus = "PAID" | "PARTIAL" | "UNPAID" | "DELINQUENT" | "ADVANCE" | "CURRENT";
export type RemarkLabel =
  | "PAID"
  | "FOR_VERIFICATION"
  | "TAX_MAPPING"
  | "EXEMPT"
  | "DELINQUENT"
  | "ARCHIVED"
  | "OTHER";

export interface User {
  id: string;
  username: string;
  name: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Document {
  id: string;
  originalName: string;
  storedName: string;
  fileSize: number;
  taxpayerName?: string;
  taxpayerAddress?: string;
  noaCount?: string;
  assessmentYear?: number;
  municipality?: string;
  extractionStatus: ExtractionStatus;
  extractedCount: number;
  uploadedById: string;
  uploadedBy: User;
  createdAt: string;
  updatedAt: string;
}

export interface Property {
  id: string;
  documentId?: string;
  document?: Document;
  tdNumber: string;
  propertyIndexNo?: string;
  propertyLocation?: string;
  barangay?: string;
  municipality?: string;
  lotBlockNo?: string;
  class?: string;
  type: PropertyType;
  area?: number;
  marketValue?: number;
  assessedValue?: number;
  effectivity?: number;
  taxability: Taxability;
  taxesBeginYear?: number;
  taxesBeginQuarter?: number;
  paymentStatus: PaymentStatus;
  paidUpToYear?: number;
  paidUpToQuarter?: number;
  isManualEntry: boolean;
  isChecked: boolean;
  createdAt: string;
  updatedAt: string;
  remarks?: Remark[];
  payments?: Payment[];
  attachments?: Attachment[];
  _count?: { remarks: number; payments: number; attachments: number };
}

export interface Payment {
  id: string;
  propertyId: string;
  orNumber?: string;
  paymentDate?: string;
  amount: number;
  collector?: string;
  year?: number;
  quarter?: number;
  notes?: string;
  recordedById: string;
  recordedBy: User;
  createdAt: string;
}

export interface Remark {
  id: string;
  propertyId: string;
  label: RemarkLabel;
  text: string;
  color: string;
  createdById: string;
  createdBy: User;
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  id: string;
  propertyId: string;
  originalName: string;
  storedName: string;
  fileSize: number;
  mimeType: string;
  uploadedById: string;
  uploadedBy: User;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  action: string;
  userId: string;
  user: User;
  propertyId?: string;
  documentId?: string;
  details?: string;
  createdAt: string;
}

export interface DashboardStats {
  totalDocuments: number;
  totalProperties: number;
  taxableProperties: number;
  exemptProperties: number;
  paidCount: number;
  unpaidCount: number;
  partialCount: number;
  delinquentCount: number;
  advanceCount: number;
  currentCount: number;
  totalAssessedValue: number;
  recentDocuments: Document[];
  recentProperties: Property[];
}

export interface ExtractedRow {
  tdNumber: string;
  propertyIndexNo: string;
  propertyLocation: string;
  barangay: string;
  municipality: string;
  lotBlockNo: string;
  class: string;
  type: string;
  area: string;
  marketValue: string;
  assessedValue: string;
  effectivity: string;
  taxability: string;
  taxesBegin: string;
}

export interface SearchFilters {
  search?: string;
  municipality?: string;
  barangay?: string;
  type?: PropertyType;
  taxability?: Taxability;
  paymentStatus?: PaymentStatus;
  effectivity?: number;
  page?: number;
  limit?: number;
}

// ─────────────────────────────────────────────
// Delinquency Module
// ─────────────────────────────────────────────

export type RpuType = "LAND" | "BLDG" | "MACH" | "PLANTTREE" | "MISC";
export type SettlementStatus = "OUTSTANDING" | "PARTIAL" | "SETTLED" | "RESOLVED";

// NOTE: Prisma serializes Decimal columns to strings over JSON. These money/area
// fields are typed as `number` to match the existing Property convention; always
// wrap them in Number() before doing arithmetic on the client.
export interface DelinquencyList {
  id: string;
  province: string;
  municipality: string;
  asOfDate?: string | null;
  title?: string | null;
  lastImportedAt?: string | null;
  accountCount: number;
  totalAmountDue: number;
  totalSettled: number;
  createdAt: string;
  updatedAt: string;
  _count?: { accounts: number; imports: number };
}

export interface DelinquentAccount {
  id: string;
  listId: string;
  list?: DelinquencyList;
  rowNo?: number | null;
  tdNumber: string;
  pin?: string | null;
  barangay?: string | null;
  classCode?: string | null;
  rpuType: RpuType;
  areaSqm?: number | null;
  taxpayerName: string;
  cadastralLotNo?: string | null;
  delinquentFromYear?: number | null;
  delinquentFromQuarter?: number | null;
  delinquentToYear?: number | null;
  delinquentToQuarter?: number | null;
  amountDue: number;
  amountPaid: number;
  balance: number;
  status: SettlementStatus;
  settledAt?: string | null;
  reappearedAfterSettle: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  isPresent: boolean;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  settlements?: SettlementPayment[];
  _count?: { settlements: number };
}

export interface SettlementPayment {
  id: string;
  accountId: string;
  amount: number;
  orNumber?: string | null;
  paymentDate?: string | null;
  collector?: string | null;
  notes?: string | null;
  recordedById?: string | null;
  recordedBy?: { name: string } | null;
  createdAt: string;
}

export interface DelinquencyImport {
  id: string;
  listId: string;
  fileName: string;
  storedName: string;
  fileSize: number;
  asOfDate?: string | null;
  rowsParsed: number;
  rowsAdded: number;
  rowsUpdated: number;
  rowsResolved: number;
  rowsReappeared: number;
  rowErrors: number;
  totalAmountDue: number;
  importedById?: string | null;
  importedBy?: { name: string } | null;
  createdAt: string;
}

/** One parsed row from a delinquency summary PDF (parser output). */
export interface ParsedDelinquentRow {
  rowNo: number | null;
  tdNumber: string;
  pin: string | null;
  barangay: string | null;
  classCode: string | null;
  rpuType: RpuType;
  areaSqm: number | null;
  taxpayerName: string;
  cadastralLotNo: string | null;
  delinquentFromYear: number | null;
  delinquentFromQuarter: number | null;
  delinquentToYear: number | null;
  delinquentToQuarter: number | null;
  amountDue: number;
}

export interface ParsedRowError {
  rowNo: number | null;
  raw: string;
  reason: string;
}

export interface ParsedDelinquencyDoc {
  province: string;
  municipality: string;
  asOfDate: string | null;
  title: string | null;
  rows: ParsedDelinquentRow[];
  rowErrors: ParsedRowError[];
}

/** Reconciliation preview — computed without writing to the DB. */
export interface ReconcilePreview {
  province: string;
  municipality: string;
  asOfDate: string | null;
  listExists: boolean;
  rowsParsed: number;
  added: number;
  updated: number;
  resolved: number;
  reappeared: number;
  rowErrors: number;
  totalAmountDue: number;
}
