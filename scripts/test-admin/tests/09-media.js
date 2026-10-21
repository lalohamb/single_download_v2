// scripts/test-admin/tests/09-media.js
// Tests: upload a 1px PNG to storage → verify it appears → delete → verify gone.

import { db } from "../lib/client.js";
import { pass, fail, skip, check } from "../lib/assert.js";

const BUCKET = "store-images";
const TEST_PATH = `uploads/__test-${Date.now()}.png`;

// Minimal 1x1 transparent PNG (67 bytes)
const PNG_BYTES = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6260000000020001e221bc330000000049454e44ae426082",
  "hex"
);

export async function run() {
  console.log("\n── 09 Media ──────────────────────────────────────────");

  // Upload
  const { error: uploadErr } = await db.storage
    .from(BUCKET)
    .upload(TEST_PATH, PNG_BYTES, { contentType: "image/png", upsert: true });

  check("storage upload succeeds", !uploadErr, uploadErr?.message);
  if (uploadErr) return;

  // Verify it appears in list
  const { data: files, error: listErr } = await db.storage
    .from(BUCKET)
    .list("uploads", { search: `__test-` });

  check("storage list succeeds", !listErr, listErr?.message);
  const found = files?.some(f => TEST_PATH.endsWith(f.name));
  check("uploaded file appears in list", found, `files: ${files?.map(f => f.name).join(", ")}`);

  // Get public URL
  const { data: urlData } = db.storage.from(BUCKET).getPublicUrl(TEST_PATH);
  check("public URL generated", !!urlData?.publicUrl, "no URL returned");

  // Delete
  const { error: deleteErr } = await db.storage.from(BUCKET).remove([TEST_PATH]);
  check("storage delete succeeds", !deleteErr, deleteErr?.message);

  // Verify gone
  const { data: afterFiles } = await db.storage.from(BUCKET).list("uploads", { search: `__test-` });
  const stillThere = afterFiles?.some(f => TEST_PATH.endsWith(f.name));
  check("file gone after delete", !stillThere, "file still in list");
}
