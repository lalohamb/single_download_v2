// scripts/test-admin/tests/08-mailerlite.js
// Tests: /api/mailerlite?action=groups returns array.

import { api } from "../lib/client.js";
import { pass, fail, skip, check } from "../lib/assert.js";

export async function run() {
  console.log("\n── 08 MailerLite ─────────────────────────────────────");

  const { status, ok, json } = await api("/api/mailerlite?action=groups");

  if (status === 401) { fail("mailerlite auth", "401 — admin token not accepted"); return; }
  if (status === 500) { skip("mailerlite groups", "MailerLite API key not configured"); return; }

  check("mailerlite groups returns 200", status === 200, `got ${status}`);
  check("mailerlite groups returns array", Array.isArray(json), `got ${typeof json}: ${JSON.stringify(json).slice(0, 100)}`);
}
