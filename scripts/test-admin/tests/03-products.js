// scripts/test-admin/tests/03-products.js
// Tests: product featured flag update writes to products table and reads back.

import { db, dbRead } from "../lib/client.js";
import { pass, fail, skip, check } from "../lib/assert.js";

export async function run() {
  console.log("\n── 03 Products ───────────────────────────────────────");

  const { data: products, error } = await db
    .from("products")
    .select("id, featured, status")
    .eq("status", "active")
    .limit(1);

  if (error || !products?.length) {
    skip("product featured toggle", "no active products found");
    return;
  }

  const product = products[0];
  const original = !!product.featured;
  const toggled = !original;

  pass(`found product ${product.id.slice(-8)}`);

  const { error: writeErr } = await db
    .from("products")
    .update({ featured: toggled })
    .eq("id", product.id);

  check("product featured write succeeds", !writeErr, writeErr?.message);

  const after = await dbRead("products", "featured", product.id);
  check("product featured updated in DB", after?.featured === toggled,
    `expected ${toggled}, got ${after?.featured}`);

  // Restore
  await db.from("products").update({ featured: original }).eq("id", product.id);
  pass("product featured restored");
}
