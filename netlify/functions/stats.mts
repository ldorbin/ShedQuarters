import type { Config } from "@netlify/functions";
import { calcTotals } from "../../shared/totals";
import type { DashboardStats, DocumentSummary, LineItem } from "../../shared/types";
import { requireAuth } from "./_lib/auth";
import { query, queryOne, toInt } from "./_lib/db";
import { rowToDocument, rowToLineItem, DOCUMENT_COLUMNS } from "./_lib/documents";
import { json, serverError } from "./_lib/respond";

/**
 * Totals depend on discounts and per-line VAT, so they're computed with the
 * shared calcTotals rather than re-implemented in SQL. Invoices are pulled in
 * full and reduced in memory — capped so a runaway table can't blow the
 * function's memory limit.
 */
const INVOICE_CAP = 5000;

export default async (req: Request): Promise<Response> => {
  const unauthorised = requireAuth(req);
  if (unauthorised) return unauthorised;

  try {
    const [invoiceRows, itemRows, counts, recentRows] = await Promise.all([
      query(
        `SELECT ${DOCUMENT_COLUMNS} FROM documents
         WHERE kind = 'invoice' AND status NOT IN ('draft', 'cancelled')
         ORDER BY issue_date DESC LIMIT ${INVOICE_CAP}`,
      ),
      query(
        `SELECT li.document_id, li.id, li.type, li.description, li.part_number,
                li.quantity, li.unit, li.unit_price_pence, li.taxable
         FROM line_items li
         JOIN documents d ON d.id = li.document_id
         WHERE d.kind = 'invoice' AND d.status NOT IN ('draft', 'cancelled')
         ORDER BY li.document_id, li.sort_order`,
      ),
      queryOne(
        `SELECT
           COUNT(*) FILTER (WHERE kind = 'job_card' AND status = 'completed')            AS jobs_completed,
           COUNT(*) FILTER (WHERE kind = 'quote' AND status IN ('draft', 'sent'))        AS open_quotes,
           COUNT(*) FILTER (WHERE kind = 'job_card' AND status IN ('open', 'in_progress')) AS open_job_cards
         FROM documents`,
      ),
      query(
        `SELECT ${DOCUMENT_COLUMNS} FROM documents ORDER BY created_at DESC LIMIT 8`,
      ),
    ]);

    const itemsByDocument = new Map<string, LineItem[]>();
    for (const row of itemRows) {
      const key = String(row.document_id);
      const list = itemsByDocument.get(key) ?? [];
      list.push(rowToLineItem(row));
      itemsByDocument.set(key, list);
    }

    const today = new Date().toISOString().slice(0, 10);
    const thisMonth = today.slice(0, 7);
    const thisYear = today.slice(0, 4);

    let outstandingPence = 0;
    let overdueCount = 0;
    let overduePence = 0;
    let revenueThisMonthPence = 0;
    let revenueThisYearPence = 0;
    let invoicedTotalPence = 0;

    const monthly = new Map<string, number>();
    for (let back = 11; back >= 0; back -= 1) {
      monthly.set(monthKey(back), 0);
    }

    for (const row of invoiceRows) {
      const doc = rowToDocument(row, itemsByDocument.get(String(row.id)) ?? []);
      const totals = calcTotals(doc);

      invoicedTotalPence += totals.totalPence;

      const month = doc.issueDate.slice(0, 7);
      if (monthly.has(month)) {
        monthly.set(month, (monthly.get(month) ?? 0) + totals.totalPence);
      }
      if (month === thisMonth) revenueThisMonthPence += totals.totalPence;
      if (doc.issueDate.slice(0, 4) === thisYear) revenueThisYearPence += totals.totalPence;

      if (doc.status !== "paid" && totals.balancePence > 0) {
        outstandingPence += totals.balancePence;
        if (doc.dueDate && doc.dueDate < today) {
          overdueCount += 1;
          overduePence += totals.balancePence;
        }
      }
    }

    const invoiceCount = invoiceRows.length;

    const recentIds = recentRows.map((row) => String(row.id));
    const recentItems = await fetchItemsFor(recentIds);
    const recent: DocumentSummary[] = recentRows.map((row) => {
      const doc = rowToDocument(row, recentItems.get(String(row.id)) ?? []);
      const totals = calcTotals(doc);
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
        isOverdue:
          doc.kind === "invoice" &&
          !["paid", "cancelled", "draft"].includes(doc.status) &&
          Boolean(doc.dueDate) &&
          doc.dueDate! < today &&
          totals.balancePence > 0,
      };
    });

    const stats: DashboardStats = {
      outstandingPence,
      overdueCount,
      overduePence,
      revenueThisMonthPence,
      revenueThisYearPence,
      averageInvoicePence: invoiceCount ? Math.round(invoicedTotalPence / invoiceCount) : 0,
      invoiceCount,
      jobsCompleted: toInt(counts?.jobs_completed),
      openQuotes: toInt(counts?.open_quotes),
      openJobCards: toInt(counts?.open_job_cards),
      revenueByMonth: [...monthly.entries()].map(([month, totalPence]) => ({ month, totalPence })),
      recent,
    };

    return json({ stats });
  } catch (error) {
    return serverError(error);
  }
};

async function fetchItemsFor(ids: string[]): Promise<Map<string, LineItem[]>> {
  const grouped = new Map<string, LineItem[]>();
  if (ids.length === 0) return grouped;

  const rows = await query(
    `SELECT document_id, id, type, description, part_number, quantity, unit, unit_price_pence, taxable
     FROM line_items WHERE document_id = ANY($1::uuid[]) ORDER BY document_id, sort_order`,
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

/** YYYY-MM for `monthsBack` months before the current month. */
function monthKey(monthsBack: number): string {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsBack, 1));
  return date.toISOString().slice(0, 7);
}

export const config: Config = {
  path: "/api/stats",
};
