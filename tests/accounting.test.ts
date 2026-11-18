import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyAction,
  seed,
  totals,
  balance,
  outstanding,
} from "../shared/model";
import { normalise, fetchSandbox } from "../server/banklink";
test("matching an invoice settles receivables without doubling sales", () => {
  const s = seed();
  const before = totals(s);
  const after = applyAction(s, {
    type: "record",
    id: "sample-1",
    category: "Sales",
    documentId: "INV-1042",
  });
  assert.equal(totals(after).income, before.income);
  assert.equal(totals(after).receivables, before.receivables - 1265000);
  assert.equal(outstanding(after, after.documents[0]), 0);
  assert.equal(totals(after).bank, before.bank + 1265000);
});
test("bill settlement reduces liability without doubling expense", () => {
  const s = seed();
  const next = applyAction(s, {
    type: "record",
    id: "sample-2",
    category: "Materials",
    documentId: "BILL-388",
  });
  assert.equal(totals(next).expenses, totals(s).expenses);
  assert.equal(totals(next).payables, totals(s).payables - 2070000);
});
test("every journal balances, including direct expenses", () => {
  let s = seed();
  for (const t of s.transactions)
    s = applyAction(s, {
      type: "record",
      id: t.id,
      category: t.amount > 0 ? "Sales" : "Bank charges",
    });
  for (const e of s.entries)
    assert.equal(
      e.lines.reduce((n, l) => n + l.debit - l.credit, 0),
      0,
    );
  const accounts = [
    ...new Set(s.entries.flatMap((e) => e.lines.map((l) => l.account))),
  ];
  assert.equal(
    accounts.reduce((n, a) => n + balance(s, a), 0),
    0,
  );
});
test("duplicate recording, overpayment and wrong-direction matching are refused", () => {
  const s = seed();
  const a = {
    type: "record" as const,
    id: "sample-1",
    category: "Sales",
    documentId: "INV-1042",
  };
  assert.throws(() => applyAction(applyAction(s, a), a));
  assert.throws(() => applyAction(s, { ...a, documentId: "BILL-388" }));
  assert.throws(() => applyAction(s, { ...a, documentId: "INV-1044" }));
});
test("partial payments leave the remaining document balance", () => {
  const s = seed();
  s.transactions[0].amount = 500000;
  const next = applyAction(s, {
    type: "record",
    id: "sample-1",
    category: "Sales",
    documentId: "INV-1042",
  });
  assert.equal(outstanding(next, next.documents[0]), 765000);
});
test("bank data normalisation uses direction, scoped external IDs and integer cents", () => {
  const row = {
    id: "row-1",
    external_id: "external-1",
    date: "2026-11-19",
    description: "Payment",
    amount: 12.34,
    currency: "ZAR",
    direction: "debit",
  };
  const t = normalise("account-1", row);
  assert.equal(t.amount, -1234);
  assert.notEqual(t.id, normalise("account-2", row).id);
  assert.throws(() => normalise("account-1", { ...row, currency: "USD" }));
  assert.throws(() => normalise("account-1", { ...row, amount: Infinity }));
});
test("live keys cannot reach BankLink from this example", async () => {
  await assert.rejects(
    fetchSandbox("sk_live_not-a-real-key"),
    /Only BankLink test keys/,
  );
});
