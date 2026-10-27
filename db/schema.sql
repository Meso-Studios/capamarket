-- CapaMarket schema. Idempotent: safe to run more than once.

create extension if not exists pgcrypto;

create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  username      text unique,
  password_hash text,
  google_id     text unique,
  credits       integer not null default 10 check (credits >= 0),
  is_admin      boolean not null default false,
  created_at    timestamptz not null default now()
);

create table if not exists sessions (
  token_hash text primary key,
  user_id    uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists sessions_user_idx on sessions(user_id);

create table if not exists questions (
  id             serial primary key,
  creator_id     uuid not null references users(id) on delete cascade,
  title          text not null,
  description    text not null default '',
  category       text not null default 'General',
  closes_at      timestamptz,
  status         text not null default 'open' check (status in ('open', 'resolved', 'removed')),
  outcome        boolean,
  yes_votes      integer not null default 0,
  no_votes       integer not null default 0,
  final_yes_prob numeric(6, 5),
  removed_reason text,
  resolved_at    timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists questions_status_idx on questions(status, created_at desc);

-- One row per vote action. weight = 1 for the free vote, otherwise = credits staked.
create table if not exists votes (
  id          serial primary key,
  question_id integer not null references questions(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  side        boolean not null,           -- true = YES, false = NO
  is_free     boolean not null default false,
  credits     integer not null default 0 check (credits >= 0),
  weight      integer not null check (weight > 0),
  bonus       integer not null default 0,
  payout      integer,
  created_at  timestamptz not null default now()
);
create index if not exists votes_question_idx on votes(question_id);
create index if not exists votes_user_idx on votes(user_id);
create unique index if not exists votes_one_free_per_question
  on votes(question_id, user_id) where is_free;

-- YES probability after every change, drives the timeline chart.
create table if not exists price_history (
  id          serial primary key,
  question_id integer not null references questions(id) on delete cascade,
  yes_prob    numeric(6, 5) not null,
  created_at  timestamptz not null default now()
);
create index if not exists price_history_q_idx on price_history(question_id, created_at);

-- Every credit movement, for the profile page.
create table if not exists credit_ledger (
  id          serial primary key,
  user_id     uuid not null references users(id) on delete cascade,
  delta       integer not null,
  reason      text not null,
  question_id integer references questions(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists credit_ledger_user_idx on credit_ledger(user_id, created_at desc);

-- Demo markets created by `npm run db:seed` (removable with `npm run db:clear-demo`).
alter table questions add column if not exists is_demo boolean not null default false;

-- ───────── v2: ELO, moderation, admin 2FA ─────────

alter table users add column if not exists elo integer not null default 100;
alter table users add column if not exists disabled_at timestamptz;
alter table users add column if not exists disabled_reason text;

-- Admin sessions only carry admin rights once the emailed code was verified.
alter table sessions add column if not exists mfa_verified boolean not null default false;

-- kind: 'result' (+1 per credit on the verified side, -1 per credit on the other) or 'fine'.
create table if not exists elo_ledger (
  id          serial primary key,
  user_id     uuid not null references users(id) on delete cascade,
  delta       integer not null,
  kind        text not null check (kind in ('result', 'fine', 'adjust')),
  reason      text not null,
  question_id integer references questions(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists elo_ledger_user_idx on elo_ledger(user_id, created_at desc);

create table if not exists reports (
  id          serial primary key,
  question_id integer not null references questions(id) on delete cascade,
  reporter_id uuid not null references users(id) on delete cascade,
  reason      text not null,
  details     text not null default '',
  status      text not null default 'open' check (status in ('open', 'dismissed', 'actioned')),
  created_at  timestamptz not null default now(),
  unique (question_id, reporter_id)
);
create index if not exists reports_status_idx on reports(status, created_at desc);

-- Warnings and fines sent by the admin; shown to the user until acknowledged.
create table if not exists user_notices (
  id         serial primary key,
  user_id    uuid not null references users(id) on delete cascade,
  kind       text not null check (kind in ('warning', 'fine', 'disabled', 'info')),
  message    text not null,
  elo_delta  integer not null default 0,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists user_notices_user_idx on user_notices(user_id, created_at desc);

create table if not exists login_challenges (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  code_hash   text not null,
  attempts    integer not null default 0,
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);

-- Backfill ELO results for markets verified before ELO existed, then derive
-- every balance from the ledger (idempotent).
insert into elo_ledger (user_id, delta, kind, reason, question_id)
select v.user_id,
       sum(case when v.side = q.outcome then v.credits else -v.credits end)::int,
       'result', 'market verified', q.id
  from votes v join questions q on q.id = v.question_id
 where q.status = 'resolved' and v.credits > 0
   and not exists (select 1 from elo_ledger e where e.question_id = q.id and e.kind = 'result')
 group by v.user_id, q.id;
update users u set elo = 100 + coalesce((select sum(delta) from elo_ledger e where e.user_id = u.id), 0);

-- v3: school-focused categories; posts in retired categories move to General.
update questions set category = 'General'
 where category not in ('General', 'Teachers', 'Students', 'Classes', 'District', 'Education City', 'Gossip', 'Snow Days');
