import { forwardRef } from "react";
import {
  formatDateLong,
  formatMileage,
  formatMoney,
  formatReg,
} from "../../shared/format";
import { calcTotals, lineTotalPence } from "../../shared/totals";
import type { GarageDocument, Settings } from "../../shared/types";

const TITLES: Record<string, string> = {
  quote: "Quotation",
  invoice: "Invoice",
  job_card: "Job Card",
};

const LINE_KIND: Record<string, string> = {
  labour: "Labour",
  part: "Part",
  other: "Other",
};

/**
 * The A4 sheet. Rendered on the print page and captured verbatim for the PDF
 * download, so what the customer receives is exactly what's previewed.
 */
export const DocumentSheet = forwardRef<
  HTMLDivElement,
  { document: GarageDocument; settings: Settings }
>(function DocumentSheet({ document: doc, settings }, ref) {
  const totals = calcTotals(doc);
  const isInvoice = doc.kind === "invoice";
  const isJobCard = doc.kind === "job_card";

  const businessLines = [
    [settings.addressLine1, settings.addressLine2].filter(Boolean).join("\n"),
    [settings.city, settings.postcode].filter(Boolean).join(", "),
    settings.phone && `Tel: ${settings.phone}`,
    settings.email,
    settings.website,
    settings.vatEnabled && settings.vatNumber && `VAT No: ${settings.vatNumber}`,
    settings.companyNumber && `Company No: ${settings.companyNumber}`,
  ]
    .filter(Boolean)
    .join("\n");

  const vehicleName = [doc.vehicleMake, doc.vehicleModel].filter(Boolean).join(" ");

  const vehicleFacts: [string, string][] = [
    ["Year", doc.vehicleYear ? String(doc.vehicleYear) : ""],
    ["Colour", doc.vehicleColour],
    ["Mileage", doc.vehicleMileage ? `${formatMileage(doc.vehicleMileage)} mi` : ""],
    ["VIN", doc.vehicleVin],
    ["MOT due", doc.motDue ? formatDateLong(doc.motDue) : ""],
    ["Service due", doc.nextServiceDue ? formatDateLong(doc.nextServiceDue) : ""],
  ];
  const shownFacts = vehicleFacts.filter(([, value]) => value);

  const hasBankDetails =
    settings.bankAccountName || settings.bankSortCode || settings.bankAccountNumber;

  return (
    <div className="sheet" ref={ref}>
      <header className="sheet-header">
        <div>
          {settings.logoDataUrl && (
            <img className="sheet-logo" src={settings.logoDataUrl} alt="" />
          )}
          <p className="sheet-business-name">{settings.businessName}</p>
          {businessLines && <div className="sheet-business-meta">{businessLines}</div>}
        </div>

        <div className="sheet-doc-meta">
          <p className="sheet-doc-title">{TITLES[doc.kind] ?? doc.kind}</p>
          <div className="sheet-doc-fields">
            <div>
              <span>Number</span>
              <strong>{doc.number}</strong>
            </div>
            <div>
              <span>Date</span>
              <strong>{formatDateLong(doc.issueDate)}</strong>
            </div>
            {doc.dueDate && (
              <div>
                <span>{isInvoice ? "Payment due" : "Valid until"}</span>
                <strong>{formatDateLong(doc.dueDate)}</strong>
              </div>
            )}
            {doc.technician && (
              <div>
                <span>Technician</span>
                <strong>{doc.technician}</strong>
              </div>
            )}
            {doc.convertedFromNumber && (
              <div>
                <span>From</span>
                <strong>{doc.convertedFromNumber}</strong>
              </div>
            )}
          </div>
        </div>
      </header>

      <section className="sheet-parties">
        <div>
          <p className="sheet-panel-title">{isInvoice ? "Invoice to" : "Customer"}</p>
          <p className="sheet-customer-name">{doc.customerName || "—"}</p>
          {doc.customerAddress && <div className="sheet-address">{doc.customerAddress}</div>}
          {(doc.customerPhone || doc.customerEmail) && (
            <div className="sheet-address">
              {[doc.customerPhone, doc.customerEmail].filter(Boolean).join("\n")}
            </div>
          )}
        </div>

        <div>
          <p className="sheet-panel-title">Vehicle</p>
          <div className="sheet-vehicle">
            <div className="sheet-vehicle-top">
              {doc.vehicleReg && <span className="sheet-reg">{formatReg(doc.vehicleReg)}</span>}
              {vehicleName && <span className="sheet-vehicle-name">{vehicleName}</span>}
            </div>
            {shownFacts.length > 0 && (
              <div className="sheet-vehicle-grid">
                {shownFacts.map(([label, value]) => (
                  <div key={label}>
                    <span>{label}: </span>
                    {value}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {doc.workPerformed && (
        <section className="sheet-section">
          <h3>{isJobCard ? "Work carried out" : "Work performed"}</h3>
          <div className="sheet-prose">{doc.workPerformed}</div>
        </section>
      )}

      {doc.lineItems.length > 0 && (
        <section className="sheet-section">
          <h3>{doc.kind === "quote" ? "Estimated charges" : "Charges"}</h3>
          <table className="sheet-lines">
            <thead>
              <tr>
                <th>Description</th>
                <th className="num">Qty</th>
                <th className="num">Unit price</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {doc.lineItems.map((item) => (
                <tr key={item.id}>
                  <td>
                    <span className="line-kind">{LINE_KIND[item.type] ?? item.type}</span>
                    {item.description || "—"}
                    {item.partNumber && (
                      <span className="line-part-number">Part no. {item.partNumber}</span>
                    )}
                  </td>
                  <td className="num">
                    {formatQuantity(item.quantity)} {item.unit}
                  </td>
                  <td className="num">{formatMoney(item.unitPricePence)}</td>
                  <td className="num">{formatMoney(lineTotalPence(item))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="sheet-foot">
        <div className="sheet-payment">
          {isInvoice && hasBankDetails && (
            <>
              <p className="sheet-panel-title">Payment details</p>
              <div className="pay-grid">
                {settings.bankAccountName && (
                  <>
                    <span>Account name</span>
                    <span>{settings.bankAccountName}</span>
                  </>
                )}
                {settings.bankName && (
                  <>
                    <span>Bank</span>
                    <span>{settings.bankName}</span>
                  </>
                )}
                {settings.bankSortCode && (
                  <>
                    <span>Sort code</span>
                    <span>{settings.bankSortCode}</span>
                  </>
                )}
                {settings.bankAccountNumber && (
                  <>
                    <span>Account no.</span>
                    <span>{settings.bankAccountNumber}</span>
                  </>
                )}
                <>
                  <span>Reference</span>
                  <span>{doc.number}</span>
                </>
              </div>
            </>
          )}

          {doc.notes && (
            <div style={{ marginTop: hasBankDetails && isInvoice ? 10 : 0 }}>
              <p className="sheet-panel-title">Notes</p>
              <div className="sheet-prose">{doc.notes}</div>
            </div>
          )}
        </div>

        <div className="sheet-totals">
          <div className="row">
            <span>Subtotal</span>
            <span>{formatMoney(totals.subtotalPence)}</span>
          </div>

          {totals.labourPence > 0 && totals.partsPence > 0 && (
            <>
              <div className="row">
                <span style={{ color: "#79838f" }}>&nbsp;&nbsp;Labour</span>
                <span style={{ color: "#79838f" }}>{formatMoney(totals.labourPence)}</span>
              </div>
              <div className="row">
                <span style={{ color: "#79838f" }}>&nbsp;&nbsp;Parts</span>
                <span style={{ color: "#79838f" }}>{formatMoney(totals.partsPence)}</span>
              </div>
            </>
          )}

          {totals.discountPence > 0 && (
            <div className="row">
              <span>
                Discount
                {doc.discountType === "percent" ? ` (${doc.discountValue}%)` : ""}
              </span>
              <span>−{formatMoney(totals.discountPence)}</span>
            </div>
          )}

          {doc.vatEnabled && (
            <div className="row">
              <span>VAT at {doc.vatRate}%</span>
              <span>{formatMoney(totals.vatPence)}</span>
            </div>
          )}

          <div className="row grand">
            <span>{doc.kind === "quote" ? "Estimate total" : "Total"}</span>
            <span>{formatMoney(totals.totalPence)}</span>
          </div>

          {isInvoice && totals.paidPence > 0 && (
            <div className="row">
              <span>Paid{doc.paidDate ? ` ${formatDateLong(doc.paidDate)}` : ""}</span>
              <span>−{formatMoney(totals.paidPence)}</span>
            </div>
          )}

          {isInvoice &&
            (totals.balancePence > 0 ? (
              <div className="row balance">
                <span>Balance due</span>
                <span>{formatMoney(totals.balancePence)}</span>
              </div>
            ) : (
              totals.totalPence > 0 && (
                <div className="row settled">
                  <span>Paid in full</span>
                  <span>{formatMoney(0)} due</span>
                </div>
              )
            ))}
        </div>
      </section>

      {!settings.vatEnabled && !doc.vatEnabled && totals.totalPence > 0 && (
        <p className="sheet-terms">Not VAT registered — no VAT has been charged.</p>
      )}

      {(isInvoice || doc.kind === "quote") && settings.paymentTerms && (
        <div className="sheet-terms">{settings.paymentTerms}</div>
      )}

      {isJobCard && (
        <div className="sheet-signoff">
          <div>
            <div className="sign-line" />
            Technician signature
          </div>
          <div>
            <div className="sign-line" />
            Customer signature &amp; date
          </div>
        </div>
      )}

      {settings.invoiceFooter && (
        <p className="sheet-footer-note">{settings.invoiceFooter}</p>
      )}
    </div>
  );
});

/** 1 -> "1", 1.5 -> "1.5" — no trailing ".00" cluttering the sheet. */
function formatQuantity(quantity: number): string {
  if (!Number.isFinite(quantity)) return "0";
  return Number.isInteger(quantity) ? String(quantity) : String(Number(quantity.toFixed(2)));
}
