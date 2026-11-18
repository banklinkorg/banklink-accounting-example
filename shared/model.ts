export type Document = {
  id: string;
  kind: "invoice" | "bill";
  contact: string;
  date: string;
  due: string;
  description: string;
  net: number;
  vat: number;
};
export type Transaction = {
  id: string;
  account: string;
  date: string;
  description: string;
  amount: number;
  source: "sample" | "banklink";
  reference?: string;
  category?: string;
  documentId?: string;
  reviewed?: boolean;
};
export type Entry = {
  id: string;
  date: string;
  description: string;
  lines: { account: string; debit: number; credit: number }[];
};
export type State = {
  documents: Document[];
  transactions: Transaction[];
  entries: Entry[];
  lastSync: string | null;
  mode: "sample" | "sandbox";
  audit: { date: string; action: string }[];
};
export type Action =
  | { type: "record"; id: string; category: string; documentId?: string }
  | { type: "document"; document: Document };
export const categories = [
  "Sales",
  "Materials",
  "Rent",
  "Telephone",
  "Electricity",
  "Bank charges",
  "Travel",
  "Owner funds",
  "Transfer",
] as const;
export const money = (cents: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(
    cents / 100,
  );
export const balance = (s: State, account: string) =>
  s.entries
    .flatMap((e) => e.lines)
    .filter((l) => l.account === account)
    .reduce((n, l) => n + l.debit - l.credit, 0);
export const outstanding = (s: State, d: Document) =>
  d.net +
  d.vat -
  s.transactions
    .filter((t) => t.documentId === d.id && t.reviewed)
    .reduce((n, t) => n + Math.abs(t.amount), 0);
export function addDocument(s: State, d: Document): State {
  if (s.documents.some((x) => x.id === d.id))
    throw new Error("That document number already exists.");
  if (
    !Number.isSafeInteger(d.net) ||
    d.net <= 0 ||
    !Number.isSafeInteger(d.vat) ||
    d.vat < 0
  )
    throw new Error("Enter valid amounts in cents.");
  const invoice = d.kind === "invoice";
  const lines = invoice
    ? [
        { account: "Receivables", debit: d.net + d.vat, credit: 0 },
        { account: "Sales", debit: 0, credit: d.net },
        { account: "VAT", debit: 0, credit: d.vat },
      ]
    : [
        { account: "Materials", debit: d.net, credit: 0 },
        { account: "VAT", debit: d.vat, credit: 0 },
        { account: "Payables", debit: 0, credit: d.net + d.vat },
      ];
  return {
    ...s,
    documents: [...s.documents, d],
    entries: [
      ...s.entries,
      { id: d.id, date: d.date, description: `${d.id} · ${d.contact}`, lines },
    ],
  };
}
export function applyAction(s: State, action: Action): State {
  if (action.type === "document") return addDocument(s, action.document);
  const t = s.transactions.find((x) => x.id === action.id);
  if (!t || t.reviewed)
    throw new Error("This transaction is unavailable or already recorded.");
  const d = action.documentId
    ? s.documents.find((x) => x.id === action.documentId)
    : undefined;
  if (action.documentId && !d) throw new Error("Document not found.");
  if (
    d &&
    ((d.kind === "invoice") !== t.amount > 0 ||
      Math.abs(t.amount) > outstanding(s, d))
  )
    throw new Error("The payment does not fit the document balance.");
  if (
    !d &&
    !categories.includes(action.category as (typeof categories)[number])
  )
    throw new Error("Choose a category.");
  const account = d
    ? d.kind === "invoice"
      ? "Receivables"
      : "Payables"
    : action.category === "Owner funds"
      ? "Equity"
      : action.category === "Transfer"
        ? "Transfers clearing"
        : action.category;
  const amount = Math.abs(t.amount);
  const lines =
    t.amount > 0
      ? [
          { account: "Bank", debit: amount, credit: 0 },
          { account, debit: 0, credit: amount },
        ]
      : [
          { account, debit: amount, credit: 0 },
          { account: "Bank", debit: 0, credit: amount },
        ];
  return {
    ...s,
    transactions: s.transactions.map((x) =>
      x.id === t.id
        ? { ...x, reviewed: true, category: account, documentId: d?.id }
        : x,
    ),
    entries: [
      ...s.entries,
      { id: `bank:${t.id}`, date: t.date, description: t.description, lines },
    ],
  };
}
export function seed(): State {
  let s: State = {
    documents: [],
    transactions: [],
    entries: [
      {
        id: "opening",
        date: "2026-11-01",
        description: "Opening balances",
        lines: [
          { account: "Bank", debit: 18500000, credit: 0 },
          { account: "Equity", debit: 0, credit: 18500000 },
        ],
      },
    ],
    lastSync: null,
    mode: "sample",
    audit: [],
  };
  for (const d of [
    {
      id: "INV-1042",
      kind: "invoice" as const,
      contact: "Café Neo",
      date: "2026-11-04",
      due: "2026-11-18",
      description: "Wholesale coffee · November",
      net: 1100000,
      vat: 165000,
    },
    {
      id: "INV-1043",
      kind: "invoice" as const,
      contact: "The Sunday Table",
      date: "2026-11-08",
      due: "2026-11-22",
      description: "Roasted beans · 120 kg",
      net: 2400000,
      vat: 360000,
    },
    {
      id: "INV-1044",
      kind: "invoice" as const,
      contact: "Good Company Café",
      date: "2026-11-02",
      due: "2026-11-16",
      description: "Coffee subscription",
      net: 680000,
      vat: 102000,
    },
    {
      id: "BILL-388",
      kind: "bill" as const,
      contact: "Green Bean Imports",
      date: "2026-11-03",
      due: "2026-11-20",
      description: "Green coffee beans",
      net: 1800000,
      vat: 270000,
    },
    {
      id: "BILL-389",
      kind: "bill" as const,
      contact: "Cape Packaging",
      date: "2026-11-06",
      due: "2026-11-23",
      description: "Compostable coffee bags",
      net: 450000,
      vat: 67500,
    },
  ])
    s = addDocument(s, d);
  s.transactions = [
    {
      id: "sample-1",
      account: "Business current ··4821",
      date: "2026-11-18",
      description: "INWARD EFT CAFE NEO INV1042",
      amount: 1265000,
      reference: "INV-1042",
      source: "sample",
    },
    {
      id: "sample-2",
      account: "Business current ··4821",
      date: "2026-11-18",
      description: "GREEN BEAN IMPORTS BILL388",
      amount: -2070000,
      reference: "BILL-388",
      source: "sample",
    },
    {
      id: "sample-3",
      account: "Business current ··4821",
      date: "2026-11-17",
      description: "VODACOM BUSINESS",
      amount: -124900,
      source: "sample",
    },
    {
      id: "sample-4",
      account: "Business current ··4821",
      date: "2026-11-17",
      description: "MONTHLY ACCOUNT FEE",
      amount: -38500,
      source: "sample",
    },
    {
      id: "sample-5",
      account: "Business current ··4821",
      date: "2026-11-16",
      description: "RENT WOODSTOCK STUDIO",
      amount: -1450000,
      source: "sample",
    },
    {
      id: "sample-6",
      account: "Business current ··4821",
      date: "2026-11-15",
      description: "ESKOM PREPAID",
      amount: -200000,
      source: "sample",
    },
  ];
  return s;
}
export function suggestion(s: State, t: Transaction) {
  return s.documents.find(
    (d) =>
      outstanding(s, d) === Math.abs(t.amount) &&
      (d.kind === "invoice") === t.amount > 0 &&
      `${t.description} ${t.reference ?? ""}`
        .replace(/[^a-z0-9]/gi, "")
        .toLowerCase()
        .includes(d.id.replace(/[^a-z0-9]/gi, "").toLowerCase()),
  );
}
export function totals(s: State) {
  const income = -balance(s, "Sales");
  const expenses = categories
    .filter((c) => !["Sales", "Owner funds", "Transfer"].includes(c))
    .reduce((n, a) => n + balance(s, a), 0);
  return {
    income,
    expenses,
    profit: income - expenses,
    bank: balance(s, "Bank"),
    receivables: balance(s, "Receivables"),
    payables: -balance(s, "Payables"),
    vat: -balance(s, "VAT"),
  };
}
