import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useShell } from "../App";
import { AutocompleteInput, type Suggestion } from "../components/AutocompleteInput";
import {
  BackIcon,
  ConvertIcon,
  PrintIcon,
  SaveIcon,
  TrashIcon,
} from "../components/Icons";
import { TopBar } from "../components/Layout";
import { LineItemsTable, newLineItem } from "../components/LineItemsTable";
import { MoneyInput } from "../components/MoneyInput";
import {
  addDaysIso,
  formatDate,
  formatMoney,
  formatReg,
  todayIso,
} from "../../shared/format";
import { calcTotals } from "../../shared/totals";
import type { DocumentKind, GarageDocument, Settings } from "../../shared/types";
import {
  KIND_LABELS,
  KIND_SLUGS,
  SLUG_TO_KIND,
  STATUS_LABELS,
  STATUSES_BY_KIND,
} from "../../shared/types";
import {
  ApiError,
  documents as documentsApi,
  suggest as suggestApi,
  type CustomerSuggestion,
  type HistoryEntry,
  type VehicleSuggestion,
} from "../lib/api";
import { useSettings } from "../lib/settings";
import { NotFoundPage } from "./NotFoundPage";

function blankDocument(kind: DocumentKind, settings: Settings | null): GarageDocument {
  const issueDate = todayIso();
  return {
    id: "",
    kind,
    number: "",
    status: STATUSES_BY_KIND[kind][0],
    issueDate,
    dueDate:
      kind === "invoice"
        ? addDaysIso(issueDate, settings?.defaultPaymentTermsDays ?? 14)
        : kind === "quote"
          ? addDaysIso(issueDate, 30)
          : null,
    customerName: "",
    customerAddress: "",
    customerPhone: "",
    customerEmail: "",
    vehicleReg: "",
    vehicleMake: "",
    vehicleModel: "",
    vehicleColour: "",
    vehicleVin: "",
    vehicleYear: null,
    vehicleMileage: null,
    motDue: null,
    nextServiceDue: null,
    workPerformed: "",
    technician: "",
    notes: "",
    internalNotes: "",
    discountType: "none",
    discountValue: 0,
    vatEnabled: settings?.vatEnabled ?? false,
    vatRate: settings?.vatRate ?? 20,
    amountPaidPence: 0,
    paidDate: null,
    paymentMethod: "",
    convertedFromId: null,
    convertedFromNumber: null,
    lineItems: [],
    createdAt: "",
    updatedAt: "",
  };
}

