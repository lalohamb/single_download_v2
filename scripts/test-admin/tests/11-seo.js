// scripts/test-admin/tests/11-seo.js
// Tests: GET /api/seo returns shape; POST writes a field and DB confirms it landed.

import { api } from "../lib/client.js";
import { db } from "../lib/client.js";
import { pass, fail, skip, check } from "../lib/assert.js";

export async function run() {
  console.log("\n── 11 SEO ────────────────────────────────────────────");

  // GET
  const { status: getStatus, json: getJson } = await api("/api/seo");
  check("GET /api/seo returns 200", getStatus === 200, `got ${getStatus}`);
  check("seo response has site_url", "site_url" in getJson, `keys: ${Object.keys(getJson).join(", ")}`);

  const originalSuffix = getJson.meta_title_suffix ?? "";

  // POST — write a test value via the API route (same path as the admin UI)
  const testSuffix = `| TEST ${Date.now()}`;
  const { status: postStatus, json: postJson } = await api("/api/seo", {
    method: "POST",
    body: JSON.stringify({ meta_title_suffix: testSuffix }),
  });

  check("POST /api/seo returns 200", postStatus === 200, `got ${postStatus}: ${JSON.stringify(postJson)}`);

  // Verify via service role DB read — confirms it actually landed
  const { data: seoRow } = await db.from("seo_settings").select("meta_title_suffix").limit(1).maybeSingle();
  check("meta_title_suffix written to seo_settings table", seoRow?.meta_title_suffix === testSuffix,
    `DB has: ${seoRow?.meta_title_suffix}`);

  // Restore
  await api("/api/seo", {
    method: "POST",
    body: JSON.stringify({ meta_title_suffix: originalSuffix }),
  });
  pass("meta_title_suffix restored");
}
