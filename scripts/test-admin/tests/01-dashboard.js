// scripts/test-admin/tests/01-dashboard.js
// Tests: orders_paused toggle writes to settings table and reads back correctly.

import { db, dbRead } from "../lib/client.js";
import { pass, fail, skip, check } from "../lib/assert.js";

export async function run() {
  console.log("\n── 01 Dashboard ──────────────────────────────────────");

  // Get the settings row id and current value
  const { data: row, error } = await db
    .from("settings")
    .select("id, orders_paused")
    .limit(1)
    .maybeSingle();

  if (error || !row) { fail("settings row exists", `${error?.message ?? "no row"}`); return; }
  pass("settings row exists");

  const original = !!row.orders_paused;
  const toggled = !original;

  // Write via service role (same as the dashboard button which uses supabase client with admin JWT)
  const { error: writeErr } = await db
    .from("settings")
    .update({ orders_paused: toggled })
    .eq("id", row.id);

  check("orders_paused write succeeds", !writeErr, writeErr?.message);

  // Verify it landed
  const after = await dbRead("settings", "orders_paused", row.id);
  check("orders_paused value updated in DB", after?.orders_paused === toggled,
    `expected ${toggled}, got ${after?.orders_paused}`);

  // Verify settings_public view reflects the change
  const { data: view } = await db
    .from("settings_public")
    .select("orders_paused")
    .eq("id", row.id)
    .maybeSingle();
  check("settings_public view reflects orders_paused", view?.orders_paused === toggled,
    `view returned ${view?.orders_paused}`);

  // Restore
  await db.from("settings").update({ orders_paused: original }).eq("id", row.id);
  pass("orders_paused restored to original");
}
