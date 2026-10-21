// scripts/test-admin/tests/13-settings-writes.js
// Tests every settings section write:
//   1. Write a known test value to settings table (same as useSettings.save())
//   2. Read it back from settings table via service role — confirms write landed
//   3. Read it back from settings_public view — confirms view exposes it
//   4. Restore original value
//
// This is the core test for the about_settings / view permissions issue.

import { db } from "../lib/client.js";
import { pass, fail, skip, check } from "../lib/assert.js";

async function testSettingsField(rowId, field, testValue, label) {
  // Read original
  const { data: orig } = await db.from("settings").select(field).eq("id", rowId).maybeSingle();
  const original = orig?.[field] ?? null;

  // Write via service role (same table useSettings.save() writes to)
  const { error: writeErr } = await db
    .from("settings")
    .update({ [field]: testValue, updated_at: new Date().toISOString() })
    .eq("id", rowId);

  if (writeErr) {
    fail(`${label} — write`, writeErr.message);
    return;
  }

  // Verify in settings table
  const { data: afterTable } = await db.from("settings").select(field).eq("id", rowId).maybeSingle();
  const tableVal = typeof testValue === "object"
    ? JSON.stringify(afterTable?.[field])
    : afterTable?.[field];
  const tableExpected = typeof testValue === "object"
    ? JSON.stringify(testValue)
    : testValue;

  check(`${label} — landed in settings table`, tableVal == tableExpected,
    `table has: ${JSON.stringify(afterTable?.[field])?.slice(0, 80)}`);

  // Verify in settings_public view
  const { data: afterView, error: viewErr } = await db
    .from("settings_public")
    .select(field)
    .eq("id", rowId)
    .maybeSingle();

  if (viewErr) {
    fail(`${label} — view read`, viewErr.message);
  } else {
    const viewVal = typeof testValue === "object"
      ? JSON.stringify(afterView?.[field])
      : afterView?.[field];
    check(`${label} — visible in settings_public view`, viewVal == tableExpected,
      `view has: ${JSON.stringify(afterView?.[field])?.slice(0, 80)}`);
  }

  // Restore
  await db.from("settings").update({ [field]: original }).eq("id", rowId);
}

export async function run() {
  console.log("\n── 13 Settings Writes ────────────────────────────────");

  const { data: row, error } = await db
    .from("settings")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (error || !row) { fail("settings row exists", error?.message ?? "no row"); return; }
  const id = row.id;
  pass(`settings row id: ${id}`);

  // ── Flat column sections ──────────────────────────────────────────────────

  // Store Information / Branding
  await testSettingsField(id, "store_name", "__TEST_STORE__", "store_name (StoreInformation/Branding)");
  await testSettingsField(id, "tagline", "__TEST_TAGLINE__", "tagline");
  await testSettingsField(id, "logo_url", "https://example.com/test-logo.png", "logo_url");

  // Homepage Hero
  await testSettingsField(id, "hero_title", "__TEST_HERO_TITLE__", "hero_title (HomepageHero)");
  await testSettingsField(id, "hero_image_url", "https://example.com/test-hero.jpg", "hero_image_url");
  await testSettingsField(id, "hero_gradient_opacity", 55, "hero_gradient_opacity");

  // Our Why
  await testSettingsField(id, "our_why_label", "__TEST_OUR_WHY__", "our_why_label (OurWhy)");
  await testSettingsField(id, "our_why_image_url", "https://example.com/test-why.jpg", "our_why_image_url");

  // Wear Your Story
  await testSettingsField(id, "story_image_url", "https://example.com/test-story.jpg", "story_image_url (WearYourStory)");

  // Footer
  await testSettingsField(id, "footer_text", "__TEST_FOOTER__", "footer_text (Footer)");
  await testSettingsField(id, "footer_bottom_message", "__TEST_FOOTER_BOTTOM__", "footer_bottom_message");

  // Announcements
  await testSettingsField(id, "announcement", "__TEST_ANNOUNCEMENT__", "announcement (Announcements)");
  await testSettingsField(id, "announcement_active", true, "announcement_active");

  // Social
  await testSettingsField(id, "social_links",
    { instagram: { url: "https://instagram.com/test", enabled: true } },
    "social_links (Social)");

  // ── JSONB column sections ─────────────────────────────────────────────────

  // About Hero — THE KEY TEST
  console.log("\n  [About sections — testing about_settings jsonb column]");
  await testSettingsField(id, "about_settings",
    { heroImageUrl: "https://example.com/test-about-hero.jpg", heroTitle: "TEST TITLE" },
    "about_settings.heroImageUrl (AboutHero)");

  // Affirmations (HomepageHero marquee)
  await testSettingsField(id, "affirmations_settings",
    { active: true, phrases: ["__TEST_PHRASE__"], backgroundColor: "#000000", textColor: "#ffffff", accentColor: "#gold" },
    "affirmations_settings (HomepageHero marquee)");

  // New Arrivals
  await testSettingsField(id, "new_arrivals_settings",
    { eyebrow: "__TEST_EYEBROW__", dropLabel: "__TEST_DROP__", shopButtonLabel: "Shop", viewAllLabel: "View All", backgroundColor: "#ffffff", textColor: "#000000", accentColor: "#gold", showAccent: true },
    "new_arrivals_settings (NewArrivals)");

  // Brand Values
  await testSettingsField(id, "brand_values_settings",
    { values: [{ stat: "100%", label: "TEST", sub: "test sub", icon: "✨", enabled: true }], backgroundColor: "#ffffff", textColor: "#000000", accentColor: "#gold", advanced: false, columns: 3, alignment: "center", divider: "none", padding: "comfortable", backgroundImage: "", cardBackgroundColor: "#ffffff", cardBorderColor: "#eeeeee", dividerColor: "#eeeeee", animate: false },
    "brand_values_settings (BrandValues)");

  // Feature Strip
  await testSettingsField(id, "feature_strip_settings",
    { active: true, items: [{ icon: "✨", title: "TEST", desc: "test desc", enabled: true }], backgroundColor: "#ffffff", textColor: "#000000", accentColor: "#gold" },
    "feature_strip_settings (FeatureStrip)");

  // Site Menu
  await testSettingsField(id, "site_menu_settings",
    { backgroundColor: "#111111", textColor: "#ffffff", fontFamily: "sans", fontSize: "medium", fontWeight: "medium", letterSpacing: "normal", categorySlugs: [] },
    "site_menu_settings (AdminMenu)");

  // Newsletter Popup
  await testSettingsField(id, "popup_settings",
    { active: false, title: "__TEST_POPUP__", delay: 3, dismissDays: 7, body: "test", ctaLabel: "Subscribe", position: "right", bgColor: "#111111" },
    "popup_settings (NewsletterPopup)");

  // Customer Love (testimonials)
  await testSettingsField(id, "testimonials",
    [{ quote: "__TEST_QUOTE__", name: "Test User", location: "Test City", product: "Test Product" }],
    "testimonials (CustomerLove)");
}
