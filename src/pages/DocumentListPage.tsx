import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useShell } from "../App";
import { TopBar } from "../components/Layout";
import { DownloadIcon, PlusIcon } from "../components/Icons";
import { RegPlate } from "../components/RegPlate";
import { StatusBadge } from "../components/StatusBadge";
import { formatDate, formatMoney } from "../../shared/format";
import type { DocumentSummary } from "../../shared/types";
import { KIND_LABELS, SLUG_TO_KIND, STATUS_LABELS, STATUSES_BY_KIND } from "../../shared/types";
import { documents as documentsApi } from "../lib/api";
import { NotFoundPage } from "./NotFoundPage";

export function DocumentListPage() {
  const { kindSlug = "" } = useParams();
  const kind = SLUG_TO_KIND[kindSlug];
  const shell = useShell();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const status = searchParams.get("status") ?? "all";
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [rows, setRows] = useState<DocumentSummary[] | null>(null);
  const [error, setError] = useState("");

  // Debounced so typing a registration doesn't fire a request per keystroke.
  const query = useDebounced(search, 250);

  const load = useCallback(() => {
    if (!kind) return;
    setError("");
    documentsApi
      .list({ kind, status, q: query })
      .then(setRows)
      .catch((caught: Error) => setError(caught.message));
  }, [kind, status, query]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (kind) document.title = `${KIND_LABELS[kind].plural} · ShedQuarters`;
  }, [kind]);

  const statusOptions = useMemo(() => {
    if (!kind) return [];
    const options = STATUSES_BY_KIND[kind];
    return kind === "invoice" ? [...options, "overdue"] : options;
  }, [kind]);

  if (!kind) return <NotFoundPage />;

  const labels = KIND_LABELS[kind];
  const isInvoice = kind === "invoice";

  const setStatus = (next: string) => {
    const params = new URLSearchParams(searchParams);
    if (next === "all") params.delete("status");
    else params.set("status", next);
    setSearchParams(params, { replace: true });
  };

  return (
    <>
      <TopBar title={labels.plural} onOpenMenu={shell?.openMenu}>
        <a
          className="btn btn-sm"
          href={documentsApi.csvUrl({ kind, status, q: query })}
          download
        >
          <DownloadIcon />
          Export CSV
        </a>
        <Link className="btn btn-sm btn-primary" to={`/${kindSlug}/new`}>
          <PlusIcon />
          New {labels.singular.toLowerCase()}
        </Link>
      </TopBar>

      <div className="page">
        {error && <div className="alert alert-error">{error}</div>}

        <div className="toolbar">
          <input
            className="search"
            type="search"
            placeholder="Search by customer, registration or number…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All statuses</option>
            {statusOptions.map((option) => (
              <option key={option} value={option}>
                {STATUS_LABELS[option] ?? option}
              </option>
            ))}
          </select>
        </div>

        <div className="card">
          {rows === null ? (
            <div className="loading-block">
              <span className="spinner" />
              Loading…
            </div>
          ) : rows.length === 0 ? (
            <div className="empty-state">
              <h3>No {labels.plural.toLowerCase()} yet</h3>
              <p>
                {search || status !== "all"
                  ? "Nothing matches those filters."
                  : `Create your first ${labels.singular.toLowerCase()} to get started.`}
              </p>
              <Link className="btn btn-primary" to={`/${kindSlug}/new`}>
                <PlusIcon />
                New {labels.singular.toLowerCase()}
              </Link>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Number</th>
                    <th>Date</th>
                    <th>Customer</th>
                    <th>Vehicle</th>
                    <th>Status</th>
                    <th className="num">Total</th>
                    {isInvoice && <th className="num">Balance</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className="clickable"
                      onClick={() => navigate(`/${kindSlug}/${row.id}`)}
                    >
                      <td className="doc-number">{row.number}</td>
                      <td className="muted">{formatDate(row.issueDate)}</td>
                      <td>{row.customerName || <span className="faint">—</span>}</td>
                      <td>
                        <RegPlate reg={row.vehicleReg} />
                        <div className="faint">
                          {[row.vehicleMake, row.vehicleModel].filter(Boolean).join(" ")}
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={row.status} overdue={row.isOverdue} />
                      </td>
                      <td className="num">{formatMoney(row.totalPence)}</td>
                      {isInvoice && (
                        <td className="num">
                          {row.balancePence > 0 ? (
                            <strong>{formatMoney(row.balancePence)}</strong>
                          ) : (
                            <span className="faint">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
