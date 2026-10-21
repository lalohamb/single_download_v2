#!/usr/bin/env node
/**
 * scripts/compare-databases.js
 *
 * Compares two Supabase database schemas (dev vs prod) and reports differences.
 *
 * Usage:
 *   DEV_DB_URL="postgresql://postgres:<pw>@db.<dev-ref>.supabase.co:5432/postgres" \
 *   PROD_DB_URL="postgresql://postgres:<pw>@db.<prod-ref>.supabase.co:5432/postgres" \
 *   node scripts/compare-databases.js
 *
 * Get DB URLs from: Supabase Dashboard → Settings → Database → Connection string (URI)
 */

const { Client } = require("pg");

const DEV_URL  = process.env.DEV_DB_URL;
const PROD_URL = process.env.PROD_DB_URL;

if (!DEV_URL || !PROD_URL) {
  console.error("ERROR: Both DEV_DB_URL and PROD_DB_URL are required.");
  console.error("  export DEV_DB_URL=\"postgresql://postgres:<pw>@db.<dev-ref>.supabase.co:5432/postgres\"");
  console.error("  export PROD_DB_URL=\"postgresql://postgres:<pw>@db.<prod-ref>.supabase.co:5432/postgres\"");
  process.exit(1);
}

let diffs = 0;

function only(side, label) {
  console.log(`  [${side} ONLY]  ${label}`);
  diffs++;
}
function diff(label, devVal, prodVal) {
  console.log(`  [DIFF]       ${label}`);
  console.log(`               dev:  ${devVal}`);
  console.log(`               prod: ${prodVal}`);
  diffs++;
}
function same(label) {
  console.log(`  [=]          ${label}`);
}

async function query(client, sql, params = []) {
  const { rows } = await client.query(sql, params);
  return rows;
}

