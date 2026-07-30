import assert from "node:assert/strict";
import { test } from "node:test";
import { addDaysIso, decimalStringToPence, formatMoney, formatReg } from "./format.ts";
import { calcTotals, lineTotalPence } from "./totals.ts";
import type { LineItem } from "./types.ts";

const line = (overrides: Partial<LineItem>): LineItem => ({
  id: "x",
  type: "labour",
  description: "",
  partNumber: "",
  quantity: 1,
  unit: "each",
  unitPricePence: 0,
  taxable: true,
  ...overrides,
});

/** 1.5 hours labour at £45/hr, two parts at £32.50, one at £8.99. */
const job = {
  lineItems: [
    line({ type: "labour", quantity: 1.5, unit: "hrs", unitPricePence: 4500 }),
    line({ type: "part", quantity: 2, unitPricePence: 3250 }),
    line({ type: "part", quantity: 1, unitPricePence: 899 }),
  ],
  discountType: "none" as const,
  discountValue: 0,
  vatEnabled: false,
  vatRate: 20,
  amountPaidPence: 0,
};

test("splits labour and parts and sums the subtotal", () => {
  const totals = calcTotals(job);
  assert.equal(totals.labourPence, 6750);
  assert.equal(totals.partsPence, 7399);
  assert.equal(totals.subtotalPence, 14149);
});

test("charges no VAT when the business is not registered", () => {
  const totals = calcTotals(job);
  assert.equal(totals.vatPence, 0);
  assert.equal(totals.totalPence, totals.subtotalPence);
});

test("applies a percentage discount, rounded to the penny", () => {
  const totals = calcTotals({ ...job, discountType: "percent", discountValue: 10 });
  assert.equal(totals.discountPence, 1415);
  assert.equal(totals.totalPence, 12734);
});

test("charges VAT on the discounted net, not the gross", () => {
  const totals = calcTotals({
    ...job,
    discountType: "percent",
    discountValue: 10,
    vatEnabled: true,
  });
  assert.equal(totals.vatPence, 2547);
  assert.equal(totals.totalPence, 15281);
});

test("excludes non-taxable lines from VAT", () => {
  const totals = calcTotals({
    ...job,
    lineItems: [line({ unitPricePence: 10000 }), line({ unitPricePence: 5000, taxable: false })],
    vatEnabled: true,
  });
  assert.equal(totals.vatPence, 2000);
  assert.equal(totals.totalPence, 17000);
});

test("never lets a discount push the total below zero", () => {
  const totals = calcTotals({ ...job, discountType: "fixed", discountValue: 999_999 });
  assert.equal(totals.discountPence, 14149);
  assert.equal(totals.totalPence, 0);
});

test("tracks the outstanding balance after a part payment", () => {
  const totals = calcTotals({ ...job, amountPaidPence: 10000 });
  assert.equal(totals.balancePence, 4149);
});

test("survives malformed line values without producing NaN", () => {
  const totals = calcTotals({
    ...job,
    lineItems: [line({ quantity: Number.NaN, unitPricePence: Number.NaN })],
  });
  assert.equal(totals.subtotalPence, 0);
  assert.equal(totals.totalPence, 0);
  assert.equal(lineTotalPence({ quantity: Number.NaN, unitPricePence: 100 }), 0);
});

test("formats and parses money for UK entry", () => {
  assert.equal(formatMoney(14149), "£141.49");
  assert.equal(decimalStringToPence("1,234.56"), 123456);
  assert.equal(decimalStringToPence("£45"), 4500);
  assert.equal(decimalStringToPence("not a number"), 0);
});

test("spaces current-style registrations only", () => {
  assert.equal(formatReg("ab12cde"), "AB12 CDE");
  assert.equal(formatReg("A123 BCD"), "A123BCD");
});

test("adds payment terms across a month boundary", () => {
  assert.equal(addDaysIso("2026-07-30", 14), "2026-08-13");
});
