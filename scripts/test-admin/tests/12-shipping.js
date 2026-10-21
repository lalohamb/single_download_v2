// scripts/test-admin/tests/12-shipping.js
// Tests: shipping settings write to settings table and settings_public view reflects it.

import { db } from "../lib/client.js";
import { pass, fail, skip, check } from "../lib/assert.js";

export async function run() {
  console.log("\n── 12 Shipping ───────────────────────────────────────");

  const { data: row, error } = await db
    .from("settings")
    .select("id, default_shipping_cost, shipping_free_threshold")
    .limit(1)
    .maybeSingle();

  if (error || !row) { fail("settings row exists", error?.message ?? "no row"); return; }

  const origCost = row.default_shipping_cost;
  const origThreshold = row.shipping_free_threshold;
  const testCost = 9.99;
  const testThreshold = 100;

  // Write via service role (same table the admin shipping page writes to)
  const { error: writeErr } = await db
    .from("settings")
    .update({ default_shipping_cost: testCost, shipping_free_threshold: testThreshold })
    .eq("id", row.id);

  check("shipping settings write succeeds", !writeErr, writeErr?.message);

  // Verify in settings table
  const { data: after } = await db
    .from("settings")
    .select("default_shipping_cost, shipping_free_threshold")
    .eq("id", row.id)
    .maybeSingle();

  check("default_shipping_cost updated in DB", after?.default_shipping_cost == testCost,
    `expected ${testCost}, got ${after?.default_shipping_cost}`);
  check("shipping_free_threshold updated in DB", after?.shipping_free_threshold == testThreshold,
    `expected ${testThreshold}, got ${after?.shipping_free_threshold}`);

  // Verify settings_public view reflects it
  const { data: view } = await db
    .from("settings_public")
    .select("default_shipping_cost, shipping_free_threshold")
    .eq("id", row.id)
    .maybeSingle();

  check("settings_public reflects default_shipping_cost", view?.default_shipping_cost == testCost,
    `view returned ${view?.default_shipping_cost}`);
  check("settings_public reflects shipping_free_threshold", view?.shipping_free_threshold == testThreshold,
    `view returned ${view?.shipping_free_threshold}`);

  // Restore
  await db.from("settings").update({ default_shipping_cost: origCost, shipping_free_threshold: origThreshold }).eq("id", row.id);
  pass("shipping settings restored");
}
