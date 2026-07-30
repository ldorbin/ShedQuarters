import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useShell } from "../App";
import { DownloadIcon, PlusIcon } from "../components/Icons";
import { TopBar } from "../components/Layout";
import { RegPlate } from "../components/RegPlate";
import { RevenueChart } from "../components/RevenueChart";
import { StatusBadge } from "../components/StatusBadge";
import { formatDate, formatMoney } from "../../shared/format";
import type { DashboardStats, DocumentKind } from "../../shared/types";
import { KIND_LABELS, KIND_SLUGS } from "../../shared/types";
import { documents as documentsApi, stats as statsApi } from "../lib/api";

export function DashboardPage() {
  const shell = useShell();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "Dashboard · ShedQuarters";
    let cancelled = false;
    statsApi
      .get()
      .then((result) => {
        if (!cancelled) setStats(result);
      })
      .catch((caught: Error) => {
        if (!cancelled) setError(caught.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <TopBar title="Dashboard" onOpenMenu={shell?.openMenu}>
        <a className="btn btn-sm" href={documentsApi.csvUrl({ kind: "invoice" })} download>
          <DownloadIcon />
          Export invoices
        </a>
        <Link className="btn btn-sm btn-primary" to="/invoices/new">
          <PlusIcon />
          New invoice
        </Link>
      </TopBar>

      <div className="page stack">
        {error && <div className="alert alert-error">{error}</div>}

        {!stats && !error ? (
          <div className="loading-block">
            <span className="spinner" />
            Loading…
          </div>
        ) : stats ? (
          <>
            <div className="stat-grid">
              <div className="stat">
                <span className="stat-label">Outstanding</span>
                <span className="stat-value">{formatMoney(stats.outstandingPence)}</span>
                <span className="stat-note">Owed across unpaid invoices</span>
              </div>

              <div className="stat">
                <span className="stat-label">Overdue</span>
                <span className={`stat-value${stats.overdueCount > 0 ? " is-danger" : ""}`}>
                  {formatMoney(stats.overduePence)}
                </span>
                <span className="stat-note">
                  {stats.overdueCount === 0
                    ? "Nothing past its due date"
                    : `${stats.overdueCount} invoice${stats.overdueCount === 1 ? "" : "s"} past due`}
                </span>
              </div>

              <div className="stat">
                <span className="stat-label">Invoiced this month</span>
                <span className="stat-value">{formatMoney(stats.revenueThisMonthPence)}</span>
                <span className="stat-note">
                  {formatMoney(stats.revenueThisYearPence)} so far this year
                </span>
              </div>

              <div className="stat">
                <span className="stat-label">Average invoice</span>
                <span className="stat-value">{formatMoney(stats.averageInvoicePence)}</span>
                <span className="stat-note">
                  Across {stats.invoiceCount} invoice{stats.invoiceCount === 1 ? "" : "s"}
                </span>
              </div>
            </div>

            <div className="stat-grid">
              <Link to="/quotes?status=sent" className="stat">
                <span className="stat-label">Open quotes</span>
                <span className="stat-value">{stats.openQuotes}</span>
                <span className="stat-note">Awaiting a decision</span>
              </Link>

              <Link to="/job-cards?status=in_progress" className="stat">
                <span className="stat-label">Jobs in the workshop</span>
                <span className="stat-value">{stats.openJobCards}</span>
                <span className="stat-note">Open or in progress</span>
              </Link>

              <div className="stat">
                <span className="stat-label">Jobs completed</span>
                <span className="stat-value is-success">{stats.jobsCompleted}</span>
                <span className="stat-note">All time</span>
              </div>
            </div>

            <section className="card">
              <div className="card-head">
                <h2>Invoiced value — last 12 months</h2>
              </div>
              <div className="card-body">
                <RevenueChart data={stats.revenueByMonth} />
              </div>
            </section>

            <section className="card">
              <div className="card-head">
                <h2>Recent activity</h2>
                <div className="card-head-actions">
                  <Link className="btn btn-sm btn-ghost" to="/invoices">
                    View all invoices
                  </Link>
                </div>
              </div>

              {stats.recent.length === 0 ? (
                <div className="empty-state">
                  <h3>Nothing here yet</h3>
                  <p>Raise a quote or an invoice and it'll show up here.</p>
                  <Link className="btn btn-primary" to="/invoices/new">
                    <PlusIcon />
                    New invoice
                  </Link>
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Number</th>
                        <th>Type</th>
                        <th>Date</th>
                        <th>Customer</th>
                        <th>Vehicle</th>
                        <th>Status</th>
                        <th className="num">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.recent.map((row) => (
                        <tr
                          key={row.id}
                          className="clickable"
                          onClick={() => navigate(`/${KIND_SLUGS[row.kind]}/${row.id}`)}
                        >
                          <td className="doc-number">{row.number}</td>
                          <td className="muted">
                            {KIND_LABELS[row.kind as DocumentKind]?.singular ?? row.kind}
                          </td>
                          <td className="muted">{formatDate(row.issueDate)}</td>
                          <td>{row.customerName || <span className="faint">—</span>}</td>
                          <td>
                            <RegPlate reg={row.vehicleReg} />
                          </td>
                          <td>
                            <StatusBadge status={row.status} overdue={row.isOverdue} />
                          </td>
                          <td className="num">{formatMoney(row.totalPence)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </>
  );
}
