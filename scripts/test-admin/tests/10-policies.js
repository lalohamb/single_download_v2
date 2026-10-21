// scripts/test-admin/tests/10-policies.js
// Tests: upsert policy content → verify in DB → restore original.

import { db } from "../lib/client.js";
import { pass, fail, skip, check } from "../lib/assert.js";

export async function run() {
  console.log("\n── 10 Policies ───────────────────────────────────────");

  // Read current privacy policy
  const { data: original, error: readErr } = await db
    .from("policies")
    .select("id, content, locked")
    .eq("id", "privacy")
    .maybeSingle();

  if (readErr) { fail("policies read", readErr.message); return; }

  const originalContent = original?.content ?? null;
  const testContent = "<p>TEST POLICY CONTENT</p>";

  // Upsert test content
  const { error: upsertErr } = await db
    .from("policies")
    .upsert({ id: "privacy", title: "Privacy Policy", content: testContent, locked: false, updated_at: new Date().toISOString() });

  check("policy upsert succeeds", !upsertErr, upsertErr?.message);

  // Verify it landed
  const { data: after } = await db.from("policies").select("content").eq("id", "privacy").maybeSingle();
  check("policy content updated in DB", after?.content === testContent,
    `got: ${after?.content?.slice(0, 50)}`);

  // Restore
  if (originalContent !== null) {
    await db.from("policies").upsert({ id: "privacy", title: "Privacy Policy", content: originalContent, locked: original?.locked ?? false, updated_at: new Date().toISOString() });
    pass("policy content restored");
  } else {
    await db.from("policies").delete().eq("id", "privacy");
    pass("policy row removed (was not present before test)");
  }
}
