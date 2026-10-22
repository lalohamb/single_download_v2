import { expect, test } from "@playwright/test";

// SEO regression checks (M2 Phase 5). The checks live in scripts/seo-smoke.mjs
// so the same suite can run after a deploy without Playwright.
type SeoResult = { name: string; status: "PASS" | "FAIL" | "SKIP"; detail: string };

test.describe("SEO regression", () => {
  test.setTimeout(180_000);

  test("crawl, index and structured-data checks", async ({ baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "HTTP-level checks; run once");
    const { runSeoChecks } = await import("../scripts/seo-smoke.mjs");
    const local = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(baseURL!);
    const results: SeoResult[] = await runSeoChecks(baseURL!, { local, draftId: process.env.SEO_DRAFT_PRODUCT_ID || null });

    for (const r of results) test.info().annotations.push({ type: r.status, description: `${r.name}${r.detail ? ` — ${r.detail}` : ""}` });
    expect(results.filter((r) => r.status === "FAIL"), "failed SEO checks").toEqual([]);
  });
});
