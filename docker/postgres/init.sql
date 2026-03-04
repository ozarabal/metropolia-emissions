-- =============================================================
-- METROPOLIA EMISSIONS DB — PostgreSQL Initialization
-- Runs automatically when the postgres container first starts.
-- SQLAlchemy also creates tables via Base.metadata.create_all(),
-- but this file sets up performance tuning and extensions.
-- =============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable trigram indexing (for fuzzy text search on origin/destination)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =============================================================
-- PERFORMANCE SETTINGS (applied at session level here,
-- set permanently in docker-compose command flags)
-- =============================================================

-- Create read-only reporting user (for Streamlit dashboard)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'metropolia_readonly') THEN
        CREATE ROLE metropolia_readonly WITH LOGIN PASSWORD 'readonly123';
    END IF;
END
$$;

GRANT CONNECT ON DATABASE emissions_db TO metropolia_readonly;
GRANT USAGE ON SCHEMA public TO metropolia_readonly;

-- Grant read access to all current and future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT ON TABLES TO metropolia_readonly;