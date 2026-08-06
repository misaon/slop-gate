-- Two roles, neither of which is the owner.
--
-- The point is blast radius. The ingest endpoint is public and unauthenticated by necessity, so it is
-- the most likely thing to be compromised — and the role it runs as can write two tables and do
-- nothing else. Not read them, not delete from them, not see any other schema. A stolen ingest
-- credential is worth almost nothing.
--
-- Run as the Neon owner. Replace both passwords with generated ones and put the resulting connection
-- strings in Vercel as TELEMETRY_INGEST_URL and TELEMETRY_READ_URL. The owner's own DATABASE_URL is
-- for migrations only and must not be used at runtime.

-- ── write-only ────────────────────────────────────────────────────────────────────────────────────
create role telemetry_ingest with login password 'REPLACE_ME';

revoke all on schema public from telemetry_ingest;
grant usage on schema public to telemetry_ingest;
grant insert on telemetry_report, telemetry_rule to telemetry_ingest;

-- Deliberately no SELECT. The schema is shaped so insertion never needs to read: `run` is supplied by
-- the client, so linking the two tables needs no RETURNING.
-- Deliberately no UPDATE or DELETE: telemetry is append-only, and a compromised endpoint that can
-- rewrite history is worse than one that can only add to it.

-- ── read-only ─────────────────────────────────────────────────────────────────────────────────────
create role telemetry_read with login password 'REPLACE_ME_TOO';

revoke all on schema public from telemetry_read;
grant usage on schema public to telemetry_read;
grant select on telemetry_report, telemetry_rule to telemetry_read;
grant select on telemetry_rule_summary, telemetry_disabled_summary to telemetry_read;

-- Neither role inherits anything from a future table by accident.
alter default privileges in schema public revoke all on tables from telemetry_ingest, telemetry_read;
