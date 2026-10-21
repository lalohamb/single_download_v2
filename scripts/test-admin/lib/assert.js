// scripts/test-admin/lib/assert.js

let passed = 0;
let failed = 0;
let skipped = 0;
const failures = [];

export function pass(label) {
  console.log(`  ✅ PASS  ${label}`);
  passed++;
}

export function fail(label, reason) {
  console.log(`  ❌ FAIL  ${label}`);
  console.log(`         ${reason}`);
  failed++;
  failures.push({ label, reason });
}

export function skip(label, reason) {
  console.log(`  ⏭  SKIP  ${label} — ${reason}`);
  skipped++;
}

export function check(label, condition, failReason) {
  if (condition) pass(label);
  else fail(label, failReason ?? "condition was false");
}

export function summary() {
  console.log("\n" + "─".repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  if (failures.length) {
    console.log("\nFailed tests:");
    failures.forEach(f => console.log(`  • ${f.label}: ${f.reason}`));
  }
  console.log("─".repeat(60));
  return failed === 0;
}
