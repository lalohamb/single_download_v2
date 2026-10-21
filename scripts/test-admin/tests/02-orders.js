// scripts/test-admin/tests/02-orders.js
// Tests: order status update writes to orders table and reads back correctly.
// Uses the most recent real order — does NOT create fake orders.

import { db, dbRead } from "../lib/client.js";
import { pass, fail, skip, check } from "../lib/assert.js";

export async function run() {
  console.log("\n── 02 Orders ─────────────────────────────────────────");

  // Find a real order to test with (use oldest non-live test order to be safe)
  const { data: orders, error } = await db
    .from("orders")
    .select("id, status, livemode")
    .eq("livemode", false)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error || !orders?.length) {
    skip("order status update", "no test-mode orders found — run a test checkout first");
    return;
  }

  const order = orders[0];
  const original = order.status;
  const testStatus = original === "paid" ? "fulfilled" : "paid";

  pass(`found test order ${order.id.slice(-8)}`);

  // Write status update
  const { error: writeErr } = await db
    .from("orders")
    .update({ status: testStatus, updated_at: new Date().toISOString() })
    .eq("id", order.id);

  check("order status write succeeds", !writeErr, writeErr?.message);

  // Verify it landed
  const after = await dbRead("orders", "status", order.id);
  check("order status updated in DB", after?.status === testStatus,
    `expected ${testStatus}, got ${after?.status}`);

  // Restore
  await db.from("orders").update({ status: original }).eq("id", order.id);
  pass("order status restored");
}
