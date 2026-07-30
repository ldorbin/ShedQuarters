import type { Config, Context } from "@netlify/functions";
import { calcTotals } from "../../shared/totals";
import type { DocumentKind, DocumentSummary, LineItem } from "../../shared/types";
import { DOCUMENT_KINDS, STATUSES_BY_KIND } from "../../shared/types";
import { formatDate, penceToDecimalString } from "../../shared/format";
import { requireAuth } from "./_lib/auth";
import { clientQuery, execute, query, queryOne, toInt, withTransaction, type DbClient, type Row } from "./_lib/db";
import {
  DOCUMENT_COLUMNS,
  DOCUMENT_VALUE_KEYS,
  parseDocumentValues,
  parseLineItems,
  rowToDocument,
  rowToLineItem,
} from "./_lib/documents";
import { fail, json, serverError } from "./_lib/respond";

const LINE_ITEM_COLUMNS = `id, type, description, part_number, quantity, unit, unit_price_pence, taxable`;

export default async (req: Request, context: Context): Promise<Response> => {
  const unauthorised = requireAuth(req);
  if (unauthorised) return unauthorised;

  try {
    const id = context.params?.id;
    const isConvert = new URL(req.url).pathname.endsWith("/convert");

    if (isConvert) {
      if (req.method !== "POST") return fail(405, "Method not allowed.");
      if (!id) return fail(400, "Missing document id.");
      return await convertDocument(req, id);
    }

    switch (req.method) {
      case "GET":
        return id ? await getDocument(id) : await listDocuments(req);
      case "POST":
        return await createDocument(req);
      case "PUT":
        if (!id) return fail(400, "Missing document id.");
        return await updateDocument(req, id);
      case "DELETE":
        if (!id) return fail(400, "Missing document id.");
        return await deleteDocument(id);
      default:
        return fail(405, "Method not allowed.");
    }
  } catch (error) {
    return serverError(error);
  }
};

// ---------------------------------------------------------------- read paths

