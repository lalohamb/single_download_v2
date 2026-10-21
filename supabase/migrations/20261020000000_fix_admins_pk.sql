-- Migration: 20261020000000_fix_admins_pk.sql
-- GAP-001: decouple admins PK from auth.uid()
-- Adds auth_user_id column, migrates existing rows, updates all RLS policies.
-- IMPORTANT: Run this during a maintenance window. All admin sessions remain
-- valid — requireAdmin() will be updated to query by auth_user_id.

-- Step 1: add auth_user_id column, populate from existing id (which was auth.uid())
ALTER TABLE admins ADD COLUMN IF NOT EXISTS auth_user_id uuid;
UPDATE admins SET auth_user_id = id WHERE auth_user_id IS NULL;
ALTER TABLE admins ALTER COLUMN auth_user_id SET NOT NULL;
ALTER TABLE admins ADD CONSTRAINT admins_auth_user_id_unique UNIQUE (auth_user_id);

-- Step 2: add independent PK column
-- Cannot drop/replace PK directly — add new column, backfill, swap
ALTER TABLE admins ADD COLUMN IF NOT EXISTS new_id uuid DEFAULT gen_random_uuid();
UPDATE admins SET new_id = gen_random_uuid() WHERE new_id IS NULL;

-- Step 3: drop old PK constraint, promote new_id
ALTER TABLE admins DROP CONSTRAINT admins_pkey;
ALTER TABLE admins RENAME COLUMN id TO old_auth_id;
ALTER TABLE admins RENAME COLUMN new_id TO id;
ALTER TABLE admins ADD PRIMARY KEY (id);

-- Step 4: drop the old auth_id column (now redundant — auth_user_id holds it)
ALTER TABLE admins DROP COLUMN IF EXISTS old_auth_id CASCADE;

-- Step 5: update all RLS policies to use auth_user_id instead of id
-- admins table policies
DROP POLICY IF EXISTS "auth_read_admins" ON admins;
CREATE POLICY "auth_read_admins" ON admins FOR SELECT
  TO authenticated USING (auth_user_id = auth.uid());

DROP POLICY IF EXISTS "super_admin_insert_admins" ON admins;
CREATE POLICY "super_admin_insert_admins" ON admins FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM admins a WHERE a.auth_user_id = auth.uid() AND a.role = 'super_admin')
  );

DROP POLICY IF EXISTS "super_admin_delete_admins" ON admins;
CREATE POLICY "super_admin_delete_admins" ON admins FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM admins a WHERE a.auth_user_id = auth.uid() AND a.role = 'super_admin')
  );

-- products policies
DROP POLICY IF EXISTS "admin_insert_products" ON products;
CREATE POLICY "admin_insert_products" ON products FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM admins WHERE admins.auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "admin_update_products" ON products;
CREATE POLICY "admin_update_products" ON products FOR UPDATE
  TO authenticated
  USING     (EXISTS (SELECT 1 FROM admins WHERE admins.auth_user_id = auth.uid()))
  WITH CHECK(EXISTS (SELECT 1 FROM admins WHERE admins.auth_user_id = auth.uid()));

DROP POLICY IF EXISTS "admin_delete_products" ON products;
CREATE POLICY "admin_delete_products" ON products FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM admins WHERE admins.auth_user_id = auth.uid())
  );

-- orders policies
DROP POLICY IF EXISTS "admin_read_orders" ON orders;
CREATE POLICY "admin_read_orders" ON orders FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM admins WHERE admins.auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "admin_update_orders" ON orders;
CREATE POLICY "admin_update_orders" ON orders FOR UPDATE
  TO authenticated
  USING     (EXISTS (SELECT 1 FROM admins WHERE admins.auth_user_id = auth.uid()))
  WITH CHECK(EXISTS (SELECT 1 FROM admins WHERE admins.auth_user_id = auth.uid()));

DROP POLICY IF EXISTS "admin_delete_orders" ON orders;
CREATE POLICY "admin_delete_orders" ON orders FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM admins WHERE admins.auth_user_id = auth.uid())
  );

-- settings policies
DROP POLICY IF EXISTS "admin_update_settings" ON settings;
CREATE POLICY "admin_update_settings" ON settings FOR UPDATE
  TO authenticated
  USING     (EXISTS (SELECT 1 FROM admins WHERE admins.auth_user_id = auth.uid()))
  WITH CHECK(EXISTS (SELECT 1 FROM admins WHERE admins.auth_user_id = auth.uid()));

DROP POLICY IF EXISTS "admin_insert_settings" ON settings;
CREATE POLICY "admin_insert_settings" ON settings FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM admins WHERE admins.auth_user_id = auth.uid())
  );

-- Recreate index on auth_user_id for RLS performance
CREATE INDEX IF NOT EXISTS idx_admins_auth_user_id ON admins(auth_user_id);
