import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app";
import { normalise } from "../server/banklink";
test("authenticated persistence, CSRF checks, idempotent import and logout", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ledgerline-test-"));
  const dbPath = join(dir, "test.sqlite");
  const origin = "http://localhost:3108";
  const password = "test-password-long-enough";
  const config = {
    dbPath,
    password,
    origin,
    secure: false,
    sandbox: async () => [
      normalise("a", {
        id: "1",
        external_id: "1",
        date: "2026-11-19",
        amount: 15.5,
        description: "Sandbox fee",
        currency: "ZAR",
        direction: "debit",
      }),
    ],
  };
  const { app, db } = createApp(config);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const addr = server.address() as { port: number };
  const base = `http://127.0.0.1:${addr.port}`;
  let cookie = "";
  const call = (path: string, body?: unknown, requestOrigin = origin) =>
    fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(cookie ? { cookie } : {}),
        origin: requestOrigin,
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  try {
    assert.equal((await call("/api/state")).status, 401);
    assert.equal(
      (await call("/api/login", { password }, "https://evil.example")).status,
      403,
    );
    assert.equal((await call("/api/login", { password: "wrong" })).status, 401);
    const login = await call("/api/login", { password });
    assert.equal(login.status, 200);
    const setCookie = login.headers.get("set-cookie")!;
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Strict/);
    cookie = setCookie.split(";")[0];
    assert.equal((await call("/api/state")).status, 200);
    assert.equal(
      (
        await call(
          "/api/actions",
          { type: "record", id: "sample-3", category: "Telephone" },
          "https://evil.example",
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await call("/api/actions", {
          type: "record",
          id: "sample-3",
          category: "Telephone",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await call("/api/actions", {
          type: "record",
          id: "sample-3",
          category: "Telephone",
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await call("/api/actions", {
          type: "document",
          document: { id: "bad" },
        })
      ).status,
      400,
    );
    assert.equal((await (await call("/api/sync", {})).json()).imported, 1);
    assert.equal((await (await call("/api/sync", {})).json()).imported, 0);
    const state = await (await call("/api/state")).json();
    assert.equal(
      state.transactions.filter(
        (t: { source: string }) => t.source === "banklink",
      ).length,
      1,
    );
    assert.ok(
      state.transactions.find(
        (t: { id: string; reviewed: boolean }) => t.id === "sample-3",
      ).reviewed,
    );
    assert.equal((await call("/api/logout", {})).status, 200);
    assert.equal((await call("/api/state")).status, 401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  }
  const reopened = createApp(config);
  try {
    assert.ok(
      reopened.read().transactions.find((t) => t.id === "sample-3")?.reviewed,
    );
  } finally {
    reopened.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
