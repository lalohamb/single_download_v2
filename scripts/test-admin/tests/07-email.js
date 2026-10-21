// scripts/test-admin/tests/07-email.js
// Tests: /api/admin/email-settings GET returns expected shape.
// Skips write test — would require a real Resend API key.

import { api } from "../lib/client.js";
import { pass, fail, skip, check } from "../lib/assert.js";

export async function run() {
  console.log("\n── 07 Email ──────────────────────────────────────────");

  const { status, ok, json } = await api("/api/admin/email-settings");

  check("email-settings API returns 200", status === 200, `got ${status}: ${JSON.stringify(json)}`);
  check("response has resend_api_key_saved field", "resend_api_key_saved" in json,
    `got keys: ${Object.keys(json).join(", ")}`);
  check("response has email_from field", "email_from" in json,
    `got keys: ${Object.keys(json).join(", ")}`);

  skip("email-settings write test", "would overwrite live Resend API key");
}
