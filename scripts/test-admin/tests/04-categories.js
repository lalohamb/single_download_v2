// scripts/test-admin/tests/04-categories.js
// Tests: full insert → update → delete cycle on categories table.

import { db } from "../lib/client.js";
import { pass, fail, skip, check } from "../lib/assert.js";

export async function run() {
  console.log("\n── 04 Categories ─────────────────────────────────────");

  const testSlug = `__test-${Date.now()}`;

  // Insert
  const { data: inserted, error: insertErr } = await db
    .from("categories")
    .insert({ name: "TEST CATEGORY", slug: testSlug, description: "test" })
    .select()
    .single();

  check("category insert succeeds", !insertErr, insertErr?.message);
  if (insertErr) return;
  pass(`inserted category id ${inserted.id.slice(-8)}`);

  // Verify insert
  const { data: found } = await db.from("categories").select("name").eq("id", inserted.id).maybeSingle();
  check("category found in DB after insert", found?.name === "TEST CATEGORY",
    `got ${found?.name}`);

  // Update
  const { error: updateErr } = await db
    .from("categories")
    .update({ name: "TEST CATEGORY UPDATED" })
    .eq("id", inserted.id);

  check("category update succeeds", !updateErr, updateErr?.message);

  const { data: updated } = await db.from("categories").select("name").eq("id", inserted.id).maybeSingle();
  check("category name updated in DB", updated?.name === "TEST CATEGORY UPDATED",
    `got ${updated?.name}`);

  // Delete
  const { error: deleteErr } = await db.from("categories").delete().eq("id", inserted.id);
  check("category delete succeeds", !deleteErr, deleteErr?.message);

  const { data: gone } = await db.from("categories").select("id").eq("id", inserted.id).maybeSingle();
  check("category gone from DB after delete", !gone, "row still exists");
}
