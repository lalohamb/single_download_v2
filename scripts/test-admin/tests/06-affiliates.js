// scripts/test-admin/tests/06-affiliates.js
// Tests: affiliate_program_enabled toggle writes to settings and reads back.

import { db } from "../lib/client.js";
import { pass, fail, skip, check } from "../lib/assert.js";

export async function run() {
  console.log("\n── 06 Affiliates ─────────────────────────────────────");

  const { data: row, error } = await db
    .from("settings")
    .select("id, affiliate_program_enabled")
    .limit(1)
    .maybeSingle();

  if (error || !row) { fail("settings row exists", error?.message ?? "no row"); return; }

  const original = !!row.affiliate_program_enabled;
  const toggled = !original;

  const { error: writeErr } = await db
    .from("settings")
    .update({ affiliate_program_enabled: toggled })
    .eq("id", row.id);

  check("affiliate_program_enabled write succeeds", !writeErr, writeErr?.message);

  const { data: after } = await db
    .from("settings")
    .select("affiliate_program_enabled")
    .eq("id", row.id)
    .maybeSingle();

  check("affiliate_program_enabled updated in DB", after?.affiliate_program_enabled === toggled,
    `expected ${toggled}, got ${after?.affiliate_program_enabled}`);

  // Verify settings_public view reflects it
  const { data: view } = await db
    .from("settings_public")
    .select("affiliate_program_enabled")
    .eq("id", row.id)
    .maybeSingle();

  check("settings_public reflects affiliate_program_enabled", view?.affiliate_program_enabled === toggled,
    `view returned ${view?.affiliate_program_enabled}`);

  // Restore
  await db.from("settings").update({ affiliate_program_enabled: original }).eq("id", row.id);
  pass("affiliate_program_enabled restored");
}
