// scripts/test-admin/tests/14-danger-auth.js
// Tests: danger zone reset endpoint requires admin auth — never executes the reset.

import { check, skip } from "../lib/assert.js";
import { BASE_URL } from "../lib/client.js";

export async function run() {
  console.log("\n── 14 Danger Zone Auth ───────────────────────────────");

  // Call without any auth token — must return 401
  const res = await fetch(`${BASE_URL}/api/admin/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirm: "RESET" }),
  });

  check("danger reset returns 401 without auth", res.status === 401,
    `got ${res.status} — endpoint may be unprotected`);

  skip("danger reset with auth", "destructive — never execute in tests");
}
