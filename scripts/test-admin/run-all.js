#!/usr/bin/env node
// scripts/test-admin/run-all.js
// Usage:
//   node --env-file=.env.local --experimental-vm-modules scripts/test-admin/run-all.js
// Or with .env.prod:
//   node --env-file=.env.prod --experimental-vm-modules scripts/test-admin/run-all.js
//
// Pass admin credentials as env vars:
//   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=yourpass node --env-file=.env.local scripts/test-admin/run-all.js
//
// Requires local dev server running on http://localhost:3007

import { signInAdmin } from "./lib/client.js";
import { summary } from "./lib/assert.js";

import { run as run01 } from "./tests/01-dashboard.js";
import { run as run02 } from "./tests/02-orders.js";
import { run as run03 } from "./tests/03-products.js";
import { run as run04 } from "./tests/04-categories.js";
import { run as run05 } from "./tests/05-customers.js";
import { run as run06 } from "./tests/06-affiliates.js";
import { run as run07 } from "./tests/07-email.js";
import { run as run08 } from "./tests/08-mailerlite.js";
import { run as run09 } from "./tests/09-media.js";
import { run as run10 } from "./tests/10-policies.js";
import { run as run11 } from "./tests/11-seo.js";
import { run as run12 } from "./tests/12-shipping.js";
import { run as run13 } from "./tests/13-settings-writes.js";
import { run as run14 } from "./tests/14-danger-auth.js";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("\nMissing ADMIN_EMAIL or ADMIN_PASSWORD env vars.");
  console.error("Run as: ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=yourpass node --input-type=module scripts/test-admin/run-all.js\n");
  process.exit(1);
}

console.log("═".repeat(60));
console.log("  Admin Panel Test Suite");
console.log("  Target: http://localhost:3007");
console.log("═".repeat(60));

try {
  process.stdout.write("\nSigning in as admin... ");
  await signInAdmin(ADMIN_EMAIL, ADMIN_PASSWORD);
  console.log("✅\n");
} catch (e) {
  console.error(`\n❌ Sign-in failed: ${e.message}`);
  process.exit(1);
}

const tests = [
  run01, run02, run03, run04, run05, run06, run07,
  run08, run09, run10, run11, run12, run13, run14,
];

for (const test of tests) {
  try {
    await test();
  } catch (e) {
    console.log(`  ❌ FAIL  Uncaught error: ${e.message}`);
  }
}

const allPassed = summary();
process.exit(allPassed ? 0 : 1);