async function getColumns(client) {
  return query(client, `
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);
}

async function getIndexes(client) {
  return query(client, `
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
    ORDER BY tablename, indexname
  `);
}

async function getRLS(client) {
  return query(client, `
    SELECT relname AS table_name, relrowsecurity AS rls_enabled
    FROM pg_class
    WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
    ORDER BY relname
  `);
}

async function getPolicies(client) {
  return query(client, `
    SELECT tablename, policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname
  `);
}

async function getViews(client) {
  return query(client, `
    SELECT viewname, definition
    FROM pg_views
    WHERE schemaname = 'public'
    ORDER BY viewname
  `);
}

async function getFunctions(client) {
  return query(client, `
    SELECT p.proname AS name, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
    ORDER BY p.proname
  `);
}

async function getMigrations(client) {
  try {
    return await query(client, `
      SELECT version FROM supabase_migrations.schema_migrations ORDER BY version
    `);
  } catch {
    return null; // table may not exist
  }
}

function compareByKey(devRows, prodRows, keyFn, labelFn, compareFn) {
  const devMap  = new Map(devRows.map((r) => [keyFn(r), r]));
  const prodMap = new Map(prodRows.map((r) => [keyFn(r), r]));

  const allKeys = new Set([...devMap.keys(), ...prodMap.keys()]);
  for (const key of [...allKeys].sort()) {
    const d = devMap.get(key);
    const p = prodMap.get(key);
    if (!p) { only("DEV", labelFn(d)); continue; }
    if (!d) { only("PROD", labelFn(p)); continue; }
    compareFn(key, d, p);
  }
}

async function main() {
  const dev  = new Client({ connectionString: DEV_URL });
  const prod = new Client({ connectionString: PROD_URL });

  await Promise.all([dev.connect(), prod.connect()]);
  console.log("Connected to both databases.\n");

  const [
    devCols, prodCols,
    devIdx,  prodIdx,
    devRLS,  prodRLS,
    devPol,  prodPol,
    devViews,prodViews,
    devFuncs,prodFuncs,
    devMig,  prodMig,
  ] = await Promise.all([
    getColumns(dev),   getColumns(prod),
    getIndexes(dev),   getIndexes(prod),
    getRLS(dev),       getRLS(prod),
    getPolicies(dev),  getPolicies(prod),
    getViews(dev),     getViews(prod),
    getFunctions(dev), getFunctions(prod),
    getMigrations(dev),getMigrations(prod),
  ]);

  // ── Migrations ────────────────────────────────────────────────────────────
  console.log("── Migrations ────────────────────────────────────────────────");
  if (!devMig || !prodMig) {
    console.log("  (schema_migrations table not accessible on one or both DBs)\n");
  } else {
    const devMigSet  = new Set(devMig.map((r) => r.version));
    const prodMigSet = new Set(prodMig.map((r) => r.version));
    const allMig = new Set([...devMigSet, ...prodMigSet]);
    let migDiff = false;
    for (const v of [...allMig].sort()) {
      if (!prodMigSet.has(v)) { only("DEV", `migration: ${v}`); migDiff = true; }
      else if (!devMigSet.has(v)) { only("PROD", `migration: ${v}`); migDiff = true; }
    }
    if (!migDiff) console.log("  [=] All migrations match");
  }

  // ── Tables & Columns ──────────────────────────────────────────────────────
  console.log("\n── Tables & Columns ──────────────────────────────────────────");

  // Group columns by table
  const groupByTable = (rows) => {
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.table_name)) map.set(r.table_name, []);
      map.get(r.table_name).push(r);
    }
    return map;
  };

  const devTables  = groupByTable(devCols);
  const prodTables = groupByTable(prodCols);
  const allTables  = new Set([...devTables.keys(), ...prodTables.keys()]);

  for (const table of [...allTables].sort()) {
    const dCols = devTables.get(table);
    const pCols = prodTables.get(table);
    if (!pCols) { only("DEV", `table: ${table}`); continue; }
    if (!dCols) { only("PROD", `table: ${table}`); continue; }

    compareByKey(
      dCols, pCols,
      (r) => r.column_name,
      (r) => `${table}.${r.column_name} (${r.data_type})`,
      (key, d, p) => {
        const label = `${table}.${key}`;
        if (d.data_type !== p.data_type) {
          diff(`${label} type`, d.data_type, p.data_type);
        } else if (d.is_nullable !== p.is_nullable) {
          diff(`${label} nullable`, d.is_nullable, p.is_nullable);
        } else if ((d.column_default || "") !== (p.column_default || "")) {
          diff(`${label} default`, d.column_default, p.column_default);
        } else {
          same(label);
        }
      }
    );
  }

  // ── Indexes ───────────────────────────────────────────────────────────────
  console.log("\n── Indexes ───────────────────────────────────────────────────");
  compareByKey(
    devIdx, prodIdx,
    (r) => r.indexname,
    (r) => `index: ${r.indexname} on ${r.tablename}`,
    (key, d, p) => {
      const norm = (s) => s.replace(/\s+/g, " ").trim();
      if (norm(d.indexdef) !== norm(p.indexdef)) {
        diff(`index: ${key}`, d.indexdef, p.indexdef);
      } else {
        same(`index: ${key}`);
      }
    }
  );

  // ── RLS ───────────────────────────────────────────────────────────────────
  console.log("\n── RLS Status ────────────────────────────────────────────────");
  compareByKey(
    devRLS, prodRLS,
    (r) => r.table_name,
    (r) => `RLS on ${r.table_name}: ${r.rls_enabled}`,
    (key, d, p) => {
      if (d.rls_enabled !== p.rls_enabled) {
        diff(`RLS: ${key}`, String(d.rls_enabled), String(p.rls_enabled));
      } else {
        same(`RLS: ${key} = ${d.rls_enabled}`);
      }
    }
  );

  // ── Policies ──────────────────────────────────────────────────────────────
  console.log("\n── RLS Policies ──────────────────────────────────────────────");
  compareByKey(
    devPol, prodPol,
    (r) => `${r.tablename}.${r.policyname}`,
    (r) => `policy: ${r.policyname} on ${r.tablename}`,
    (key, d, p) => {
      if (d.cmd !== p.cmd || (d.qual || "") !== (p.qual || "") || (d.with_check || "") !== (p.with_check || "")) {
        diff(`policy: ${key}`, JSON.stringify({ cmd: d.cmd, qual: d.qual }), JSON.stringify({ cmd: p.cmd, qual: p.qual }));
      } else {
        same(`policy: ${key}`);
      }
    }
  );

  // ── Views ─────────────────────────────────────────────────────────────────
  console.log("\n── Views ─────────────────────────────────────────────────────");
  compareByKey(
    devViews, prodViews,
    (r) => r.viewname,
    (r) => `view: ${r.viewname}`,
    (key, d, p) => {
      const norm = (s) => s.replace(/\s+/g, " ").trim();
      if (norm(d.definition) !== norm(p.definition)) {
        diff(`view: ${key}`, "(see dev)", "(see prod)");
      } else {
        same(`view: ${key}`);
      }
    }
  );

  // ── Functions ─────────────────────────────────────────────────────────────
  console.log("\n── Functions ─────────────────────────────────────────────────");
  compareByKey(
    devFuncs, prodFuncs,
    (r) => `${r.name}(${r.args})`,
    (r) => `function: ${r.name}(${r.args})`,
    (key) => same(`function: ${key}`)
  );

  // ── Summary ───────────────────────────────────────────────────────────────
  await Promise.all([dev.end(), prod.end()]);
  console.log(`\n${"─".repeat(60)}`);
  if (diffs === 0) {
    console.log("  ✓ No differences found — dev and prod schemas match.");
  } else {
    console.log(`  ${diffs} difference(s) found between dev and prod.`);
  }
  console.log(`${"─".repeat(60)}\n`);
  process.exit(diffs > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
