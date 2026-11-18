import { Banklink } from "@banklink/sdk";
import { z } from "zod";
import type { Transaction } from "../shared/model.js";
const row = z.object({
  id: z.string().min(1),
  external_id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  description: z.string().max(2000),
  amount: z.number().finite(),
  currency: z.literal("ZAR"),
  direction: z.enum(["debit", "credit"]),
  reference: z.string().nullable().optional(),
});
export function normalise(account: string, input: unknown): Transaction {
  const t = row.parse(input);
  const cents = Math.round(Math.abs(t.amount) * 100);
  if (!Number.isSafeInteger(cents) || cents === 0)
    throw new Error("Unsupported transaction amount.");
  return {
    id: `banklink:${account}:${t.external_id}`,
    account,
    date: t.date.slice(0, 10),
    description: t.description,
    amount: t.direction === "debit" ? -cents : cents,
    source: "banklink",
    reference: t.reference ?? undefined,
  };
}
export async function fetchSandbox(key: string): Promise<Transaction[]> {
  if (!key.startsWith("sk_test_"))
    throw new Error("Only BankLink test keys are accepted.");
  // Never accept a browser-supplied endpoint or key. This integration cannot call live-key routes.
  const client = new Banklink({ apiKey: key, timeout: 15000 });
  let accounts = (await client.accounts.list()).data;
  if (accounts.length === 0) {
    const linked = await client.link.create({
      bankId: "fnb",
      nickname: "Ledgerline sandbox",
      credentials: { username: "ledgerline-demo", password: "sandbox-demo" },
    });
    if (linked.type !== "success")
      throw new Error("Sandbox account setup did not complete.");
    accounts = (await client.accounts.list()).data;
  }
  const rows: Transaction[] = [];
  for (const account of accounts) {
    if (accounts.length > 20)
      throw new Error(
        "Use a sandbox organisation with no more than 20 accounts.",
      );
    await client.accounts.sync(account.id);
    for await (const t of client.transactions.listAutoPaginate(account.id, {
      limit: 100,
    })) {
      if (rows.length >= 10000)
        throw new Error("Sandbox import exceeds the example limit.");
      rows.push(normalise(account.id, t));
    }
  }
  return rows;
}
