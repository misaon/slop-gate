-- slop-gate telemetry, initial schema.
--
-- Run as the Neon owner role. The ingest function does NOT use that role — see 002_roles.sql.
--
-- `run` is the primary key rather than a generated id, and that is load-bearing rather than tidy:
-- with a client-supplied key the ingest function needs no `RETURNING` to link the two tables, so it
-- needs no `SELECT` privilege anywhere. A compromised endpoint can then write and read nothing.
--
-- Rows are kept raw rather than pre-aggregated so a poisoned window can be re-analysed or removed.
-- Not partitioned: at the expected volume an indexed `DELETE ... WHERE ingested_at BETWEEN` takes
-- milliseconds, and partition management is a moving part this does not need yet. Revisit past ~100M
-- rows. (I proposed partitioning before measuring the shape; this is the smaller thing that works.)

create table if not exists telemetry_report (
  run               uuid        primary key,
  ingested_at       timestamptz not null default now(),
  project           uuid,
  slop_gate         text        not null,
  node              text        not null,
  platform          text        not null,
  ci                boolean     not null,
  duration_ms       integer     not null,
  files_scanned     integer     not null,
  files_analysed    integer     not null,
  preset            text,
  baseline          boolean     not null,
  disabled_concepts text[]      not null default '{}'
);

comment on table telemetry_report is
  'One anonymous run. No paths, messages, code, package names or repository identifiers — see docs/telemetry.md.';
comment on column telemetry_report.project is
  'Random per checkout, derived from nothing. Not a hash of the repository: that would be reversible.';

create index if not exists telemetry_report_ingested_at on telemetry_report (ingested_at);
create index if not exists telemetry_report_project on telemetry_report (project);
create index if not exists telemetry_report_version on telemetry_report (slop_gate);

create table if not exists telemetry_rule (
  run        uuid    not null references telemetry_report (run) on delete cascade,
  rule       text    not null,
  findings   integer not null,
  suppressed integer not null,
  baselined  integer not null,
  generated  integer not null,
  primary key (run, rule)
);

comment on column telemetry_rule.suppressed is
  'Dropped by an inline `sgate-disable` or an `off` in config: the strongest false-positive signal.';

create index if not exists telemetry_rule_rule on telemetry_rule (rule);

-- Per-rule view. Counts *checkouts*, not findings, on purpose: summing findings would let one sender
-- with a large repository — or a hostile one with a generator — move any number on this page. A
-- checkout counts once however loud it is.
create or replace view telemetry_rule_summary as
select
  r.rule,
  count(distinct t.project) filter (where t.project is not null)              as checkouts,
  count(distinct t.project) filter (where r.suppressed > 0 and t.project is not null) as checkouts_suppressing,
  count(distinct t.project) filter (where r.findings > 0 and t.project is not null)   as checkouts_finding,
  sum(r.findings)                                                             as findings,
  sum(r.suppressed)                                                           as suppressed,
  sum(r.baselined)                                                            as baselined,
  min(t.ingested_at)                                                          as first_seen,
  max(t.ingested_at)                                                          as last_seen
from telemetry_rule r
join telemetry_report t using (run)
group by r.rule;

-- Concepts users turn off in their own config, which is the other half of the same signal.
create or replace view telemetry_disabled_summary as
select
  concept,
  count(distinct project) filter (where project is not null) as checkouts
from telemetry_report, unnest(disabled_concepts) as concept
group by concept;
