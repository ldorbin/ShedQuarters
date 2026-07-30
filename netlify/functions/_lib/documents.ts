import type { DocumentKind, GarageDocument, LineItem } from "../../../shared/types";
import { STATUSES_BY_KIND } from "../../../shared/types";
import { toDateString, toInt, toIntOrNull, toIsoString, toNum } from "./db";

export const DOCUMENT_COLUMNS = `
  id, kind, number, status, issue_date, due_date,
  customer_name, customer_address, customer_phone, customer_email,
  vehicle_reg, vehicle_make, vehicle_model, vehicle_colour, vehicle_vin,
  vehicle_year, vehicle_mileage, mot_due, next_service_due,
  work_performed, technician, notes, internal_notes,
  discount_type, discount_value, vat_enabled, vat_rate,
  amount_paid_pence, paid_date, payment_method,
  converted_from_id, created_at, updated_at
`;

type Row = Record<string, unknown>;

export function rowToDocument(row: Row, lineItems: LineItem[] = []): GarageDocument {
  return {
    id: String(row.id),
    kind: row.kind as DocumentKind,
    number: str(row.number),
    status: str(row.status),

    issueDate: toDateString(row.issue_date) ?? "",
    dueDate: toDateString(row.due_date),

    customerName: str(row.customer_name),
    customerAddress: str(row.customer_address),
    customerPhone: str(row.customer_phone),
    customerEmail: str(row.customer_email),

    vehicleReg: str(row.vehicle_reg),
    vehicleMake: str(row.vehicle_make),
    vehicleModel: str(row.vehicle_model),
    vehicleColour: str(row.vehicle_colour),
    vehicleVin: str(row.vehicle_vin),
    vehicleYear: toIntOrNull(row.vehicle_year),
    vehicleMileage: toIntOrNull(row.vehicle_mileage),
    motDue: toDateString(row.mot_due),
    nextServiceDue: toDateString(row.next_service_due),

    workPerformed: str(row.work_performed),
    technician: str(row.technician),
    notes: str(row.notes),
    internalNotes: str(row.internal_notes),

    discountType: (row.discount_type as GarageDocument["discountType"]) ?? "none",
    discountValue: toNum(row.discount_value),

    vatEnabled: Boolean(row.vat_enabled),
    vatRate: toNum(row.vat_rate),

    amountPaidPence: toInt(row.amount_paid_pence),
    paidDate: toDateString(row.paid_date),
    paymentMethod: str(row.payment_method),

    convertedFromId: row.converted_from_id ? String(row.converted_from_id) : null,
    convertedFromNumber: row.converted_from_number ? String(row.converted_from_number) : null,

    lineItems,

    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

export function rowToLineItem(row: Row): LineItem {
  return {
    id: String(row.id),
    type: (row.type as LineItem["type"]) ?? "labour",
    description: str(row.description),
    partNumber: str(row.part_number),
    quantity: toNum(row.quantity),
    unit: (row.unit as LineItem["unit"]) ?? "each",
    unitPricePence: toInt(row.unit_price_pence),
    taxable: Boolean(row.taxable),
  };
}

/** Values written to `documents`, in the order used by INSERT and UPDATE. */
export interface DocumentValues {
  status: string;
  issue_date: string;
  due_date: string | null;
  customer_name: string;
  customer_address: string;
  customer_phone: string;
  customer_email: string;
  vehicle_reg: string;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_colour: string;
  vehicle_vin: string;
  vehicle_year: number | null;
  vehicle_mileage: number | null;
  mot_due: string | null;
  next_service_due: string | null;
  work_performed: string;
  technician: string;
  notes: string;
  internal_notes: string;
  discount_type: string;
  discount_value: number;
  vat_enabled: boolean;
  vat_rate: number;
  amount_paid_pence: number;
  paid_date: string | null;
  payment_method: string;
}

export const DOCUMENT_VALUE_KEYS: (keyof DocumentValues)[] = [
  "status",
  "issue_date",
  "due_date",
  "customer_name",
  "customer_address",
  "customer_phone",
  "customer_email",
  "vehicle_reg",
  "vehicle_make",
  "vehicle_model",
  "vehicle_colour",
  "vehicle_vin",
  "vehicle_year",
  "vehicle_mileage",
  "mot_due",
  "next_service_due",
  "work_performed",
  "technician",
  "notes",
  "internal_notes",
  "discount_type",
  "discount_value",
  "vat_enabled",
  "vat_rate",
  "amount_paid_pence",
  "paid_date",
  "payment_method",
];

/**
 * Whitelists and coerces a request body into database values. Anything the
 * client sends that isn't listed here is discarded — clients cannot set
 * `id`, `number`, `kind` or timestamps.
 */
export function parseDocumentValues(body: Record<string, unknown>, kind: DocumentKind): DocumentValues {
  const allowedStatuses = STATUSES_BY_KIND[kind];
  const requested = str(body.status);
  const status = allowedStatuses.includes(requested) ? requested : allowedStatuses[0];

  const discountType = ["none", "percent", "fixed"].includes(str(body.discountType))
    ? str(body.discountType)
    : "none";

  return {
    status,
    issue_date: dateOrToday(body.issueDate),
    due_date: dateOrNull(body.dueDate),
    customer_name: str(body.customerName, 200),
    customer_address: str(body.customerAddress, 500),
    customer_phone: str(body.customerPhone, 50),
    customer_email: str(body.customerEmail, 200),
    vehicle_reg: str(body.vehicleReg, 20).toUpperCase(),
    vehicle_make: str(body.vehicleMake, 60),
    vehicle_model: str(body.vehicleModel, 60),
    vehicle_colour: str(body.vehicleColour, 40),
    vehicle_vin: str(body.vehicleVin, 40).toUpperCase(),
    vehicle_year: clampInt(body.vehicleYear, 1885, 2200),
    vehicle_mileage: clampInt(body.vehicleMileage, 0, 10_000_000),
    mot_due: dateOrNull(body.motDue),
    next_service_due: dateOrNull(body.nextServiceDue),
    work_performed: str(body.workPerformed, 20_000),
    technician: str(body.technician, 100),
    notes: str(body.notes, 20_000),
    internal_notes: str(body.internalNotes, 20_000),
    discount_type: discountType,
    discount_value: Math.max(0, toNum(body.discountValue)),
    vat_enabled: Boolean(body.vatEnabled),
    vat_rate: Math.min(100, Math.max(0, toNum(body.vatRate))),
    amount_paid_pence: Math.max(0, Math.round(toNum(body.amountPaidPence))),
    paid_date: dateOrNull(body.paidDate),
    payment_method: str(body.paymentMethod, 60),
  };
}

export interface LineItemValues {
  sort_order: number;
  type: string;
  description: string;
  part_number: string;
  quantity: number;
  unit: string;
  unit_price_pence: number;
  taxable: boolean;
}

export function parseLineItems(input: unknown): LineItemValues[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 200).map((raw, index) => {
    const item = (raw ?? {}) as Record<string, unknown>;
    return {
      sort_order: index,
      type: ["labour", "part", "other"].includes(str(item.type)) ? str(item.type) : "labour",
      description: str(item.description, 500),
      part_number: str(item.partNumber, 100),
      quantity: roundTo2(toNum(item.quantity)),
      unit: ["hrs", "each", "litres", "job"].includes(str(item.unit)) ? str(item.unit) : "each",
      unit_price_pence: Math.round(toNum(item.unitPricePence)),
      taxable: item.taxable === undefined ? true : Boolean(item.taxable),
    };
  });
}

function str(value: unknown, maxLength = 10_000): string {
  if (value === null || value === undefined) return "";
  return String(value).slice(0, maxLength);
}

function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clampInt(value: unknown, min: number, max: number): number | null {
  const parsed = toIntOrNull(value);
  if (parsed === null) return null;
  return Math.min(max, Math.max(min, parsed));
}

function dateOrNull(value: unknown): string | null {
  const text = str(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function dateOrToday(value: unknown): string {
  return dateOrNull(value) ?? new Date().toISOString().slice(0, 10);
}
