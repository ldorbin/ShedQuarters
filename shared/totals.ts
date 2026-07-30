import type { DiscountType, LineItem } from "./types";

export interface Totals {
  labourPence: number;
  partsPence: number;
  otherPence: number;
  subtotalPence: number;
  discountPence: number;
  netPence: number;
  vatPence: number;
  totalPence: number;
  paidPence: number;
  balancePence: number;
}

/** Inputs needed to price a document. Kept narrow so both the editor's
 *  in-progress draft and a saved database row can be passed in. */
export interface TotalsInput {
  lineItems: LineItem[];
  discountType: DiscountType;
  discountValue: number;
  vatEnabled: boolean;
  vatRate: number;
  amountPaidPence: number;
}

export function lineTotalPence(item: Pick<LineItem, "quantity" | "unitPricePence">): number {
  const qty = Number.isFinite(item.quantity) ? item.quantity : 0;
  const price = Number.isFinite(item.unitPricePence) ? item.unitPricePence : 0;
  return Math.round(qty * price);
}

/**
 * The single source of truth for document pricing. Used by the editor, the
 * print view and the API so the figure on screen always matches the figure
 * stored against the job.
 */
export function calcTotals(input: TotalsInput): Totals {
  let labourPence = 0;
  let partsPence = 0;
  let otherPence = 0;
  let taxableSubtotalPence = 0;

  for (const item of input.lineItems) {
    const total = lineTotalPence(item);
    if (item.type === "labour") labourPence += total;
    else if (item.type === "part") partsPence += total;
    else otherPence += total;
    if (item.taxable) taxableSubtotalPence += total;
  }

  const subtotalPence = labourPence + partsPence + otherPence;

  let discountPence = 0;
  if (input.discountType === "percent") {
    discountPence = Math.round((subtotalPence * clampPercent(input.discountValue)) / 100);
  } else if (input.discountType === "fixed") {
    discountPence = Math.max(0, Math.round(input.discountValue || 0));
  }
  discountPence = Math.min(discountPence, Math.max(0, subtotalPence));

  // Spread the discount across the taxable portion pro-rata so VAT is charged
  // on what the customer actually pays for taxable lines.
  const taxableDiscountPence =
    subtotalPence > 0 ? Math.round((discountPence * taxableSubtotalPence) / subtotalPence) : 0;
  const taxableNetPence = Math.max(0, taxableSubtotalPence - taxableDiscountPence);

  const netPence = subtotalPence - discountPence;
  const vatPence = input.vatEnabled
    ? Math.round((taxableNetPence * clampPercent(input.vatRate)) / 100)
    : 0;
  const totalPence = netPence + vatPence;
  const paidPence = Math.max(0, Math.round(input.amountPaidPence || 0));

  return {
    labourPence,
    partsPence,
    otherPence,
    subtotalPence,
    discountPence,
    netPence,
    vatPence,
    totalPence,
    paidPence,
    balancePence: totalPence - paidPence,
  };
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(value, 100);
}
