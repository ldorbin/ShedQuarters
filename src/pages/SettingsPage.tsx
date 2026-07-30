import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useShell } from "../App";
import { SaveIcon } from "../components/Icons";
import { TopBar } from "../components/Layout";
import { MoneyInput } from "../components/MoneyInput";
import type { Settings } from "../../shared/types";
import { ApiError } from "../lib/api";
import { useSettings } from "../lib/settings";

const MAX_LOGO_BYTES = 500_000;

export function SettingsPage() {
  const shell = useShell();
  const { settings, loading, save } = useSettings();
  const [draft, setDraft] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = "Settings · ShedQuarters";
  }, []);

  useEffect(() => {
    if (settings && !draft) setDraft(settings);
  }, [settings, draft]);

  if (loading || !draft) {
    return (
      <>
        <TopBar title="Settings" onOpenMenu={shell?.openMenu} />
        <div className="page">
          <div className="loading-block">
            <span className="spinner" />
            Loading…
          </div>
        </div>
      </>
    );
  }

  const patch = (changes: Partial<Settings>) =>
    setDraft((current) => (current ? { ...current, ...changes } : current));

  const onSave = async () => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await save(draft);
      setNotice("Settings saved.");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Couldn't save settings.");
    } finally {
      setSaving(false);
    }
  };

  const onLogoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_LOGO_BYTES) {
      setError("That logo is too large — please use an image under 500 KB.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      patch({ logoDataUrl: String(reader.result ?? "") });
      setError("");
    };
    reader.onerror = () => setError("Couldn't read that file.");
    reader.readAsDataURL(file);
  };

  return (
    <>
      <TopBar title="Settings" onOpenMenu={shell?.openMenu}>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={() => void onSave()}
          disabled={saving}
        >
          <SaveIcon />
          {saving ? "Saving…" : "Save settings"}
        </button>
      </TopBar>

      <div className="page stack">
        {error && <div className="alert alert-error">{error}</div>}
        {notice && <div className="alert alert-success">{notice}</div>}

        <section className="card">
          <div className="card-head">
            <h2>Business details</h2>
          </div>
          <div className="card-body grid grid-2">
            <div className="field">
              <label htmlFor="business-name">Business name</label>
              <input
                id="business-name"
                type="text"
                value={draft.businessName}
                onChange={(event) => patch({ businessName: event.target.value })}
              />
            </div>

            <div className="field">
              <label htmlFor="phone">Phone</label>
              <input
                id="phone"
                type="tel"
                value={draft.phone}
                onChange={(event) => patch({ phone: event.target.value })}
              />
            </div>

            <div className="field">
              <label htmlFor="address1">Address line 1</label>
              <input
                id="address1"
                type="text"
                value={draft.addressLine1}
                onChange={(event) => patch({ addressLine1: event.target.value })}
              />
            </div>

            <div className="field">
              <label htmlFor="address2">Address line 2</label>
              <input
                id="address2"
                type="text"
                value={draft.addressLine2}
                onChange={(event) => patch({ addressLine2: event.target.value })}
              />
            </div>

            <div className="field">
              <label htmlFor="city">Town / city</label>
              <input
                id="city"
                type="text"
                value={draft.city}
                onChange={(event) => patch({ city: event.target.value })}
              />
            </div>

            <div className="field">
              <label htmlFor="postcode">Postcode</label>
              <input
                id="postcode"
                type="text"
                value={draft.postcode}
                onChange={(event) => patch({ postcode: event.target.value.toUpperCase() })}
              />
            </div>

            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={draft.email}
                onChange={(event) => patch({ email: event.target.value })}
              />
            </div>

            <div className="field">
              <label htmlFor="website">Website</label>
              <input
                id="website"
                type="text"
                value={draft.website}
                onChange={(event) => patch({ website: event.target.value })}
              />
            </div>

            <div className="field">
              <label htmlFor="company-number">Company number</label>
              <input
                id="company-number"
                type="text"
                value={draft.companyNumber}
                onChange={(event) => patch({ companyNumber: event.target.value })}
              />
              <span className="field-hint">Optional — printed in the letterhead.</span>
            </div>

            <div className="field">
              <span className="field-label">Logo</span>
              <input ref={fileRef} type="file" accept="image/*" onChange={onLogoChange} />
              <span className="field-hint">PNG or JPG under 500 KB. Appears on every document.</span>
              {draft.logoDataUrl && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                  <img className="logo-preview" src={draft.logoDataUrl} alt="Current logo" />
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={() => {
                      patch({ logoDataUrl: "" });
                      if (fileRef.current) fileRef.current.value = "";
                    }}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>VAT</h2>
          </div>
          <div className="card-body stack" style={{ gap: 14 }}>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={draft.vatEnabled}
                onChange={(event) => patch({ vatEnabled: event.target.checked })}
              />
              This business is VAT registered
            </label>
            <p className="field-hint" style={{ margin: 0 }}>
              This only sets the default for new documents. Each quote, invoice and job card keeps
              its own VAT setting, so documents you've already issued never change.
            </p>

            {draft.vatEnabled && (
              <div className="grid grid-2">
                <div className="field">
                  <label htmlFor="vat-rate-setting">Default VAT rate (%)</label>
                  <input
                    id="vat-rate-setting"
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

                <div className="field">
                  <label htmlFor="vat-number">VAT registration number</label>
                  <input
                    id="vat-number"
                    type="text"
                    value={draft.vatNumber}
                    onChange={(event) => patch({ vatNumber: event.target.value })}
                  />
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Payment details</h2>
          </div>
          <div className="card-body grid grid-2">
            <div className="field">
              <label htmlFor="bank-account-name">Account name</label>
              <input
                id="bank-account-name"
                type="text"
                value={draft.bankAccountName}
                onChange={(event) => patch({ bankAccountName: event.target.value })}
              />
            </div>

            <div className="field">
              <label htmlFor="bank-name">Bank</label>
              <input
                id="bank-name"
                type="text"
                value={draft.bankName}
                onChange={(event) => patch({ bankName: event.target.value })}
              />
            </div>

            <div className="field">
              <label htmlFor="sort-code">Sort code</label>
              <input
                id="sort-code"
                type="text"
                placeholder="00-00-00"
                value={draft.bankSortCode}
                onChange={(event) => patch({ bankSortCode: event.target.value })}
              />
            </div>

            <div className="field">
              <label htmlFor="account-number">Account number</label>
              <input
                id="account-number"
                type="text"
                value={draft.bankAccountNumber}
                onChange={(event) => patch({ bankAccountNumber: event.target.value })}
              />
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Documents</h2>
          </div>
          <div className="card-body stack" style={{ gap: 14 }}>
            <div className="grid grid-3">
              <div className="field">
                <label htmlFor="quote-prefix">Quote prefix</label>
                <input
                  id="quote-prefix"
                  type="text"
                  value={draft.quotePrefix}
                  onChange={(event) => patch({ quotePrefix: event.target.value })}
                />
              </div>

              <div className="field">
                <label htmlFor="invoice-prefix">Invoice prefix</label>
                <input
                  id="invoice-prefix"
                  type="text"
                  value={draft.invoicePrefix}
                  onChange={(event) => patch({ invoicePrefix: event.target.value })}
                />
              </div>

              <div className="field">
                <label htmlFor="job-prefix">Job card prefix</label>
                <input
                  id="job-prefix"
                  type="text"
                  value={draft.jobCardPrefix}
                  onChange={(event) => patch({ jobCardPrefix: event.target.value })}
                />
              </div>
            </div>
            <p className="field-hint" style={{ margin: 0 }}>
              Numbers are allocated automatically, e.g. {draft.invoicePrefix}0042. Changing a prefix
              only affects documents created from now on.
            </p>

            <div className="grid grid-2">
              <div className="field">
                <span className="field-label">Default labour rate (per hour)</span>
                <MoneyInput
                  ariaLabel="Default labour rate"
                  valuePence={draft.defaultLabourRatePence}
                  onChange={(pence) => patch({ defaultLabourRatePence: pence })}
                />
                <span className="field-hint">Pre-filled when you add a labour line.</span>
              </div>

              <div className="field">
                <label htmlFor="terms-days">Payment terms (days)</label>
                <input
                  id="terms-days"
                  type="number"
                  min="0"
                  max="365"
                  value={draft.defaultPaymentTermsDays}
                  onChange={(event) =>
                    patch({
                      defaultPaymentTermsDays: Number.parseInt(event.target.value, 10) || 0,
                    })
                  }
                />
                <span className="field-hint">Sets the due date on new invoices.</span>
              </div>
            </div>

            <div className="field">
              <label htmlFor="payment-terms">Terms printed on documents</label>
              <textarea
                id="payment-terms"
                rows={3}
                value={draft.paymentTerms}
                onChange={(event) => patch({ paymentTerms: event.target.value })}
              />
            </div>

            <div className="field">
              <label htmlFor="invoice-footer">Footer message</label>
              <textarea
                id="invoice-footer"
                rows={2}
                value={draft.invoiceFooter}
                onChange={(event) => patch({ invoiceFooter: event.target.value })}
              />
            </div>
          </div>
        </section>

        <div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void onSave()}
            disabled={saving}
          >
            <SaveIcon />
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>
      </div>
    </>
  );
}