async function listDocuments(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const kind = parseKind(url.searchParams.get("kind"));
  const status = url.searchParams.get("status") ?? "";
  const search = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit")) || 200));

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (kind) {
    params.push(kind);
    conditions.push(`kind = $${params.length}`);
  }
  if (status && status !== "all") {
    if (status === "overdue") {
      // Narrow in SQL, then confirm against computed balance below.
      conditions.push(`kind = 'invoice' AND status NOT IN ('paid', 'cancelled', 'draft')`);
      conditions.push(`due_date IS NOT NULL AND due_date < CURRENT_DATE`);
    } else {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }
  }
  if (search) {
    params.push(`%${search}%`);
    const p = `$${params.length}`;
    conditions.push(
      `(customer_name ILIKE ${p} OR vehicle_reg ILIKE ${p} OR number ILIKE ${p} OR vehicle_make ILIKE ${p} OR vehicle_model ILIKE ${p})`,
    );
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(limit);

  const rows = await query(
    `SELECT ${DOCUMENT_COLUMNS} FROM documents ${where}
     ORDER BY issue_date DESC, created_at DESC
     LIMIT $${params.length}`,
    params,
  );

  const itemsByDocument = await fetchLineItems(rows.map((row) => String(row.id)));
  let summaries = rows.map((row) => summarise(row, itemsByDocument.get(String(row.id)) ?? []));

  if (status === "overdue") {
    summaries = summaries.filter((summary) => summary.isOverdue);
  }

  if (url.searchParams.get("format") === "csv") {
    return csvResponse(summaries, kind);
  }

  return json({ documents: summaries });
}

async function getDocument(id: string): Promise<Response> {
  if (!isUuid(id)) return fail(404, "Not found.");

  const row = await queryOne(
    `SELECT d.*, source.number AS converted_from_number
     FROM documents d
     LEFT JOIN documents source ON source.id = d.converted_from_id
     WHERE d.id = $1`,
    [id],
  );
  if (!row) return fail(404, "Not found.");

  const items = await fetchLineItems([id]);
  return json({ document: rowToDocument(row, items.get(id) ?? []) });
}

async function fetchLineItems(ids: string[]): Promise<Map<string, LineItem[]>> {
  const grouped = new Map<string, LineItem[]>();
  if (ids.length === 0) return grouped;

  const rows = await query(
    `SELECT document_id, ${LINE_ITEM_COLUMNS} FROM line_items
     WHERE document_id = ANY($1::uuid[])
     ORDER BY document_id, sort_order`,
    [ids],
  );

  for (const row of rows) {
    const key = String(row.document_id);
    const list = grouped.get(key) ?? [];
    list.push(rowToLineItem(row));
    grouped.set(key, list);
  }
  return grouped;
}

function summarise(row: Row, lineItems: LineItem[]): DocumentSummary {
  const doc = rowToDocument(row, lineItems);
  const totals = calcTotals(doc);
  const overdue =
    doc.kind === "invoice" &&
    !["paid", "cancelled", "draft"].includes(doc.status) &&
    Boolean(doc.dueDate) &&
    doc.dueDate! < new Date().toISOString().slice(0, 10) &&
    totals.balancePence > 0;

  return {
    id: doc.id,
    kind: doc.kind,
    number: doc.number,
    status: doc.status,
    issueDate: doc.issueDate,
    dueDate: doc.dueDate,
    customerName: doc.customerName,
    vehicleReg: doc.vehicleReg,
    vehicleMake: doc.vehicleMake,
    vehicleModel: doc.vehicleModel,
    totalPence: totals.totalPence,
    amountPaidPence: totals.paidPence,
    balancePence: totals.balancePence,
    isOverdue: overdue,
  };
}

// --------------------------------------------------------------- write paths

async function createDocument(req: Request): Promise<Response> {
  const body = await readJsonBody(req);
  if (!body) return fail(400, "Expected a JSON body.");

  const kind = parseKind(body.kind);
  if (!kind) return fail(400, "A valid document kind is required.");

  const values = parseDocumentValues(body, kind);
  const lineItems = parseLineItems(body.lineItems);

  const created = await withTransaction(async (client) => {
    const number = await allocateNumber(client, kind);
    const columns = ["kind", "number", ...DOCUMENT_VALUE_KEYS];
    const params: unknown[] = [kind, number, ...DOCUMENT_VALUE_KEYS.map((key) => values[key])];
    const placeholders = params.map((_, index) => `$${index + 1}`).join(", ");

    const rows = await clientQuery(
      client,
      `INSERT INTO documents (${columns.join(", ")}) VALUES (${placeholders})
       RETURNING ${DOCUMENT_COLUMNS}`,
      params,
    );
    const documentId = String(rows[0].id);
    await insertLineItems(client, documentId, lineItems);
    return rows[0];
  });

  const items = await fetchLineItems([String(created.id)]);
  return json({ document: rowToDocument(created, items.get(String(created.id)) ?? []) }, { status: 201 });
}

async function updateDocument(req: Request, id: string): Promise<Response> {
  if (!isUuid(id)) return fail(404, "Not found.");

  const body = await readJsonBody(req);
  if (!body) return fail(400, "Expected a JSON body.");

  const existing = await queryOne(`SELECT kind FROM documents WHERE id = $1`, [id]);
  if (!existing) return fail(404, "Not found.");

  const kind = existing.kind as DocumentKind;
  const values = parseDocumentValues(body, kind);
  const lineItems = parseLineItems(body.lineItems);

  const updated = await withTransaction(async (client) => {
    const assignments = DOCUMENT_VALUE_KEYS.map((key, index) => `${key} = $${index + 2}`).join(", ");
    const params: unknown[] = [id, ...DOCUMENT_VALUE_KEYS.map((key) => values[key])];

    const rows = await clientQuery(
      client,
      `UPDATE documents SET ${assignments}, updated_at = NOW()
       WHERE id = $1
       RETURNING ${DOCUMENT_COLUMNS}`,
      params,
    );
    await clientQuery(client, `DELETE FROM line_items WHERE document_id = $1`, [id]);
    await insertLineItems(client, id, lineItems);
    return rows[0];
  });

  const items = await fetchLineItems([id]);
  return json({ document: rowToDocument(updated, items.get(id) ?? []) });
}

async function deleteDocument(id: string): Promise<Response> {
  if (!isUuid(id)) return fail(404, "Not found.");
  const deleted = await execute(`DELETE FROM documents WHERE id = $1`, [id]);
  if (!deleted) return fail(404, "Not found.");
  return json({ deleted: true });
}

/**
 * Copies a quote (or job card) into a new document of another kind, keeping the
 * customer, vehicle, work description and every line item, and recording the
 * link back to the source.
 */
async function convertDocument(req: Request, id: string): Promise<Response> {
  if (!isUuid(id)) return fail(404, "Not found.");

  const body = (await readJsonBody(req)) ?? {};
  const targetKind = parseKind(body.targetKind) ?? "invoice";

  const source = await queryOne(`SELECT kind FROM documents WHERE id = $1`, [id]);
  if (!source) return fail(404, "Not found.");

  if (source.kind === targetKind) {
    return fail(400, `That document is already a ${targetKind.replace("_", " ")}.`);
  }

  const created = await withTransaction(async (client) => {
    const settings = await clientQuery(
      client,
      `SELECT default_payment_terms_days FROM settings WHERE id = 1`,
    );
    const termsDays = toInt(settings[0]?.default_payment_terms_days) || 14;
    const today = new Date().toISOString().slice(0, 10);
    const dueDate = targetKind === "invoice" ? addDays(today, termsDays) : null;

    const number = await allocateNumber(client, targetKind);

    const rows = await clientQuery(
      client,
      `INSERT INTO documents (
         kind, number, status, issue_date, due_date,
         customer_name, customer_address, customer_phone, customer_email,
         vehicle_reg, vehicle_make, vehicle_model, vehicle_colour, vehicle_vin,
         vehicle_year, vehicle_mileage, mot_due, next_service_due,
         work_performed, technician, notes, internal_notes,
         discount_type, discount_value, vat_enabled, vat_rate, converted_from_id
       )
       SELECT $1, $2, $3, $4::date, $5::date,
         customer_name, customer_address, customer_phone, customer_email,
         vehicle_reg, vehicle_make, vehicle_model, vehicle_colour, vehicle_vin,
         vehicle_year, vehicle_mileage, mot_due, next_service_due,
         work_performed, technician, notes, internal_notes,
         discount_type, discount_value, vat_enabled, vat_rate, id
       FROM documents WHERE id = $6
       RETURNING ${DOCUMENT_COLUMNS}`,
      [targetKind, number, STATUSES_BY_KIND[targetKind][0], today, dueDate, id],
    );

    const newId = String(rows[0].id);
    await clientQuery(
      client,
      `INSERT INTO line_items (document_id, sort_order, type, description, part_number, quantity, unit, unit_price_pence, taxable)
       SELECT $1, sort_order, type, description, part_number, quantity, unit, unit_price_pence, taxable
       FROM line_items WHERE document_id = $2`,
      [newId, id],
    );
    return rows[0];
  });

  const items = await fetchLineItems([String(created.id)]);
  return json(
    { document: rowToDocument(created, items.get(String(created.id)) ?? []) },
    { status: 201 },
  );
}

async function insertLineItems(
  client: DbClient,
  documentId: string,
  items: ReturnType<typeof parseLineItems>,
): Promise<void> {
  if (items.length === 0) return;

  const params: unknown[] = [];
  const tuples = items.map((item) => {
    const start = params.length;
    params.push(
      documentId,
      item.sort_order,
      item.type,
      item.description,
      item.part_number,
      item.quantity,
      item.unit,
      item.unit_price_pence,
      item.taxable,
    );
    return `(${Array.from({ length: 9 }, (_, i) => `$${start + i + 1}`).join(", ")})`;
  });

  await clientQuery(
    client,
    `INSERT INTO line_items
       (document_id, sort_order, type, description, part_number, quantity, unit, unit_price_pence, taxable)
     VALUES ${tuples.join(", ")}`,
    params,
  );
}

/**
 * Hands out the next number for a kind. The UPDATE ... RETURNING runs inside
 * the caller's transaction and takes a row lock, so concurrent saves queue up
 * instead of both receiving INV-0042.
 */
async function allocateNumber(client: DbClient, kind: DocumentKind): Promise<string> {
  const counter = await clientQuery(
    client,
    `UPDATE counters SET next_value = next_value + 1 WHERE kind = $1 RETURNING next_value - 1 AS value`,
    [kind],
  );
  const value = toInt(counter[0]?.value) || 1;

  const settings = await clientQuery(
    client,
    `SELECT quote_prefix, invoice_prefix, job_card_prefix FROM settings WHERE id = 1`,
  );
  const prefixes: Record<DocumentKind, string> = {
    quote: String(settings[0]?.quote_prefix ?? "QUO-"),
    invoice: String(settings[0]?.invoice_prefix ?? "INV-"),
    job_card: String(settings[0]?.job_card_prefix ?? "JOB-"),
  };

  return `${prefixes[kind]}${String(value).padStart(4, "0")}`;
}

// -------------------------------------------------------------------- helpers

function csvResponse(summaries: DocumentSummary[], kind: DocumentKind | null): Response {
  const header = [
    "Number",
    "Type",
    "Issue date",
    "Due date",
    "Status",
    "Customer",
    "Registration",
    "Vehicle",
    "Total",
    "Paid",
    "Balance",
  ];

  const lines = [header.join(",")];
  for (const row of summaries) {
    lines.push(
      [
        row.number,
        row.kind.replace("_", " "),
        formatDate(row.issueDate),
        formatDate(row.dueDate),
        row.isOverdue ? "overdue" : row.status,
        row.customerName,
        row.vehicleReg,
        `${row.vehicleMake} ${row.vehicleModel}`.trim(),
        penceToDecimalString(row.totalPence),
        penceToDecimalString(row.amountPaidPence),
        penceToDecimalString(row.balancePence),
      ]
        .map(csvCell)
        .join(","),
    );
  }

  const filename = `shedquarters-${kind ?? "documents"}-${new Date().toISOString().slice(0, 10)}.csv`;
  // BOM so Excel opens the £ signs and accented names correctly.
  return new Response(`﻿${lines.join("\r\n")}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}

function csvCell(value: string): string {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function readJsonBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function parseKind(value: unknown): DocumentKind | null {
  const text = String(value ?? "");
  return (DOCUMENT_KINDS as string[]).includes(text) ? (text as DocumentKind) : null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export const config: Config = {
  path: ["/api/documents", "/api/documents/:id", "/api/documents/:id/convert"],
};
