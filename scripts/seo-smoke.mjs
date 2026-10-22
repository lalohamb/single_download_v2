#!/usr/bin/env node
// SEO regression / post-deploy smoke checks (M2 roadmap Phase 5).
//
// Read-only GET requests against a running site. No dependencies (Node 18+).
//
//   node scripts/seo-smoke.mjs                          # https://bodyandsleeves.com
//   node scripts/seo-smoke.mjs https://staging.example  # another deployment
//   node scripts/seo-smoke.mjs http://127.0.0.1:3000 --local
//
// --local          skip host/protocol checks (www and http->https redirects) and
//                  map sitemap URLs onto the base URL (local site_url may differ)
// --draft-id <id>  also check a draft product (or set SEO_DRAFT_PRODUCT_ID). If
//                  unset, one is looked up through the public Supabase API when
//                  NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are set.
//
// Exits 1 if any check fails. Also imported by e2e/seo.spec.ts.

const UA = "bodyandsleeves-seo-smoke/1.0";
const MAX_FAVICON_BYTES = 100 * 1024;
const CONCURRENCY = 4;

async function get(url, { follow = false } = {}) {
  const res = await fetch(url, { redirect: follow ? "follow" : "manual", headers: { "User-Agent": UA } });
  const body = await res.text();
  return { status: res.status, headers: res.headers, body };
}

const metaRobots = (html) => [...html.matchAll(/<meta name="robots" content="([^"]*)"/g)].map((m) => m[1]);
const canonicalOf = (html) => html.match(/<link rel="canonical" href="([^"]*)"/)?.[1] ?? null;
const titleCount = (html) => (html.match(/<title>/g) || []).length;
const jsonLdBlocks = (html) =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => {
    try { return [JSON.parse(m[1])]; } catch { return []; }
  });
const jsonLdTypes = (html) =>
  jsonLdBlocks(html).flatMap((d) => (Array.isArray(d["@graph"]) ? d["@graph"] : [d])).map((n) => n["@type"]);
const stripSlash = (u) => u.replace(/\/$/, "");

async function pool(items, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (i < items.length) { const n = i++; out[n] = await fn(items[n]); }
  }));
  return out;
}

