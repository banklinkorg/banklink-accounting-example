import { useState, type FormEvent, type ReactNode } from "react";
import {
  BookOpen,
  Building2,
  ChevronRight,
  CircleCheck,
  FileText,
  Home,
  Landmark,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShoppingBag,
  Users,
  X,
} from "lucide-react";
import {
  categories,
  money,
  outstanding,
  suggestion,
  totals,
  balance,
  type Action,
  type Document,
  type State,
  type Transaction,
} from "./model";
import "./accounting.css";
export type AccountingProps = {
  state: State;
  dispatch: (action: Action) => Promise<void>;
  sync: () => Promise<void>;
  reset?: () => void;
  signOut?: () => void;
};
const pages = [
  { name: "Overview", icon: Home },
  { name: "Banking", icon: Landmark },
  { name: "Sales", icon: FileText },
  { name: "Purchases", icon: ShoppingBag },
  { name: "Contacts", icon: Users },
  { name: "Reports", icon: BookOpen },
  { name: "Tax", icon: Building2 },
  { name: "Settings", icon: Settings },
];
const dateLabel = (date: string) =>
  new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
  });
function Status({
  children,
  good = false,
}: {
  children: ReactNode;
  good?: boolean;
}) {
  return (
    <span className={`ll-status ${good ? "ll-good" : ""}`}>{children}</span>
  );
}
function exportRows(name: string, rows: string[][]) {
  const text = rows
    .map((r) =>
      r
        .map((c) => `"${c.replace(/"/g, '""').replace(/^[=+@-]/, "'$&")}"`)
        .join(","),
    )
    .join("\r\n");
  const a = document.createElement("a");
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/csv;charset=utf-8" }),
  );
  a.href = url;
  a.download = `${name}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function AccountingApp({
  state: s,
  dispatch,
  sync,
  reset,
  signOut,
}: AccountingProps) {
  const [page, setPage] = useState("Overview");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("To review");
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [category, setCategory] = useState("Bank charges");
  const [match, setMatch] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [newDoc, setNewDoc] = useState<"invoice" | "bill" | null>(null);
  const [report, setReport] = useState("Profit and loss");
  const sum = totals(s);
  const pending = s.transactions.filter((t) => !t.reviewed);
  const current = selected
    ? s.transactions.find((t) => t.id === selected.id)
    : null;
  async function perform(task: () => Promise<void>, success: string) {
    setBusy(true);
    setError("");
    try {
      await task();
      setMessage(success);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  function navigate(next: string) {
    setPage(next);
    setQuery("");
    setSelected(null);
    setMessage("");
  }
  function choose(t: Transaction) {
    const d = suggestion(s, t);
    setSelected(t);
    setMatch(d?.id ?? "");
    setCategory(
      t.description.includes("VODACOM")
        ? "Telephone"
        : t.description.includes("ESKOM")
          ? "Electricity"
          : t.description.includes("RENT")
            ? "Rent"
            : t.amount > 0
              ? "Sales"
              : "Bank charges",
    );
  }
  async function createDocument(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const net = Math.round(Number(f.get("net")) * 100);
    const vat = f.get("vat") === "standard" ? Math.round(net * 0.15) : 0;
    const d: Document = {
      id: String(f.get("id")).trim(),
      kind: newDoc!,
      contact: String(f.get("contact")).trim(),
      date: String(f.get("date")),
      due: String(f.get("due")),
      description: String(f.get("description")).trim(),
      net,
      vat,
    };
    await perform(async () => {
      await dispatch({ type: "document", document: d });
      setNewDoc(null);
    }, `${d.id} added to the books.`);
  }
  const title = page === "Overview" ? "A little clarity for your day." : page;
  const subtitle: Record<string, string> = {
    Overview: "Here’s how Karoo Coffee Roasters is doing.",
    Banking: "Your bank activity, with a place for every payment.",
    Sales: "Good work deserves to be paid on time.",
    Purchases: "Know what’s due, and keep the paperwork together.",
    Contacts: "The people behind your business.",
    Reports: "The numbers, and the details behind them.",
    Tax: "Prepare your working papers, one period at a time.",
    Settings: "Your business and its bank connection.",
  };
  const documents = s.documents.filter(
    (d) =>
      d.kind === (page === "Purchases" ? "bill" : "invoice") &&
      `${d.id} ${d.contact}`.toLowerCase().includes(query.toLowerCase()),
  );
  const accountNames = [
    ...new Set(s.entries.flatMap((e) => e.lines.map((l) => l.account))),
  ];
  const reportRows =
    report === "Trial balance"
      ? accountNames.map((a) => [
          a,
          money(Math.max(0, balance(s, a))),
          money(Math.max(0, -balance(s, a))),
        ])
      : report === "General ledger"
        ? s.entries.flatMap((e) =>
            e.lines.map((l) => [
              e.date,
              e.description,
              l.account,
              money(l.debit),
              money(l.credit),
            ]),
          )
        : report === "Balance sheet"
          ? [
              ["Bank (recorded)", money(sum.bank)],
              ["Customer receivables", money(sum.receivables)],
              ["Supplier payables", money(sum.payables)],
              ["VAT payable", money(sum.vat)],
              ["Opening equity", money(-balance(s, "Equity"))],
              ["Current profit", money(sum.profit)],
              ["Transfers clearing", money(balance(s, "Transfers clearing"))],
            ]
          : report === "Unpaid invoices"
            ? s.documents
                .filter((d) => d.kind === "invoice" && outstanding(s, d) > 0)
                .map((d) => [d.id, d.contact, d.due, money(outstanding(s, d))])
            : [
                ["Sales", money(sum.income)],
                ...categories
                  .filter(
                    (c) => !["Sales", "Owner funds", "Transfer"].includes(c),
                  )
                  .map((c) => [c, money(balance(s, c))]),
                ["Net profit", money(sum.profit)],
              ];
  return (
    <section className="ll" aria-label="Ledgerline accounting application">
      <aside className="ll-sidebar">
        <button className="ll-brand" onClick={() => navigate("Overview")}>
          <span className="ll-brandmark">
            <BookOpen size={21} />
          </span>
          ledgerline<span className="ll-brand-dot">.</span>
        </button>
        <div className="ll-company">
          <span className="ll-avatar">KC</span>
          <span>
            Karoo Coffee<small>Roasters (Pty) Ltd</small>
          </span>
        </div>
        <nav aria-label="Accounting navigation">
          {pages.map(({ name, icon: Icon }) => (
            <button
              key={name}
              aria-current={page === name ? "page" : undefined}
              onClick={() => navigate(name)}
            >
              <Icon size={18} />
              <span>{name}</span>
              {name === "Banking" && pending.length > 0 && (
                <b>{pending.length}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="ll-sidebar-foot">
          <span>Made for the everyday.</span>
          <small>A BankLink example application</small>
          {signOut && <button onClick={signOut}>Sign out</button>}
        </div>
      </aside>
      <div className="ll-workspace">
        <header className="ll-topbar">
          <span>
            Karoo Coffee Roasters <ChevronRight size={13} /> {page}
          </span>
          <div>
            <span className="ll-sample">
              {s.mode === "sample" ? "Sample company" : "BankLink sandbox"}
            </span>
            <span className="ll-avatar">TN</span>
          </div>
        </header>
        <div className="ll-body">
          <div className="ll-heading">
            <div>
              <h2>{title}</h2>
              <p>{subtitle[page]}</p>
            </div>
            {["Sales", "Purchases"].includes(page) ? (
              <button
                className="ll-primary"
                onClick={() => setNewDoc(page === "Sales" ? "invoice" : "bill")}
              >
                <Plus size={16} />
                New {page === "Sales" ? "invoice" : "bill"}
              </button>
            ) : page === "Banking" ? (
              <button
                disabled={busy}
                onClick={() =>
                  perform(
                    sync,
                    s.mode === "sample"
                      ? "Sample feed checked. No new transactions."
                      : "Sandbox bank feed updated.",
                  )
                }
              >
                <RefreshCw size={15} />{" "}
                {busy ? "Updating…" : "Update bank feed"}
              </button>
            ) : (
              <span className="ll-period">November 2026</span>
            )}
          </div>
          <div aria-live="polite">
            {message && (
              <div className="ll-notice">
                <CircleCheck size={16} />
                {message}
                <button
                  aria-label="Dismiss message"
                  onClick={() => setMessage("")}
                >
                  <X size={15} />
                </button>
              </div>
            )}
          </div>
          {error && (
            <div className="ll-error" role="alert">
              {error}
            </div>
          )}
          {page === "Overview" && (
            <>
              <div className="ll-overview">
                <section className="ll-cash">
                  <span>Cash in the books</span>
                  <strong>{money(sum.bank)}</strong>
                  <p>{pending.length} bank transactions still to review</p>
                  <button onClick={() => navigate("Banking")}>
                    Review bank activity <ChevronRight size={15} />
                  </button>
                  <div className="ll-cash-note">
                    Recorded ledger balance · sample opening balance
                  </div>
                </section>
                <section className="ll-owings">
                  <div>
                    <span>Customers owe you</span>
                    <strong>{money(sum.receivables)}</strong>
                    <button onClick={() => navigate("Sales")}>
                      View invoices <ChevronRight size={14} />
                    </button>
                  </div>
                  <div>
                    <span>Bills to pay</span>
                    <strong>{money(sum.payables)}</strong>
                    <button onClick={() => navigate("Purchases")}>
                      View bills <ChevronRight size={14} />
                    </button>
                  </div>
                </section>
              </div>
              <div className="ll-columns">
                <section className="ll-panel">
                  <div className="ll-panel-title">
                    <h3>Income & expenses</h3>
                    <span>November · accrual basis</span>
                  </div>
                  <div
                    className="ll-bar-chart"
                    role="img"
                    aria-label={`Income ${money(sum.income)}, expenses ${money(sum.expenses)}, profit ${money(sum.profit)}`}
                  >
                    {[
                      ["Income", sum.income],
                      ["Expenses", sum.expenses],
                      ["Profit", sum.profit],
                    ].map(([label, n]) => (
                      <div key={label}>
                        <span>{label}</span>
                        <div>
                          <i
                            style={{
                              width: `${Math.min(100, (Math.abs(Number(n)) / Math.max(sum.income, sum.expenses, 1)) * 100)}%`,
                            }}
                          />
                        </div>
                        <strong>{money(Number(n))}</strong>
                      </div>
                    ))}
                  </div>
                  <p className="ll-muted">
                    Invoices and bills count when issued. Bank payments settle
                    their balances.
                  </p>
                </section>
                <section className="ll-panel">
                  <h3>A few things to take care of</h3>
                  <button
                    className="ll-task"
                    onClick={() => navigate("Banking")}
                  >
                    <Landmark size={18} />
                    <span>
                      Review bank transactions
                      <small>
                        {pending.length} waiting for a category or match
                      </small>
                    </span>
                    <ChevronRight size={16} />
                  </button>
                  <button className="ll-task" onClick={() => navigate("Sales")}>
                    <FileText size={18} />
                    <span>
                      Follow up on invoices
                      <small>See who still needs to pay</small>
                    </span>
                    <ChevronRight size={16} />
                  </button>
                  <button className="ll-task" onClick={() => navigate("Tax")}>
                    <Building2 size={18} />
                    <span>
                      Prepare VAT working papers
                      <small>Review the supporting documents</small>
                    </span>
                    <ChevronRight size={16} />
                  </button>
                </section>
              </div>
              <section className="ll-panel">
                <div className="ll-panel-title">
                  <h3>Recent bank activity</h3>
                  <button onClick={() => navigate("Banking")}>
                    View all activity
                  </button>
                </div>
                {s.transactions.slice(0, 4).map((t) => (
                  <button
                    className="ll-activity"
                    key={t.id}
                    onClick={() => {
                      navigate("Banking");
                      choose(t);
                    }}
                  >
                    <span className="ll-date">{dateLabel(t.date)}</span>
                    <span>
                      {t.description}
                      <small>{t.account}</small>
                    </span>
                    <strong className={t.amount > 0 ? "ll-credit" : ""}>
                      {money(t.amount)}
                    </strong>
                    <Status good={t.reviewed}>
                      {t.reviewed ? "Recorded" : "To review"}
                    </Status>
                  </button>
                ))}
              </section>
            </>
          )}
          {page === "Banking" && (
            <>
              <div className="ll-bank-summary">
                <Landmark size={24} />
                <div>
                  <h3>Business banking</h3>
                  <p>
                    {s.mode === "sample"
                      ? "FNB · fictional account ··4821"
                      : "Imported sandbox accounts"}
                  </p>
                </div>
                <div>
                  <span>Recorded bank balance</span>
                  <strong>{money(sum.bank)}</strong>
                </div>
                <div>
                  <span>Last feed update</span>
                  <strong>
                    {s.lastSync
                      ? new Date(s.lastSync).toLocaleString("en-ZA")
                      : "Sample data · not connected"}
                  </strong>
                </div>
              </div>
              <div className="ll-toolbar">
                <div className="ll-tabs" aria-label="Transaction filters">
                  {["To review", "Recorded", "All transactions"].map((f) => (
                    <button
                      key={f}
                      aria-pressed={filter === f}
                      onClick={() => setFilter(f)}
                    >
                      {f}
                      {f === "To review" ? ` (${pending.length})` : ""}
                    </button>
                  ))}
                </div>
                <label className="ll-search">
                  <Search size={16} />
                  <input
                    aria-label="Search bank transactions"
                    placeholder="Search transactions"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
              </div>
              <div className="ll-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Transaction</th>
                      <th>Suggested match / category</th>
                      <th className="ll-number">Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.transactions
                      .filter(
                        (t) =>
                          (filter === "All transactions" ||
                            (filter === "Recorded"
                              ? t.reviewed
                              : !t.reviewed)) &&
                          `${t.description} ${t.reference ?? ""}`
                            .toLowerCase()
                            .includes(query.toLowerCase()),
                      )
                      .map((t) => (
                        <tr key={t.id}>
                          <td>{dateLabel(t.date)}</td>
                          <td>
                            <button
                              className="ll-text-button"
                              onClick={() => choose(t)}
                            >
                              {t.description}
                            </button>
                            <small>{t.account}</small>
                          </td>
                          <td>
                            {t.documentId ??
                              t.category ??
                              suggestion(s, t)?.id ??
                              "Choose a category"}
                          </td>
                          <td
                            className={`ll-number ${t.amount > 0 ? "ll-credit" : ""}`}
                          >
                            {money(t.amount)}
                          </td>
                          <td>
                            <Status good={t.reviewed}>
                              {t.reviewed ? "Recorded" : "To review"}
                            </Status>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {pending.length === 0 && filter === "To review" && (
                <div className="ll-empty">
                  <CircleCheck size={28} />
                  <h3>You’re up to date.</h3>
                  <p>All imported transactions have been reviewed.</p>
                </div>
              )}
              <p className="ll-muted">
                Recording a transaction updates the books. A period-end
                reconciliation still needs your bank statement and closing
                balance.
              </p>
            </>
          )}
          {["Sales", "Purchases"].includes(page) && (
            <>
              <div className="ll-summary-line">
                <span>
                  {page === "Sales"
                    ? "Outstanding customer invoices"
                    : "Outstanding supplier bills"}
                </span>
                <strong>
                  {money(page === "Sales" ? sum.receivables : sum.payables)}
                </strong>
              </div>
              <label className="ll-search">
                <Search size={16} />
                <input
                  aria-label="Search documents"
                  placeholder="Search by name or document number"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <div className="ll-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Document</th>
                      <th>{page === "Sales" ? "Customer" : "Supplier"}</th>
                      <th>Due</th>
                      <th className="ll-number">Total</th>
                      <th className="ll-number">Outstanding</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((d) => (
                      <tr key={d.id}>
                        <td>
                          {d.id}
                          <small>{d.description}</small>
                        </td>
                        <td>{d.contact}</td>
                        <td>{dateLabel(d.due)}</td>
                        <td className="ll-number">{money(d.net + d.vat)}</td>
                        <td className="ll-number">
                          {money(outstanding(s, d))}
                        </td>
                        <td>
                          <Status good={outstanding(s, d) === 0}>
                            {outstanding(s, d) === 0
                              ? "Paid"
                              : outstanding(s, d) < d.net + d.vat
                                ? "Partly paid"
                                : "Awaiting payment"}
                          </Status>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="ll-muted">
                Match payments in Banking to settle these documents. Example
                documents are recorded on an accrual basis.
              </p>
            </>
          )}
          {page === "Contacts" && (
            <div className="ll-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Contact</th>
                    <th>Relationship</th>
                    <th className="ll-number">Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {[...new Set(s.documents.map((d) => d.contact))].map((c) => (
                    <tr key={c}>
                      <td>{c}</td>
                      <td>
                        {s.documents.find((d) => d.contact === c)?.kind ===
                        "invoice"
                          ? "Customer"
                          : "Supplier"}
                      </td>
                      <td className="ll-number">
                        {money(
                          s.documents
                            .filter((d) => d.contact === c)
                            .reduce((n, d) => n + outstanding(s, d), 0),
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {page === "Reports" && (
            <>
              <div className="ll-toolbar">
                <label>
                  Report{" "}
                  <select
                    value={report}
                    onChange={(e) => setReport(e.target.value)}
                  >
                    {[
                      "Profit and loss",
                      "Balance sheet",
                      "Trial balance",
                      "General ledger",
                      "Unpaid invoices",
                    ].map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </label>
                <button onClick={() => exportRows(report, reportRows)}>
                  Download CSV
                </button>
              </div>
              <section className="ll-report">
                <h3>{report}</h3>
                <p>
                  Karoo Coffee Roasters (Pty) Ltd · All recorded activity · ZAR
                </p>
                <div className="ll-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        {(report === "Trial balance"
                          ? ["Account", "Debit", "Credit"]
                          : report === "General ledger"
                            ? ["Date", "Entry", "Account", "Debit", "Credit"]
                            : report === "Unpaid invoices"
                              ? ["Invoice", "Customer", "Due", "Outstanding"]
                              : ["Account", "Amount"]
                        ).map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {reportRows.map((r, i) => (
                        <tr key={i}>
                          {r.map((c, j) => (
                            <td key={j}>{c}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          {page === "Tax" && (
            <>
              <div className="ll-notice">
                Illustrative working papers. No SARS submission or tax
                compliance certification.
              </div>
              <section className="ll-panel">
                <div className="ll-panel-title">
                  <div>
                    <h3>
                      VAT return <span className="ll-muted">VAT201</span>
                    </h3>
                    <p>November 2026 sample period · invoice basis</p>
                  </div>
                  <Status>Draft working paper</Status>
                </div>
                <div className="ll-tax-rows">
                  <div>
                    <span>Output VAT · sales invoices</span>
                    <strong>
                      {money(
                        s.documents
                          .filter((d) => d.kind === "invoice")
                          .reduce((n, d) => n + d.vat, 0),
                      )}
                    </strong>
                  </div>
                  <div>
                    <span>Input VAT · supplier bills</span>
                    <strong>
                      {money(
                        s.documents
                          .filter((d) => d.kind === "bill")
                          .reduce((n, d) => n + d.vat, 0),
                      )}
                    </strong>
                  </div>
                  <div>
                    <span>Net document VAT</span>
                    <strong>{money(sum.vat)}</strong>
                  </div>
                </div>
                <p className="ll-muted">
                  This example uses document tax amounts. Bank-only expenses
                  have no input VAT claim until supporting documents and tax
                  treatment are reviewed.
                </p>
                <button
                  onClick={() =>
                    exportRows("VAT-working-paper", [
                      ["Document", "Date", "Net cents", "VAT cents"],
                      ...s.documents.map((d) => [
                        d.id,
                        d.date,
                        String(d.net),
                        String(d.vat),
                      ]),
                    ])
                  }
                >
                  Download working paper
                </button>
              </section>
              <section className="ll-panel">
                <h3>
                  Provisional tax <span className="ll-muted">IRP6</span>
                </h3>
                <p>
                  Start with accounting profit, then assess the full tax year
                  and tax adjustments with your accountant.
                </p>
                <div className="ll-summary-line">
                  <span>Accounting profit · recorded activity</span>
                  <strong>{money(sum.profit)}</strong>
                </div>
                <p className="ll-muted">
                  Taxable income, assessed basic amount, allowances and prior
                  payments are not calculated here. This screen does not produce
                  a filing-ready IRP6.
                </p>
                <a
                  href="https://www.sars.gov.za/guide-to-provisional-tax/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Read the SARS provisional tax guide
                </a>
              </section>
              <section className="ll-panel">
                <h3>Employer and company returns</h3>
                <p>
                  EMP201, EMP501 and ITR14 need payroll and tax records beyond
                  the bank feed. Payroll calculation and electronic filing are
                  outside this starter’s scope.
                </p>
              </section>
            </>
          )}
          {page === "Settings" && (
            <>
              <section className="ll-panel">
                <h3>Company details</h3>
                <dl>
                  <dt>Company</dt>
                  <dd>Karoo Coffee Roasters (Pty) Ltd · fictional</dd>
                  <dt>Currency</dt>
                  <dd>South African rand (ZAR)</dd>
                  <dt>Accounting</dt>
                  <dd>Accrual basis · amounts stored as integer cents</dd>
                  <dt>Data source</dt>
                  <dd>
                    {s.mode === "sample"
                      ? "Included sample dataset"
                      : "BankLink /v1 sandbox · test-key only"}
                  </dd>
                </dl>
                <p>
                  BankLink credentials stay on the server. The website preview
                  runs entirely in your browser.
                </p>
                {reset && (
                  <button
                    onClick={() => {
                      reset();
                      setMessage("Sample company restored.");
                    }}
                  >
                    Reset sample company
                  </button>
                )}
              </section>
              <section className="ll-panel">
                <h3>Activity history</h3>
                {s.audit.length ? (
                  s.audit
                    .slice(-10)
                    .reverse()
                    .map((a, i) => (
                      <p key={i}>
                        {new Date(a.date).toLocaleString("en-ZA")} · {a.action}
                      </p>
                    ))
                ) : (
                  <p>Your changes will appear here.</p>
                )}
              </section>
            </>
          )}
          <footer className="ll-footer">
            Ledgerline · Fictional business, real accounting interactions.
            <span>Powered by BankLink</span>
          </footer>
        </div>
      </div>
      {current && (
        <div
          className="ll-review"
          role="region"
          aria-label="Review bank transaction"
        >
          <div className="ll-panel-title">
            <h3>
              {current.reviewed ? "Recorded transaction" : "Review transaction"}
            </h3>
            <button
              aria-label="Close transaction"
              onClick={() => setSelected(null)}
            >
              <X size={18} />
            </button>
          </div>
          <p className="ll-muted">
            {dateLabel(current.date)} · {current.account}
          </p>
          <h3>{current.description}</h3>
          <strong className="ll-review-amount">{money(current.amount)}</strong>
          {current.reviewed ? (
            <>
              <Status good>{current.documentId ?? current.category}</Status>
              <p>Recorded in the general ledger.</p>
            </>
          ) : (
            <>
              <label>
                Match a document
                <select
                  value={match}
                  onChange={(e) => setMatch(e.target.value)}
                >
                  <option value="">No document · categorise instead</option>
                  {s.documents
                    .filter(
                      (d) =>
                        (d.kind === "invoice") === current.amount > 0 &&
                        outstanding(s, d) >= Math.abs(current.amount),
                    )
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.id} · {d.contact} · {money(outstanding(s, d))}
                      </option>
                    ))}
                </select>
              </label>
              {match ? (
                <p className="ll-match">
                  {suggestion(s, current)?.id === match
                    ? "Amount and reference match this document."
                    : "Confirm this is the correct document before recording."}
                </p>
              ) : (
                <label>
                  Category
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    {categories.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
              )}
              <p className="ll-muted">
                The original bank line is preserved. Confirming creates a
                balanced journal entry.
              </p>
              <button
                className="ll-primary"
                disabled={busy}
                onClick={() =>
                  perform(async () => {
                    await dispatch({
                      type: "record",
                      id: current.id,
                      category,
                      documentId: match || undefined,
                    });
                    setSelected(null);
                  }, "Payment recorded. Your books are updated.")
                }
              >
                {busy
                  ? "Recording…"
                  : match
                    ? "Confirm match"
                    : "Record transaction"}
              </button>
            </>
          )}
          <details>
            <summary>View source data</summary>
            <pre>{JSON.stringify(current, null, 2)}</pre>
          </details>
          {error && (
            <p role="alert" className="ll-error">
              {error}
            </p>
          )}
        </div>
      )}
      {newDoc && (
        <div className="ll-modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="ll-new-document"
            className="ll-modal"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setNewDoc(null);
                e.currentTarget
                  .closest(".ll")
                  ?.querySelector<HTMLButtonElement>(".ll-heading button")
                  ?.focus();
              }
              if (e.key === "Tab") {
                const items = Array.from(
                  e.currentTarget.querySelectorAll<HTMLElement>(
                    "button:not(:disabled), input, select, a[href]",
                  ),
                );
                const first = items[0];
                const last = items[items.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault();
                  last?.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault();
                  first?.focus();
                }
              }
            }}
          >
            <div className="ll-panel-title">
              <h3 id="ll-new-document">New {newDoc}</h3>
              <button aria-label="Close form" onClick={() => setNewDoc(null)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={createDocument}>
              <label>
                Document number
                <input
                  name="id"
                  required
                  maxLength={40}
                  placeholder={newDoc === "invoice" ? "INV-1045" : "BILL-390"}
                  autoFocus
                />
              </label>
              <label>
                {newDoc === "invoice" ? "Customer" : "Supplier"}
                <input name="contact" required maxLength={100} />
              </label>
              <label>
                Description
                <input name="description" required maxLength={200} />
              </label>
              <div className="ll-form-columns">
                <label>
                  Date
                  <input
                    name="date"
                    type="date"
                    defaultValue="2026-11-19"
                    required
                  />
                </label>
                <label>
                  Due date
                  <input
                    name="due"
                    type="date"
                    defaultValue="2026-12-03"
                    required
                  />
                </label>
              </div>
              <label>
                Amount excluding VAT (R)
                <input
                  name="net"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="10000000"
                  required
                />
              </label>
              <label>
                VAT treatment
                <select name="vat">
                  <option value="standard">Standard rate · 15% (sample)</option>
                  <option value="none">No VAT</option>
                </select>
              </label>
              {error && (
                <p role="alert" className="ll-error">
                  {error}
                </p>
              )}
              <button className="ll-primary" disabled={busy}>
                Save {newDoc}
              </button>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