export function DocumentEditorPage() {
  const { kindSlug = "", id } = useParams();
  const kind = SLUG_TO_KIND[kindSlug];
  const navigate = useNavigate();
  const shell = useShell();
  const { settings } = useSettings();

  const [draft, setDraft] = useState<GarageDocument | null>(null);
  const [baseline, setBaseline] = useState<string>("");
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const settingsApplied = useRef(false);

  // ------------------------------------------------------------------ load

  useEffect(() => {
    if (!kind) return;
    if (!id) {
      setDraft((current) => current ?? blankDocument(kind, settings));
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    documentsApi
      .get(id)
      .then((result) => {
        if (cancelled) return;
        setDraft(result);
        setBaseline(JSON.stringify(result));
      })
      .catch((caught: Error) => {
        if (!cancelled) setError(caught.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, kind, settings]);

  // Apply VAT defaults once settings arrive for a brand new document.
  useEffect(() => {
    if (id || !settings || settingsApplied.current) return;
    settingsApplied.current = true;
    setDraft((current) =>
      current
        ? { ...current, vatEnabled: settings.vatEnabled, vatRate: settings.vatRate }
        : current,
    );
  }, [settings, id]);

  useEffect(() => {
    if (draft && !baseline && !id) setBaseline(JSON.stringify(draft));
  }, [draft, baseline, id]);

  // Service history for whichever vehicle is on the document.
  useEffect(() => {
    const reg = draft?.vehicleReg?.trim();
    if (!reg || reg.length < 3) {
      setHistory([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      suggestApi
        .history(reg)
        .then((entries) => {
          if (!cancelled) setHistory(entries.filter((entry) => entry.id !== id));
        })
        .catch(() => {
          if (!cancelled) setHistory([]);
        });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [draft?.vehicleReg, id]);

  const dirty = useMemo(
    () => Boolean(draft) && JSON.stringify(draft) !== baseline,
    [draft, baseline],
  );

  // Warn before losing edits on a browser navigation or refresh.
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const patch = useCallback((changes: Partial<GarageDocument>) => {
    setDraft((current) => (current ? { ...current, ...changes } : current));
  }, []);

  const fetchCustomers = useCallback(
    async (query: string): Promise<Suggestion<CustomerSuggestion>[]> => {
      const results = await suggestApi.customers(query);
      return results.map((result) => ({
        key: result.customerName,
        title: result.customerName,
        subtitle: [result.customerPhone, result.customerAddress.split("\n")[0]]
          .filter(Boolean)
          .join(" · "),
        value: result,
      }));
    },
    [],
  );

  const fetchVehicles = useCallback(
    async (query: string): Promise<Suggestion<VehicleSuggestion>[]> => {
      const results = await suggestApi.vehicles(query);
      return results.map((result) => ({
        key: result.vehicleReg,
        title: formatReg(result.vehicleReg),
        subtitle: [
          [result.vehicleMake, result.vehicleModel].filter(Boolean).join(" "),
          result.customerName,
        ]
          .filter(Boolean)
          .join(" · "),
        value: result,
      }));
    },
    [],
  );

  // ------------------------------------------------------------------ save

  const save = useCallback(async (): Promise<GarageDocument | null> => {
    if (!draft || !kind || saving) return null;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const saved = draft.id
        ? await documentsApi.update(draft.id, draft)
        : await documentsApi.create({ ...draft, kind });
      setDraft(saved);
      setBaseline(JSON.stringify(saved));
      setNotice(`${saved.number} saved.`);
      if (!draft.id) {
        navigate(`/${kindSlug}/${saved.id}`, { replace: true });
      }
      return saved;
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Couldn't save. Try again.");
      return null;
    } finally {
      setSaving(false);
    }
  }, [draft, kind, saving, navigate, kindSlug]);

  const saveAndPrint = useCallback(async () => {
    const saved = await save();
    if (saved) navigate(`/${kindSlug}/${saved.id}/print`);
  }, [save, navigate, kindSlug]);

  const convert = useCallback(
    async (targetKind: DocumentKind) => {
      if (!draft?.id) return;
      if (dirty && !window.confirm("Save changes first? Unsaved edits won't be copied across.")) {
        return;
      }
      if (dirty) {
        const saved = await save();
        if (!saved) return;
      }
      setSaving(true);
      try {
        const created = await documentsApi.convert(draft.id, targetKind);
        navigate(`/${KIND_SLUGS[targetKind]}/${created.id}`);
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : "Couldn't convert.");
      } finally {
        setSaving(false);
      }
    },
    [draft, dirty, save, navigate],
  );

  const remove = useCallback(async () => {
    if (!draft?.id) return;
    if (!window.confirm(`Delete ${draft.number}? This can't be undone.`)) return;
    try {
      await documentsApi.remove(draft.id);
      navigate(`/${kindSlug}`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Couldn't delete.");
    }
  }, [draft, navigate, kindSlug]);

  // ---------------------------------------------------------------- render

  if (!kind) return <NotFoundPage />;

  if (loading || !draft) {
    return (
      <>
        <TopBar title="Loading…" onOpenMenu={shell?.openMenu} />
        <div className="page">
          {error ? (
            <div className="alert alert-error">{error}</div>
          ) : (
            <div className="loading-block">
              <span className="spinner" />
              Loading…
            </div>
          )}
        </div>
      </>
    );
  }

  const labels = KIND_LABELS[kind];
  const totals = calcTotals(draft);
  const isInvoice = kind === "invoice";
  const isQuote = kind === "quote";
  const isJobCard = kind === "job_card";
  const title = draft.id ? `${labels.singular} ${draft.number}` : `New ${labels.singular.toLowerCase()}`;

  return (
    <>
      <TopBar title={title} onOpenMenu={shell?.openMenu}>
        <Link className="btn btn-sm btn-ghost" to={`/${kindSlug}`}>
          <BackIcon />
          All {labels.plural.toLowerCase()}
        </Link>

        {draft.id && !isInvoice && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => void convert("invoice")}
            disabled={saving}
          >
            <ConvertIcon />
            Convert to invoice
          </button>
        )}
        {draft.id && isQuote && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => void convert("job_card")}
            disabled={saving}
          >
            <ConvertIcon />
            Start job card
          </button>
        )}

        <button
          type="button"
          className="btn btn-sm"
          onClick={() => void saveAndPrint()}
          disabled={saving}
        >
          <PrintIcon />
          Save &amp; print
        </button>

        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={() => void save()}
          disabled={saving || !dirty}
        >
          <SaveIcon />
          {saving ? "Saving…" : dirty ? "Save" : "Saved"}
        </button>
      </TopBar>

      <div className="page">
        {error && <div className="alert alert-error">{error}</div>}
        {notice && !dirty && <div className="alert alert-success">{notice}</div>}
        {draft.convertedFromNumber && (
          <div className="alert alert-info">Created from {draft.convertedFromNumber}.</div>
        )}

        <div className="editor-layout">
          <div className="stack">
            {/* ------------------------------------------------- customer */}
            <section className="card">
              <div className="card-head">
                <h2>Customer</h2>
              </div>
              <div className="card-body grid grid-2">
                <AutocompleteInput
                  label="Name"
                  value={draft.customerName}
                  onChange={(value) => patch({ customerName: value })}
                  onSelect={(value) =>
                    patch({
                      customerName: value.customerName,
                      customerAddress: value.customerAddress,
                      customerPhone: value.customerPhone,
                      customerEmail: value.customerEmail,
                    })
                  }
                  fetchSuggestions={fetchCustomers}
                  placeholder="e.g. Jane Whitfield"
                  hint="Past customers appear as you type."
                />

                <div className="field">
                  <label htmlFor="customer-phone">Phone</label>
                  <input
                    id="customer-phone"
                    type="tel"
                    value={draft.customerPhone}
                    onChange={(event) => patch({ customerPhone: event.target.value })}
                  />
                </div>

                <div className="field">
                  <label htmlFor="customer-email">Email</label>
                  <input
                    id="customer-email"
                    type="email"
                    value={draft.customerEmail}
                    onChange={(event) => patch({ customerEmail: event.target.value })}
                  />
                </div>

                <div className="field">
                  <label htmlFor="customer-address">Address</label>
                  <textarea
                    id="customer-address"
                    rows={3}
                    placeholder={"12 Mill Lane\nHarborough\nLE16 7QT"}
                    value={draft.customerAddress}
                    onChange={(event) => patch({ customerAddress: event.target.value })}
                  />
                </div>
              </div>
            </section>

            {/* -------------------------------------------------- vehicle */}
            <section className="card">
              <div className="card-head">
                <h2>Vehicle</h2>
              </div>
              <div className="card-body grid grid-3">
                <AutocompleteInput
                  label="Registration"
                  value={draft.vehicleReg}
                  onChange={(value) => patch({ vehicleReg: value })}
                  transform={(raw) => raw.toUpperCase().replace(/[^A-Z0-9 ]/g, "")}
                  onSelect={(value) =>
                    patch({
                      vehicleReg: value.vehicleReg,
                      vehicleMake: value.vehicleMake,
                      vehicleModel: value.vehicleModel,
                      vehicleColour: value.vehicleColour,
                      vehicleVin: value.vehicleVin,
                      vehicleYear: value.vehicleYear,
                      motDue: value.motDue,
                      // Only fill the customer if this document doesn't have one.
                      ...(draft.customerName
                        ? {}
                        : {
                            customerName: value.customerName,
                            customerAddress: value.customerAddress,
                            customerPhone: value.customerPhone,
                            customerEmail: value.customerEmail,
                          }),
                    })
                  }
                  fetchSuggestions={fetchVehicles}
                  placeholder="AB12 CDE"
                />

                <div className="field">
                  <label htmlFor="vehicle-make">Make</label>
                  <input
                    id="vehicle-make"
                    type="text"
                    placeholder="Ford"
                    value={draft.vehicleMake}
                    onChange={(event) => patch({ vehicleMake: event.target.value })}
                  />
                </div>

                <div className="field">
                  <label htmlFor="vehicle-model">Model</label>
                  <input
                    id="vehicle-model"
                    type="text"
                    placeholder="Focus 1.0 EcoBoost"
                    value={draft.vehicleModel}
                    onChange={(event) => patch({ vehicleModel: event.target.value })}
                  />
                </div>

                <div className="field">
                  <label htmlFor="vehicle-year">Year</label>
                  <input
                    id="vehicle-year"
                    type="number"
                    min="1885"
                    max="2200"
                    value={draft.vehicleYear ?? ""}
                    onChange={(event) =>
                      patch({
                        vehicleYear: event.target.value
                          ? Number.parseInt(event.target.value, 10)
                          : null,
                      })
                    }
                  />
                </div>

                <div className="field">
                  <label htmlFor="vehicle-colour">Colour</label>
                  <input
                    id="vehicle-colour"
                    type="text"
                    value={draft.vehicleColour}
                    onChange={(event) => patch({ vehicleColour: event.target.value })}
                  />
                </div>

                <div className="field">
                  <label htmlFor="vehicle-mileage">Mileage</label>
                  <input
                    id="vehicle-mileage"
                    type="number"
                    min="0"
                    placeholder="76500"
                    value={draft.vehicleMileage ?? ""}
                    onChange={(event) =>
                      patch({
                        vehicleMileage: event.target.value
                          ? Number.parseInt(event.target.value, 10)
                          : null,
                      })
                    }
                  />
                </div>

                <div className="field">
                  <label htmlFor="vehicle-vin">VIN</label>
                  <input
                    id="vehicle-vin"
                    type="text"
                    value={draft.vehicleVin}
                    onChange={(event) => patch({ vehicleVin: event.target.value.toUpperCase() })}
                  />
                </div>

                <div className="field">
                  <label htmlFor="mot-due">MOT due</label>
                  <input
                    id="mot-due"
                    type="date"
                    value={draft.motDue ?? ""}
                    onChange={(event) => patch({ motDue: event.target.value || null })}
                  />
                </div>

                <div className="field">
                  <label htmlFor="service-due">Next service due</label>
                  <input
                    id="service-due"
                    type="date"
                    value={draft.nextServiceDue ?? ""}
                    onChange={(event) => patch({ nextServiceDue: event.target.value || null })}
                  />
                </div>
              </div>
            </section>

            {/* ---------------------------------------------- work record */}
            <section className="card">
              <div className="card-head">
                <h2>{isJobCard ? "Work carried out" : "Work description"}</h2>
              </div>
              <div className="card-body stack">
                <div className="field">
                  <label htmlFor="work-performed">
                    {isQuote ? "Work proposed" : "Work performed"}
                  </label>
                  <textarea
                    id="work-performed"
                    rows={5}
                    placeholder={
                      isQuote
                        ? "Describe the work being quoted for…"
                        : "Describe what was done to the vehicle — this is the customer's proof of work."
                    }
                    value={draft.workPerformed}
                    onChange={(event) => patch({ workPerformed: event.target.value })}
                  />
                  <span className="field-hint">Printed on the document for the customer.</span>
                </div>

                <div className="grid grid-2">
                  <div className="field">
                    <label htmlFor="technician">Technician</label>
                    <input
                      id="technician"
                      type="text"
                      value={draft.technician}
                      onChange={(event) => patch({ technician: event.target.value })}
                    />
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="notes">Notes for the customer</label>
                  <textarea
                    id="notes"
                    rows={3}
                    placeholder="Advisories, recommendations, parts on order…"
                    value={draft.notes}
                    onChange={(event) => patch({ notes: event.target.value })}
                  />
                </div>

                <div className="field">
                  <label htmlFor="internal-notes">Internal notes</label>
                  <textarea
                    id="internal-notes"
                    rows={2}
                    placeholder="Never printed — for the workshop only."
                    value={draft.internalNotes}
                    onChange={(event) => patch({ internalNotes: event.target.value })}
                  />
                  <span className="field-hint">Not shown on the printed document.</span>
                </div>
              </div>
            </section>

            {/* ----------------------------------------------- line items */}
            <section className="card">
              <div className="card-head">
                <h2>Labour &amp; parts</h2>
              </div>
              <div className="card-body">
                <LineItemsTable
                  items={draft.lineItems}
                  onChange={(lineItems) => patch({ lineItems })}
                  showTaxable={draft.vatEnabled}
                  defaultLabourRatePence={settings?.defaultLabourRatePence ?? 4500}
                />

                <hr
                  style={{
                    border: "none",
                    borderTop: "1px solid var(--border)",
                    margin: "20px 0 16px",
                  }}
                />

                <div className="grid grid-2" style={{ alignItems: "start" }}>
                  <div className="stack" style={{ gap: 12 }}>
                    <div className="grid grid-2">
                      <div className="field">
                        <label htmlFor="discount-type">Discount</label>
                        <select
                          id="discount-type"
                          value={draft.discountType}
                          onChange={(event) =>
                            patch({
                              discountType: event.target
                                .value as GarageDocument["discountType"],
                              discountValue: 0,
                            })
                          }
                        >
                          <option value="none">None</option>
                          <option value="percent">Percentage</option>
                          <option value="fixed">Fixed amount</option>
                        </select>
                      </div>

                      {draft.discountType === "percent" && (
                        <div className="field">
                          <label htmlFor="discount-percent">Percent</label>
                          <input
                            id="discount-percent"
                            type="number"
                            min="0"
                            max="100"
                            step="0.5"
                            value={draft.discountValue}
                            onChange={(event) =>
                              patch({ discountValue: Number.parseFloat(event.target.value) || 0 })
                            }
                          />
                        </div>
                      )}

                      {draft.discountType === "fixed" && (
                        <div className="field">
                          <span className="field-label">Amount</span>
                          <MoneyInput
                            ariaLabel="Discount amount"
                            valuePence={draft.discountValue}
                            onChange={(pence) => patch({ discountValue: pence })}
                          />
                        </div>
                      )}
                    </div>

                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={draft.vatEnabled}
                        onChange={(event) => patch({ vatEnabled: event.target.checked })}
                      />
                      Charge VAT on this {labels.singular.toLowerCase()}
                    </label>

                    {draft.vatEnabled && (
                      <div className="field" style={{ maxWidth: 140 }}>
                        <label htmlFor="vat-rate">VAT rate (%)</label>
                        <input
                          id="vat-rate"
                          type="number"
                          min="0"
                          max="100"
                          step="0.5"
                          value={draft.vatRate}
                          onChange={(event) =>
                            patch({ vatRate: Number.parseFloat(event.target.value) || 0 })
                          }
                        />
                      </div>
                    )}
                  </div>

                  <div className="totals-panel">
                    <div className="totals-row">
                      <span className="muted">Subtotal</span>
                      <span>{formatMoney(totals.subtotalPence)}</span>
                    </div>
                    {totals.discountPence > 0 && (
                      <div className="totals-row">
                        <span className="muted">Discount</span>
                        <span>−{formatMoney(totals.discountPence)}</span>
                      </div>
                    )}
                    {draft.vatEnabled && (
                      <div className="totals-row">
                        <span className="muted">VAT at {draft.vatRate}%</span>
                        <span>{formatMoney(totals.vatPence)}</span>
                      </div>
                    )}
                    <div className="totals-row grand">
                      <span>Total</span>
                      <span>{formatMoney(totals.totalPence)}</span>
                    </div>
                    {isInvoice && totals.paidPence > 0 && (
                      <>
                        <div className="totals-row">
                          <span className="muted">Paid</span>
                          <span>−{formatMoney(totals.paidPence)}</span>
                        </div>
                        <div
                          className={`totals-row ${
                            totals.balancePence > 0 ? "balance" : "settled"
                          }`}
                        >
                          <span>{totals.balancePence > 0 ? "Balance due" : "Settled"}</span>
                          <span>{formatMoney(Math.max(0, totals.balancePence))}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* ------------------------------------------------------ sidebar */}
          <div className="side-stack">
            <section className="card">
              <div className="card-head">
                <h2>Details</h2>
              </div>
              <div className="card-body stack" style={{ gap: 12 }}>
                <div className="field">
                  <label htmlFor="status">Status</label>
                  <select
                    id="status"
                    value={draft.status}
                    onChange={(event) => patch({ status: event.target.value })}
                  >
                    {STATUSES_BY_KIND[kind].map((option) => (
                      <option key={option} value={option}>
                        {STATUS_LABELS[option] ?? option}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="issue-date">
                    {isJobCard ? "Job date" : "Date of issue"}
                  </label>
                  <input
                    id="issue-date"
                    type="date"
                    value={draft.issueDate}
                    onChange={(event) => patch({ issueDate: event.target.value })}
                  />
                </div>

                {!isJobCard && (
                  <div className="field">
                    <label htmlFor="due-date">{isInvoice ? "Payment due" : "Valid until"}</label>
                    <input
                      id="due-date"
                      type="date"
                      value={draft.dueDate ?? ""}
                      onChange={(event) => patch({ dueDate: event.target.value || null })}
                    />
                  </div>
                )}
              </div>
            </section>

            {isInvoice && (
              <section className="card">
                <div className="card-head">
                  <h2>Payment</h2>
                </div>
                <div className="card-body stack" style={{ gap: 12 }}>
                  <div className="field">
                    <span className="field-label">Amount received</span>
                    <MoneyInput
                      ariaLabel="Amount received"
                      valuePence={draft.amountPaidPence}
                      onChange={(pence) => patch({ amountPaidPence: pence })}
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="payment-method">Method</label>
                    <select
                      id="payment-method"
                      value={draft.paymentMethod}
                      onChange={(event) => patch({ paymentMethod: event.target.value })}
                    >
                      <option value="">Not recorded</option>
                      <option value="Card">Card</option>
                      <option value="Cash">Cash</option>
                      <option value="Bank transfer">Bank transfer</option>
                      <option value="Cheque">Cheque</option>
                    </select>
                  </div>

                  <div className="field">
                    <label htmlFor="paid-date">Date paid</label>
                    <input
                      id="paid-date"
                      type="date"
                      value={draft.paidDate ?? ""}
                      onChange={(event) => patch({ paidDate: event.target.value || null })}
                    />
                  </div>

                  {totals.balancePence > 0 && totals.totalPence > 0 && (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() =>
                        patch({
                          amountPaidPence: totals.totalPence,
                          paidDate: draft.paidDate ?? todayIso(),
                          status: "paid",
                        })
                      }
                    >
                      Mark paid in full
                    </button>
                  )}
                </div>
              </section>
            )}

            {history.length > 0 && (
              <section className="card">
                <div className="card-head">
                  <h2>Vehicle history</h2>
                </div>
                <div className="card-body">
                  <ul className="history-list">
                    {history.slice(0, 8).map((entry) => (
                      <li key={entry.id}>
                        <Link
                          to={`/${KIND_SLUGS[entry.kind as DocumentKind] ?? "invoices"}/${entry.id}`}
                          className="doc-number"
                        >
                          {entry.number}
                        </Link>
                        <span className="faint">{formatDate(entry.issueDate)}</span>
                        {entry.mileage !== null && (
                          <span className="faint" style={{ marginLeft: "auto" }}>
                            {entry.mileage.toLocaleString("en-GB")} mi
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            )}

            {draft.id && (
              <section className="card">
                <div className="card-body">
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    style={{ width: "100%" }}
                    onClick={() => void remove()}
                  >
                    <TrashIcon />
                    Delete {labels.singular.toLowerCase()}
                  </button>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export { newLineItem };
