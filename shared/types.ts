/**
 * Types shared between the React app (src/) and the serverless API
 * (netlify/functions/). Money is always integer pence.
 */

export type DocumentKind = "quote" | "invoice" | "job_card";

export const DOCUMENT_KINDS: DocumentKind[] = ["quote", "invoice", "job_card"];

/** URL slug <-> database kind. Routes read `/invoices`, the database stores `invoice`. */
export const KIND_SLUGS: Record<DocumentKind, string> = {
  quote: "quotes",
  invoice: "invoices",
  job_card: "job-cards",
};

export const SLUG_TO_KIND: Record<string, DocumentKind> = {
  quotes: "quote",
  invoices: "invoice",
  "job-cards": "job_card",
};

export const KIND_LABELS: Record<DocumentKind, { singular: string; plural: string }> = {
  quote: { singular: "Quote", plural: "Quotes" },
  invoice: { singular: "Invoice", plural: "Invoices" },
  job_card: { singular: "Job card", plural: "Job cards" },
};

/** Statuses are per-kind; the API rejects a status that isn't valid for the kind. */
export const STATUSES_BY_KIND: Record<DocumentKind, string[]> = {
  quote: ["draft", "sent", "accepted", "declined", "expired"],
  invoice: ["draft", "sent", "part_paid", "paid", "cancelled"],
  job_card: ["open", "in_progress", "completed"],
};

export const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
  part_paid: "Part paid",
  paid: "Paid",
  cancelled: "Cancelled",
  open: "Open",
  in_progress: "In progress",
  completed: "Completed",
  overdue: "Overdue",
};

export type LineItemType = "labour" | "part" | "other";
export type LineItemUnit = "hrs" | "each" | "litres" | "job";

export const LINE_ITEM_TYPES: LineItemType[] = ["labour", "part", "other"];
export const LINE_ITEM_UNITS: LineItemUnit[] = ["hrs", "each", "litres", "job"];

export interface LineItem {
  id: string;
  type: LineItemType;
  description: string;
  partNumber: string;
  quantity: number;
  unit: LineItemUnit;
  unitPricePence: number;
  taxable: boolean;
}

export type DiscountType = "none" | "percent" | "fixed";

export interface GarageDocument {
  id: string;
  kind: DocumentKind;
  number: string;
  status: string;

  issueDate: string; // YYYY-MM-DD
  dueDate: string | null;

  customerName: string;
  customerAddress: string;
  customerPhone: string;
  customerEmail: string;

  vehicleReg: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleColour: string;
  vehicleVin: string;
  vehicleYear: number | null;
  vehicleMileage: number | null;
  motDue: string | null;
  nextServiceDue: string | null;

  workPerformed: string;
  technician: string;
  notes: string;
  internalNotes: string;

  discountType: DiscountType;
  /** Percent as a whole number (10 = 10%), or pence when discountType is "fixed". */
  discountValue: number;

  vatEnabled: boolean;
  /** Percent as a whole number, e.g. 20. Snapshotted per document. */
  vatRate: number;

  amountPaidPence: number;
  paidDate: string | null;
  paymentMethod: string;

  convertedFromId: string | null;
  convertedFromNumber?: string | null;

  lineItems: LineItem[];

  createdAt: string;
  updatedAt: string;
}

/** Row shape returned by list endpoints — no line items, totals precomputed. */
export interface DocumentSummary {
  id: string;
  kind: DocumentKind;
  number: string;
  status: string;
  issueDate: string;
  dueDate: string | null;
  customerName: string;
  vehicleReg: string;
  vehicleMake: string;
  vehicleModel: string;
  totalPence: number;
  amountPaidPence: number;
  balancePence: number;
  isOverdue: boolean;
}

export interface Settings {
  businessName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postcode: string;
  phone: string;
  email: string;
  website: string;
  logoDataUrl: string;
  bankName: string;
  bankAccountName: string;
  bankSortCode: string;
  bankAccountNumber: string;
  paymentTerms: string;
  invoiceFooter: string;
  vatEnabled: boolean;
  vatRate: number;
  vatNumber: string;
  companyNumber: string;
  quotePrefix: string;
  invoicePrefix: string;
  jobCardPrefix: string;
  defaultLabourRatePence: number;
  defaultPaymentTermsDays: number;
}

export interface DashboardStats {
  outstandingPence: number;
  overdueCount: number;
  overduePence: number;
  revenueThisMonthPence: number;
  revenueThisYearPence: number;
  averageInvoicePence: number;
  invoiceCount: number;
  jobsCompleted: number;
  openQuotes: number;
  openJobCards: number;
  revenueByMonth: { month: string; totalPence: number }[];
  recent: DocumentSummary[];
}
