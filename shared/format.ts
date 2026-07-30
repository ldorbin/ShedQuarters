/** UK formatting helpers. Shared by the app and the API (CSV export). */

const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 123456 -> "£1,234.56" */
export function formatMoney(pence: number): string {
  return gbp.format((Number.isFinite(pence) ? pence : 0) / 100);
}

/** 123456 -> "1234.56" — for inputs and CSV, no symbol or separators. */
export function penceToDecimalString(pence: number): string {
  return ((Number.isFinite(pence) ? pence : 0) / 100).toFixed(2);
}

/** "1,234.56" | "£1234.56" | "1234" -> 123456. Returns 0 for unparseable input. */
export function decimalStringToPence(value: string): number {
  const cleaned = String(value ?? "").replace(/[^0-9.-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return 0;
  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100);
}

/** "2026-07-30" -> "30/07/2026". Empty input yields an empty string. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return String(iso);
  return `${match[3]}/${match[2]}/${match[1]}`;
}

/** "2026-07-30" -> "30 July 2026" */
export function formatDateLong(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return String(iso);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** Today in the YYYY-MM-DD form the date inputs and database expect. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Normalise a UK registration for display: uppercase, no punctuation, with the
 * conventional space in a current-style plate (AB12CDE -> AB12 CDE).
 */
export function formatReg(reg: string): string {
  const bare = String(reg ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (/^[A-Z]{2}\d{2}[A-Z]{3}$/.test(bare)) {
    return `${bare.slice(0, 4)} ${bare.slice(4)}`;
  }
  return bare;
}

export function formatMileage(miles: number | null | undefined): string {
  if (miles === null || miles === undefined || !Number.isFinite(miles)) return "";
  return new Intl.NumberFormat("en-GB").format(miles);
}
