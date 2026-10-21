-- GAP-002: atomic admin row insert via security-definer function
-- Called by the app after auth.admin.inviteUserByEmail() succeeds.
-- Using a security-definer function means the insert runs with elevated
-- privileges and is not subject to RLS, eliminating the need for the
-- service-role client to bypass RLS directly from application code.
-- If this insert fails, the caller (manage/route.ts) still performs the
-- compensating auth.admin.deleteUser() cleanup.

CREATE OR REPLACE FUNCTION insert_admin_row(
  p_auth_user_id uuid,
  p_email        text,
  p_role         text DEFAULT 'admin'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'invalid role: %', p_role;
  END IF;
  INSERT INTO admins (auth_user_id, email, role)
  VALUES (p_auth_user_id, p_email, p_role);
END;
$$;

-- Only service role may call this function
REVOKE ALL ON FUNCTION insert_admin_row(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION insert_admin_row(uuid, text, text) TO service_role;
