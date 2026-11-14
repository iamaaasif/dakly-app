ALTER FUNCTION preserve_staff_user_identity() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION staff_conflicts_with_store(uuid,uuid) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION support_session_store(bytea,boolean) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION support_staff_grants(uuid) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION support_store_targets(text) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION seal_staff_audit_day() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION staff_audit_day_hash(date,bytea) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION stamp_staff_audit() SET search_path = pg_catalog, public, pg_temp;