async function findDraftId() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const res = await fetch(`${url}/rest/v1/products?select=id&status=neq.active&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    const rows = await res.json();
    return Array.isArray(rows) && rows[0]?.id ? rows[0].id : null;
  } catch { return null; }
}

export async function runSeoChecks(baseUrl, { local = false, draftId = null } = {}) {
  const base = stripSlash(baseUrl);
  const origin = new URL(base).origin;
  const results = [];
  const check = async (name, fn) => {
    try {
      const r = await fn();
      results.push({ name, status: r?.skip ? "SKIP" : "PASS", detail: r?.skip || r?.detail || "" });
    } catch (e) {
      results.push({ name, status: "FAIL", detail: e.message });
    }
  };
  const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
  // Local site_url (e.g. localhost:3000) can differ from where the server runs.
  const toBase = (u) => (local ? base + new URL(u).pathname + new URL(u).search : u);

  // ── Host and protocol (production only) ──────────────────────────────────
  if (!local) {
    const host = new URL(base).host;
    await check("http redirects to https (301/308)", async () => {
      const r = await get(`http://${host}/`);
      assert([301, 308].includes(r.status), `status ${r.status}`);
      assert(stripSlash(r.headers.get("location") || "") === base, `location ${r.headers.get("location")}`);
    });
    if (!host.startsWith("www.")) {
      await check("www redirects to apex (SEO-002)", async () => {
        const r = await get(`https://www.${host}/shop`);
        assert([301, 308].includes(r.status), `www returned ${r.status} (expected 301 to ${base}/shop)`);
        assert(r.headers.get("location") === `${base}/shop`, `location ${r.headers.get("location")}`);
      });
    }
  }

  // ── robots.txt ────────────────────────────────────────────────────────────
  let sitemapUrl = `${base}/sitemap.xml`;
  await check("robots.txt rules", async () => {
    const r = await get(`${base}/robots.txt`);
    assert(r.status === 200, `status ${r.status}`);
    assert(!/^Disallow:\s*\/\s*$/im.test(r.body), "disallows the whole site");
    assert(/^Disallow:\s*\/api\/\s*$/im.test(r.body), "missing Disallow: /api/");
    assert(/^Allow:\s*\/api\/favicon\s*$/im.test(r.body), "favicon not allowed (SEO-003)");
    for (const p of ["/shop", "/product/"]) assert(!new RegExp(`^Disallow:\\s*${p}`, "im").test(r.body), `${p} is disallowed`);
    const declared = r.body.match(/^Sitemap:\s*(\S+)/im)?.[1];
    assert(declared && /^https?:\/\//.test(declared), "no absolute Sitemap: line");
    if (!local) assert(new URL(declared).origin === origin, `sitemap on another host: ${declared}`);
    sitemapUrl = toBase(declared);
  });

  // ── sitemap.xml ───────────────────────────────────────────────────────────
  let locs = [];
  await check("sitemap.xml format", async () => {
    const r = await get(sitemapUrl);
    assert(r.status === 200, `status ${r.status}`);
    locs = [...r.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    assert(locs.length > 0, "no URLs");
    assert(new Set(locs).size === locs.length, "duplicate URLs");
    assert(!/<changefreq>|<priority>/.test(r.body), "emits changefreq/priority (SEO-008)");
    assert(!r.body.includes("your-store.example"), "placeholder host present (SEO-007)");
    if (!local) {
      const foreign = locs.filter((u) => new URL(u).origin !== origin);
      assert(foreign.length === 0, `${foreign.length} URLs on another host, e.g. ${foreign[0]}`);
    }
    return { detail: `${locs.length} URLs` };
  });

  await check("sitemap URLs return 200, indexable, self-canonical", async () => {
    if (locs.length === 0) return { skip: "no sitemap URLs" };
    const problems = (await pool(locs, async (loc) => {
      const r = await get(toBase(loc));
      if (r.status !== 200) return `${loc}: status ${r.status}`;
      if (metaRobots(r.body).some((c) => /noindex/i.test(c)) || /noindex/i.test(r.headers.get("x-robots-tag") || "")) return `${loc}: noindex`;
      const canonical = canonicalOf(r.body);
      if (canonical && stripSlash(canonical) !== stripSlash(loc)) return `${loc}: canonical ${canonical}`;
      return null;
    })).filter(Boolean);
    assert(problems.length === 0, `${problems.length} problem(s): ${problems.slice(0, 5).join("; ")}`);
    return { detail: `${locs.length} URLs checked` };
  });

  // ── Pages ─────────────────────────────────────────────────────────────────
  await check("homepage: Organization/WebSite JSON-LD, no broken internal links", async () => {
    const r = await get(`${base}/`);
    assert(r.status === 200, `status ${r.status}`);
    const types = jsonLdTypes(r.body);
    assert(types.includes("Organization") && types.includes("WebSite"), `JSON-LD types: ${types.join(", ") || "none"}`);
    const hrefs = [...new Set([...r.body.matchAll(/<a [^>]*href="(\/[^"#]*)/g)].map((m) => m[1]).filter((h) => !h.startsWith("//")))];
    const bad = (await pool(hrefs, async (h) => {
      const s = (await get(base + h)).status;
      return s === 200 ? null : `${h} → ${s}`;
    })).filter(Boolean);
    assert(bad.length === 0, `links not returning 200: ${bad.join(", ")}`);
    return { detail: `${hrefs.length} internal links` };
  });

  await check("product page: native Product JSON-LD", async () => {
    const product = locs.find((u) => new URL(u).pathname.startsWith("/product/"));
    if (!product) return { skip: "no product in sitemap" };
    const r = await get(toBase(product));
    const blocks = jsonLdBlocks(r.body).filter((d) => d["@type"] === "Product");
    assert(blocks.length === 1, `found ${blocks.length} Product blocks in raw HTML (SEO-004)`);
    assert(blocks[0].offers?.price !== undefined && blocks[0].offers?.priceCurrency, "offer missing price/currency");
  });

  await check("legacy /shop?category= redirects to /shop/{slug}", async () => {
    const category = locs.map((u) => new URL(u).pathname).find((p) => /^\/shop\/[^/]+$/.test(p));
    if (!category) return { skip: "no category URL in sitemap" };
    const slug = category.split("/")[2];
    const r = await get(`${base}/shop?category=${slug}`);
    assert([301, 308].includes(r.status), `status ${r.status}`);
    assert(new URL(r.headers.get("location"), base).pathname === category, `location ${r.headers.get("location")}`);
  });

  await check("admin is noindexed (SEO-005)", async () => {
    for (const p of ["/admin", "/admin/dashboard"]) {
      const r = await get(base + p);
      assert(/noindex/i.test(r.headers.get("x-robots-tag") || ""), `${p} has no X-Robots-Tag noindex`);
    }
  });

  await check("missing pages are real 404s with one title", async () => {
    for (const p of ["/product/00000000-0000-0000-0000-000000000000", "/product/not-a-uuid", "/shop/seo-smoke-missing-category", "/seo-smoke-missing-page"]) {
      const r = await get(base + p);
      assert(r.status === 404, `${p} → ${r.status}`);
      assert(metaRobots(r.body).some((c) => /noindex/i.test(c)), `${p} has no noindex`);
      assert(titleCount(r.body) === 1, `${p} has ${titleCount(r.body)} <title> elements`);
    }
  });

  await check("favicon is small and crawlable", async () => {
    const r = await fetch(`${base}/api/favicon`, { headers: { "User-Agent": UA } });
    if (r.status === 404) return { skip: "no favicon configured" };
    assert(r.status === 200, `status ${r.status}`);
    const size = (await r.arrayBuffer()).byteLength;
    assert(size <= MAX_FAVICON_BYTES, `${size} bytes (limit ${MAX_FAVICON_BYTES})`);
    return { detail: `${size} bytes, ${r.headers.get("content-type")}` };
  });

  await check("draft product is noindexed and not purchasable (SEO-001)", async () => {
    const id = draftId || (await findDraftId());
    if (!id) return { skip: "no draft product id (use --draft-id or Supabase env vars)" };
    const r = await get(`${base}/product/${id}`);
    assert(r.status === 200 || r.status === 404, `status ${r.status}`);
    if (r.status === 404) return { detail: "returns 404" };
    assert(metaRobots(r.body).some((c) => /noindex/i.test(c)), "no noindex");
    assert(!jsonLdTypes(r.body).includes("Product"), "emits Product JSON-LD");
    assert(!r.body.includes("Add to Cart"), "shows Add to Cart");
  });

  return results;
}

// ── CLI ─────────────────────────────────────────────────────────────────────
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const args = process.argv.slice(2);
  const local = args.includes("--local");
  const draftIdx = args.indexOf("--draft-id");
  const draftId = draftIdx >= 0 ? args[draftIdx + 1] : process.env.SEO_DRAFT_PRODUCT_ID || null;
  const base = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--draft-id") || "https://bodyandsleeves.com";

  console.log(`SEO smoke checks → ${base}${local ? " (local)" : ""}\n`);
  const results = await runSeoChecks(base, { local, draftId });
  const icon = { PASS: "✔", FAIL: "✘", SKIP: "–" };
  for (const r of results) console.log(`${icon[r.status]} ${r.status.padEnd(4)} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
  const failed = results.filter((r) => r.status === "FAIL").length;
  console.log(`\n${results.length - failed} passed/skipped, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
