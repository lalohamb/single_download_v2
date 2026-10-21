// scripts/test-admin/tests/05-customers.js
// Tests: /api/admin/customers returns expected shape (read-only page).

import { api } from "../lib/client.js";
import { pass, fail, skip, check } from "../lib/assert.js";

export async function run() {
  console.log("\n── 05 Customers ──────────────────────────────────────");

  const { status, ok, json } = await api("/api/admin/customers");

  check("customers API returns 200", status === 200, `got ${status}`);
  check("customers response is array", Array.isArray(json), `got ${typeof json}`);

  if (Array.isArray(json) && json.length > 0) {
    const first = json[0];
    check("customer has email field", "email" in first, "missing email");
    check("customer has order_count field", "order_count" in first, "missing order_count");
    check("customer has total_spent field", "total_spent" in first, "missing total_spent");
  } else {
    pass("no customers yet — shape check skipped");
  }
}
