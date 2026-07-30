import type { Config } from "@netlify/functions";
import type { Settings } from "../../shared/types";
import { requireAuth } from "./_lib/auth";
import { query, queryOne, toInt, toNum, type Row } from "./_lib/db";
import { fail, json, serverError } from "./_lib/respond";

/** camelCase API field -> snake_case column. */
const FIELDS: Record<keyof Settings, string> = {
  businessName: "business_name",
  addressLine1: "address_line1",
  addressLine2: "address_line2",
  city: "city",
  postcode: "postcode",
  phone: "phone",
  email: "email",
  website: "website",
  logoDataUrl: "logo_data_url",
  bankName: "bank_name",
  bankAccountName: "bank_account_name",
  bankSortCode: "bank_sort_code",
  bankAccountNumber: "bank_account_number",
  paymentTerms: "payment_terms",
  invoiceFooter: "invoice_footer",
  vatEnabled: "vat_enabled",
  vatRate: "vat_rate",
  vatNumber: "vat_number",
  companyNumber: "company_number",
  quotePrefix: "quote_prefix",
  invoicePrefix: "invoice_prefix",
  jobCardPrefix: "job_card_prefix",
  defaultLabourRatePence: "default_labour_rate_pence",
  defaultPaymentTermsDays: "default_payment_terms_days",
};

const TEXT_LIMITS: Partial<Record<keyof Settings, number>> = {
  // A logo is stored inline as a data URL; cap it so the row stays sane.
  logoDataUrl: 800_000,
  paymentTerms: 4000,
  invoiceFooter: 4000,
};

export default async (req: Request): Promise<Response> => {
  const unauthorised = requireAuth(req);
  if (unauthorised) return unauthorised;

  try {
    if (req.method === "GET") {
      return json({ settings: await readSettings() });
    }
    if (req.method === "PUT") {
      let body: Record<string, unknown>;
      try {
        body = (await req.json()) as Record<string, unknown>;
      } catch {
        return fail(400, "Expected a JSON body.");
      }
      return json({ settings: await writeSettings(body) });
    }
    return fail(405, "Method not allowed.");
  } catch (error) {
    return serverError(error);
  }
};

async function readSettings(): Promise<Settings> {
  const row = await queryOne(`SELECT * FROM settings WHERE id = 1`);
  if (!row) {
    // The migration seeds this row, but never hand the app a broken response.
    const inserted = await query(
      `INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING RETURNING *`,
    );
    return rowToSettings(inserted[0] ?? {});
  }
  return rowToSettings(row);
}

async function writeSettings(body: Record<string, unknown>): Promise<Settings> {
  const keys = (Object.keys(FIELDS) as (keyof Settings)[]).filter((key) => key in body);
  if (keys.length === 0) return readSettings();

  const assignments = keys.map((key, index) => `${FIELDS[key]} = $${index + 1}`);
  const params = keys.map((key) => coerce(key, body[key]));

  const rows = await query(
    `UPDATE settings SET ${assignments.join(", ")}, updated_at = NOW() WHERE id = 1 RETURNING *`,
    params,
  );
  return rowToSettings(rows[0]);
}

function coerce(key: keyof Settings, value: unknown): unknown {
  switch (key) {
    case "vatEnabled":
      return Boolean(value);
    case "vatRate":
      return Math.min(100, Math.max(0, toNum(value)));
    case "defaultLabourRatePence":
      return Math.max(0, Math.round(toNum(value)));
    case "defaultPaymentTermsDays":
      return Math.min(365, Math.max(0, Math.round(toNum(value))));
    default:
      return String(value ?? "").slice(0, TEXT_LIMITS[key] ?? 500);
  }
}

function rowToSettings(row: Row): Settings {
  const text = (column: string) => String(row[column] ?? "");
  return {
    businessName: text("business_name") || "ShedQuarters",
    addressLine1: text("address_line1"),
    addressLine2: text("address_line2"),
    city: text("city"),
    postcode: text("postcode"),
    phone: text("phone"),
    email: text("email"),
    website: text("website"),
    logoDataUrl: text("logo_data_url"),
    bankName: text("bank_name"),
    bankAccountName: text("bank_account_name"),
    bankSortCode: text("bank_sort_code"),
    bankAccountNumber: text("bank_account_number"),
    paymentTerms: text("payment_terms"),
    invoiceFooter: text("invoice_footer"),
    vatEnabled: Boolean(row.vat_enabled),
    vatRate: toNum(row.vat_rate) || 20,
    vatNumber: text("vat_number"),
    companyNumber: text("company_number"),
    quotePrefix: text("quote_prefix") || "QUO-",
    invoicePrefix: text("invoice_prefix") || "INV-",
    jobCardPrefix: text("job_card_prefix") || "JOB-",
    defaultLabourRatePence: toInt(row.default_labour_rate_pence),
    defaultPaymentTermsDays: toInt(row.default_payment_terms_days) || 14,
  };
}

export const config: Config = {
  path: "/api/settings",
};
