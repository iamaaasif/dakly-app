-- Local and CI only. The app connects as dakly_app, which does not own the tables,
-- so row level security applies to it. Migrations run as the owner (dakly).
CREATE ROLE dakly_app LOGIN PASSWORD 'dakly_app';
GRANT CONNECT ON DATABASE dakly TO dakly_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dakly_app;
GRANT USAGE ON SCHEMA public TO dakly_app;
