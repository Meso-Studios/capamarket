-- CapaMarket browser API.
--
-- The static site (GitHub Pages) talks to Supabase directly with the public key, so
-- every table is locked (RLS on, no grants; see schema.sql) and the browser can only
-- call the security-definer functions below. Each one checks auth.uid() itself.
-- Idempotent: safe to run more than once.

-- ───────────── profiles follow Supabase Auth ─────────────

create or replace function public._on_auth_user_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into users (id, email) values (new.id, lower(new.email)) on conflict do nothing;
  if found then
    insert into credit_ledger (user_id, delta, reason) values (new.id, 10, 'starting balance');
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public._on_auth_user_created();

-- ───────────── internal helpers (not callable from the browser) ─────────────

create or replace function public._user() returns users
language sql stable security definer set search_path = public as $$
  select * from users where id = auth.uid() and disabled_at is null
$$;

create or replace function public._require_user() returns users
language plpgsql stable security definer set search_path = public as $$
declare u users;
begin
  u := _user();
  if u.id is null then raise exception 'Log in first.'; end if;
  if u.username is null then raise exception 'Pick a username first.'; end if;
  return u;
end $$;

create or replace function public._require_admin() returns users
language plpgsql stable security definer set search_path = public as $$
declare u users;
begin
  u := _require_user();
  if not u.is_admin then raise exception 'Admins only.'; end if;
  return u;
end $$;

create or replace function public._is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from users where id = auth.uid() and disabled_at is null), false)
$$;

create or replace function public._ledger(p_user uuid, p_delta int, p_reason text, p_question int) returns void
language sql security definer set search_path = public as $$
  update users set credits = greatest(credits + p_delta, 0) where id = p_user;
  insert into credit_ledger (user_id, delta, reason, question_id) values (p_user, p_delta, p_reason, p_question);
$$;

create or replace function public._elo(p_user uuid, p_delta int, p_kind text, p_reason text, p_question int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_delta = 0 then return; end if;
  update users set elo = elo + p_delta where id = p_user;
  insert into elo_ledger (user_id, delta, kind, reason, question_id) values (p_user, p_delta, p_kind, p_reason, p_question);
end $$;

create or replace function public._yes_prob(p_yes int, p_no int) returns numeric
language sql immutable as $$
  select case when p_yes + p_no = 0 then 0.5 else p_yes::numeric / (p_yes + p_no) end
$$;

-- ───────────── session / profile ─────────────

create or replace function public.get_me() returns json
language plpgsql stable security definer set search_path = public as $$
declare u users;
begin
  if auth.uid() is null then return null; end if;
  select * into u from users where id = auth.uid();
  if u.id is null then return null; end if;
  if u.disabled_at is not null then
    return json_build_object('disabled', true, 'reason', u.disabled_reason);
  end if;
  return json_build_object(
    'id', u.id, 'email', u.email, 'username', u.username, 'credits', u.credits, 'elo', u.elo,
    'is_admin', u.is_admin, 'disabled', false,
    'notices', (select coalesce(json_agg(json_build_object('id', id, 'kind', kind, 'message', message, 'elo_delta', elo_delta) order by created_at), '[]')
                  from user_notices where user_id = u.id and read_at is null),
    'open_reports', case when u.is_admin
                      then (select count(distinct question_id) from reports where status = 'open') else 0 end
  );
end $$;

create or replace function public.claim_username(p_username text) returns void
language plpgsql security definer set search_path = public as $$
declare u users; name text := lower(trim(p_username));
begin
  u := _user();
  if u.id is null then raise exception 'Log in first.'; end if;
  if name !~ '^[a-z0-9_]{3,20}$' then raise exception 'Username: 3–20 chars, a–z, 0–9 or _.'; end if;
  if exists (select 1 from users where username = name and id <> u.id) then raise exception 'That username is taken.'; end if;
  update users set username = name where id = u.id;
end $$;

create or replace function public.acknowledge_notices() returns void
language sql security definer set search_path = public as $$
  update user_notices set read_at = now() where user_id = auth.uid() and read_at is null;
$$;

create or replace function public.get_my_profile() returns json
language plpgsql stable security definer set search_path = public as $$
declare u users;
begin
  u := _require_user();
  return json_build_object(
    'positions', (
      select coalesce(json_agg(p order by p.last_vote desc), '[]') from (
        select q.id, q.title, q.status, q.outcome, q.yes_votes, q.no_votes,
               coalesce(sum(v.weight) filter (where v.side), 0) yes,
               coalesce(sum(v.weight) filter (where not v.side), 0) no,
               sum(v.credits) staked, coalesce(sum(v.payout), 0) payout, max(v.created_at) last_vote
          from votes v join questions q on q.id = v.question_id
         where v.user_id = u.id group by q.id) p),
    'ledger', (
      select coalesce(json_agg(l), '[]') from (
        select delta, reason, question_id, created_at from credit_ledger
         where user_id = u.id order by created_at desc, id desc limit 50) l)
  );
end $$;

-- ───────────── markets (public reads) ─────────────

create or replace function public.list_markets(p_tab text default 'open', p_sort text default 'hot', p_cat text default null)
returns json
language plpgsql stable security definer set search_path = public as $$
declare admin boolean := _is_admin(); tab text := case when p_tab = 'resolved' then 'resolved' else 'open' end;
begin
  return (
    select coalesce(json_agg(m), '[]') from (
      select q.id, q.title, q.category, q.status, q.outcome, q.yes_votes, q.no_votes, q.closes_at, q.created_at, q.is_demo,
             case when admin then u.username end username,
             (select count(distinct user_id) from votes v where v.question_id = q.id) voters
        from questions q join users u on u.id = q.creator_id
       where q.status = tab and (p_cat is null or q.category = p_cat)
       order by
         case when tab = 'resolved' then extract(epoch from q.resolved_at) end desc nulls last,
         case when tab = 'open' and p_sort = 'new' then extract(epoch from q.created_at) end desc nulls last,
         case when tab = 'open' and p_sort = 'closing' then extract(epoch from q.closes_at) end asc nulls last,
         q.yes_votes + q.no_votes desc
       limit 100) m
  );
end $$;

create or replace function public.get_market(p_id int) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  admin boolean := _is_admin();
  q record;
begin
  select qq.*, u.username into q from questions qq join users u on u.id = qq.creator_id where qq.id = p_id;
  if q.id is null or (q.status = 'removed' and not admin) then return null; end if;

  return json_build_object(
    'question', json_build_object(
      'id', q.id, 'title', q.title, 'description', q.description, 'category', q.category, 'status', q.status,
      'outcome', q.outcome, 'yes_votes', q.yes_votes, 'no_votes', q.no_votes, 'final_yes_prob', q.final_yes_prob,
      'removed_reason', q.removed_reason, 'closes_at', q.closes_at, 'resolved_at', q.resolved_at,
      'created_at', q.created_at, 'username', case when admin then q.username end),
    'history', (select coalesce(json_agg(json_build_array(floor(extract(epoch from created_at) * 1000), yes_prob) order by created_at), '[]')
                  from price_history where question_id = p_id),
    'stakes', (select json_build_object(
                 'yes', coalesce(sum(credits) filter (where side), 0),
                 'no', coalesce(sum(credits) filter (where not side), 0),
                 'traders', count(distinct user_id)) from votes where question_id = p_id),
    -- Posts are anonymous: only admins see who traded; everyone sees their own votes as "you".
    'activity', (select coalesce(json_agg(a), '[]') from (
                   select case when admin then '@' || u.username when v.user_id = me then 'you' else 'anon' end who,
                          v.side, v.weight, v.credits, v.bonus, v.payout, v.created_at
                     from votes v join users u on u.id = v.user_id
                    where v.question_id = p_id order by v.created_at desc limit 25) a),
    'mine', case when me is null then null else (
              select json_build_object(
                'n', count(*), 'free', count(*) filter (where is_free),
                'yes', coalesce(sum(weight) filter (where side), 0),
                'no', coalesce(sum(weight) filter (where not side), 0),
                'staked', coalesce(sum(credits), 0), 'payout', coalesce(sum(payout), 0))
                from votes where question_id = p_id and user_id = me) end,
    'reports', case when admin then (
                 select coalesce(json_agg(r order by r.created_at), '[]') from (
                   select r.reason, r.details, u.username, r.created_at
                     from reports r join users u on u.id = r.reporter_id
                    where r.question_id = p_id and r.status = 'open') r) else '[]' end,
    'reported', me is not null and exists (select 1 from reports where question_id = p_id and reporter_id = me)
  );
end $$;

create or replace function public.get_leaderboard() returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(r), '[]') from (
    select u.id, u.username, u.elo,
           coalesce(sum(v.credits) filter (where q.status = 'resolved' and v.side = q.outcome), 0) hit,
           coalesce(sum(v.credits) filter (where q.status = 'resolved' and v.side <> q.outcome), 0) miss,
           count(distinct v.question_id) filter (where q.status = 'resolved' and v.credits > 0) markets,
           (select coalesce(-sum(delta), 0) from elo_ledger e where e.user_id = u.id and e.kind = 'fine') fines
      from users u
      left join votes v on v.user_id = u.id
      left join questions q on q.id = v.question_id
     where u.username is not null and not u.is_admin and u.disabled_at is null
     group by u.id
     order by u.elo desc, u.created_at asc
     limit 200) r
$$;

create or replace function public.get_about() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'n', count(*),
    'correct', count(*) filter (where (final_yes_prob > 0.5 and outcome) or (final_yes_prob < 0.5 and not outcome)),
    'brier', avg(power(final_yes_prob - case when outcome then 1 else 0 end, 2)),
    'recent', (select coalesce(json_agg(r), '[]') from (
                 select id, title, outcome, final_yes_prob, resolved_at from questions
                  where status = 'resolved' order by resolved_at desc limit 20) r))
  from questions where status = 'resolved'
$$;

-- ───────────── markets (writes) ─────────────

create or replace function public.create_question(p_title text, p_description text, p_category text, p_closes_at timestamptz)
returns int
language plpgsql security definer set search_path = public as $$
declare
  u users := _require_user();
  title text := trim(p_title);
  descr text := coalesce(trim(p_description), '');
  cat text := case when p_category in ('General', 'Teachers', 'Students', 'Classes', 'District', 'Education City', 'Gossip', 'Snow Days')
                   then p_category else 'General' end;
  qid int;
begin
  if length(title) < 10 or length(title) > 200 then raise exception 'Question must be 10–200 characters.'; end if;
  if right(title, 1) <> '?' then raise exception 'Phrase it as a yes/no question ending in “?”.'; end if;
  if length(descr) > 2000 then raise exception 'Resolution criteria must be under 2000 characters.'; end if;
  if p_closes_at is not null and p_closes_at < now() then raise exception 'Close date must be in the future.'; end if;

  insert into questions (creator_id, title, description, category, closes_at)
  values (u.id, title, descr, cat, p_closes_at) returning id into qid;
  insert into price_history (question_id, yes_prob) values (qid, 0.5);
  perform _ledger(u.id, 1, 'posted a question', qid);
  return qid;
end $$;

create or replace function public.cast_vote(p_question_id int, p_side boolean, p_credits int) returns json
language plpgsql security definer set search_path = public as $$
declare
  u users := _require_user();
  bal int;
  q questions;
  n int;
  free int;
  use_free boolean;
  bonus int := 0;
  weight int;
  c int := coalesce(p_credits, 0);
begin
  if c < 0 then raise exception 'Bad request.'; end if;
  select credits into bal from users where id = u.id for update;
  select * into q from questions where id = p_question_id for update;
  if q.id is null or q.status <> 'open' then raise exception 'This market is not open.'; end if;
  if q.closes_at is not null and q.closes_at < now() then raise exception 'Voting has closed.'; end if;

  select count(*), count(*) filter (where is_free) into n, free from votes where question_id = q.id and user_id = u.id;
  use_free := free = 0;
  if not use_free and c < 1 then raise exception 'Free vote used — add at least 1 credit.'; end if;
  if c > bal then raise exception 'You only have % credits.', bal; end if;

  -- Bonus roll: once per market, on a user's first vote in it (1 in 5 → +5 credits).
  if n = 0 and floor(random() * 5) = 0 then bonus := 5; end if;
  weight := c + case when use_free then 1 else 0 end;

  insert into votes (question_id, user_id, side, is_free, credits, weight, bonus)
  values (q.id, u.id, p_side, use_free, c, weight, bonus);
  if c > 0 then perform _ledger(u.id, -c, 'staked ' || case when p_side then 'YES' else 'NO' end, q.id); end if;
  if bonus > 0 then perform _ledger(u.id, bonus, 'lucky vote bonus', q.id); end if;

  update questions
     set yes_votes = yes_votes + case when p_side then weight else 0 end,
         no_votes = no_votes + case when p_side then 0 else weight end
   where id = q.id
   returning * into q;
  insert into price_history (question_id, yes_prob) values (q.id, _yes_prob(q.yes_votes, q.no_votes));
  return json_build_object('weight', weight, 'bonus', bonus);
end $$;

create or replace function public.report_question(p_question_id int, p_reason text, p_details text) returns void
language plpgsql security definer set search_path = public as $$
declare
  u users := _require_user();
  reason text := case when p_reason in ('Spam', 'Not verifiable', 'Abusive or hateful', 'Duplicate', 'Other') then p_reason else 'Other' end;
begin
  if not exists (select 1 from questions where id = p_question_id and status = 'open') then
    raise exception 'This market can''t be reported.';
  end if;
  insert into reports (question_id, reporter_id, reason, details)
  values (p_question_id, u.id, reason, left(coalesce(p_details, ''), 500))
  on conflict (question_id, reporter_id) do nothing;
  if not found then raise exception 'You already reported this market.'; end if;
end $$;

-- ───────────── admin ─────────────

create or replace function public.admin_overview() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  perform _require_admin();
  return json_build_object(
    'reports', (select coalesce(json_agg(r), '[]') from (
      select r.question_id, q.title, q.creator_id, u.username creator, count(*) n,
             array_agg(distinct r.reason) reasons, array_remove(array_agg(r.details), '') details, max(r.created_at) last
        from reports r join questions q on q.id = r.question_id join users u on u.id = q.creator_id
       where r.status = 'open'
       group by r.question_id, q.title, q.creator_id, u.username
       order by count(*) desc, max(r.created_at) desc) r),
    'open', (select coalesce(json_agg(m), '[]') from (
      select q.id, q.title, q.yes_votes, q.no_votes, q.created_at, u.username,
             (select coalesce(sum(credits), 0) from votes v where v.question_id = q.id) staked
        from questions q join users u on u.id = q.creator_id
       where q.status = 'open' order by q.created_at asc) m),
    'closed', (select coalesce(json_agg(m), '[]') from (
      select q.id, q.title, q.status, q.outcome, q.removed_reason,
             (select coalesce(sum(credits), 0) from votes v where v.question_id = q.id) staked
        from questions q
       where q.status <> 'open' order by coalesce(q.resolved_at, q.created_at) desc limit 30) m)
  );
end $$;

create or replace function public.admin_remove(p_id int, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare q questions; s record;
begin
  perform _require_admin();
  select * into q from questions where id = p_id for update;
  if q.id is null or q.status <> 'open' then return; end if;
  -- Refund every stake, and take back the creator's posting credit.
  for s in select user_id, sum(credits)::int credits from votes where question_id = p_id and credits > 0 group by user_id loop
    perform _ledger(s.user_id, s.credits, 'refund: market removed', p_id);
  end loop;
  perform _ledger(q.creator_id, -1, 'posting credit revoked: market removed', p_id);
  update questions set status = 'removed', removed_reason = coalesce(nullif(trim(p_reason), ''), 'Violates posting protocol') where id = p_id;
  update reports set status = 'actioned' where question_id = p_id and status = 'open';
end $$;

/**
 * Verify the real-world outcome. The pool of staked credits is split among stakers on
 * the winning side in proportion to their stake (free votes pay nothing); rounding dust
 * goes to the largest winning stake. If nobody staked on the winning side, all stakes
 * are refunded. ELO: +1 per credit on the verified side, -1 per credit on the other.
 */
create or replace function public.admin_verify(p_id int, p_outcome boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  q questions;
  pool int;
  win_stake int;
  top_id int;
  v record;
  pay int;
begin
  perform _require_admin();
  select * into q from questions where id = p_id for update;
  if q.id is null or q.status <> 'open' then return; end if;

  select coalesce(sum(credits), 0), coalesce(sum(credits) filter (where side = p_outcome), 0)
    into pool, win_stake from votes where question_id = p_id and credits > 0;
  select id into top_id from votes where question_id = p_id and credits > 0 and side = p_outcome
   order by credits desc, id asc limit 1;

  for v in select id, side, credits from votes where question_id = p_id and credits > 0 loop
    pay := case when win_stake = 0 then v.credits
                when v.side = p_outcome then floor(v.credits::numeric * pool / win_stake)
                else 0 end;
    update votes set payout = pay where id = v.id;
  end loop;
  if win_stake > 0 then
    update votes set payout = payout + (pool - (select sum(payout) from votes where question_id = p_id and credits > 0))
     where id = top_id;
  end if;

  for v in select user_id, sum(payout)::int pay from votes where question_id = p_id and credits > 0 group by user_id having sum(payout) > 0 loop
    perform _ledger(v.user_id, v.pay,
      case when win_stake = 0 then 'refund: no winning stakes' else 'payout: verified ' || case when p_outcome then 'YES' else 'NO' end end, p_id);
  end loop;
  for v in select user_id, sum(case when side = p_outcome then credits else -credits end)::int delta
             from votes where question_id = p_id and credits > 0 group by user_id loop
    perform _elo(v.user_id, v.delta, 'result', 'market verified', p_id);
  end loop;

  update questions set status = 'resolved', outcome = p_outcome, final_yes_prob = _yes_prob(yes_votes, no_votes), resolved_at = now()
   where id = p_id;
  update reports set status = 'dismissed' where question_id = p_id and status = 'open';
end $$;

create or replace function public.admin_dismiss_reports(p_id int) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _require_admin();
  update reports set status = 'dismissed' where question_id = p_id and status = 'open';
end $$;

create or replace function public.admin_list_users(p_q text default '') returns json
language plpgsql stable security definer set search_path = public as $$
declare s text := lower(trim(coalesce(p_q, '')));
begin
  perform _require_admin();
  return (select coalesce(json_agg(r), '[]') from (
    select u.id, u.username, u.email, u.credits, u.elo, u.is_admin, u.disabled_at, u.created_at,
           (select count(*) from questions x where x.creator_id = u.id) posts,
           (select count(*) from questions x where x.creator_id = u.id and x.status = 'removed') removed,
           (select count(*) from reports r join questions x on x.id = r.question_id where x.creator_id = u.id) reports,
           (select count(*) from user_notices n where n.user_id = u.id and n.kind = 'warning') warnings,
           (select coalesce(-sum(delta), 0) from elo_ledger e where e.user_id = u.id and e.kind = 'fine') fines
      from users u
     where s = '' or u.username like '%' || s || '%' or u.email like '%' || s || '%'
     order by u.disabled_at is not null,
              (select count(*) from reports r join questions x on x.id = r.question_id where x.creator_id = u.id) desc,
              u.created_at desc) r);
end $$;

create or replace function public.admin_get_user(p_id uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare u users;
begin
  perform _require_admin();
  select * into u from users where id = p_id;
  if u.id is null then return null; end if;
  return json_build_object(
    'user', json_build_object('id', u.id, 'username', u.username, 'email', u.email, 'credits', u.credits, 'elo', u.elo,
                              'is_admin', u.is_admin, 'disabled_at', u.disabled_at, 'disabled_reason', u.disabled_reason,
                              'created_at', u.created_at),
    'posts', (select coalesce(json_agg(p), '[]') from (
                select q.id, q.title, q.status, q.created_at, (select count(*) from reports r where r.question_id = q.id) reports
                  from questions q where q.creator_id = p_id order by q.created_at desc limit 50) p),
    'notices', (select coalesce(json_agg(n), '[]') from (
                  select kind, message, elo_delta, read_at, created_at from user_notices
                   where user_id = p_id order by created_at desc) n),
    'elo', (select coalesce(json_agg(e), '[]') from (
              select delta, kind, reason, question_id, created_at from elo_ledger
               where user_id = p_id order by created_at desc limit 30) e)
  );
end $$;

create or replace function public._target_user(p_id uuid) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare admin users := _require_admin();
begin
  if not exists (select 1 from users where id = p_id and not is_admin) or p_id = admin.id then
    raise exception 'Invalid target user.';
  end if;
  return p_id;
end $$;

create or replace function public.admin_warn(p_user uuid, p_message text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := _target_user(p_user); msg text := left(trim(coalesce(p_message, '')), 1000);
begin
  if msg = '' then raise exception 'Write the warning message.'; end if;
  insert into user_notices (user_id, kind, message) values (uid, 'warning', msg);
end $$;

create or replace function public.admin_fine(p_user uuid, p_amount int, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := _target_user(p_user); reason text := left(trim(coalesce(p_reason, '')), 500);
begin
  if p_amount is null or p_amount < 1 or p_amount > 1000 then raise exception 'Fine must be 1–1000 ELO.'; end if;
  if reason = '' then raise exception 'Give a reason for the fine.'; end if;
  perform _elo(uid, -p_amount, 'fine', 'admin fine: ' || reason, null);
  insert into user_notices (user_id, kind, message, elo_delta) values (uid, 'fine', reason, -p_amount);
end $$;

create or replace function public.admin_set_disabled(p_user uuid, p_disable boolean, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := _target_user(p_user); reason text := coalesce(nullif(left(trim(coalesce(p_reason, '')), 500), ''), 'Repeated abuse');
begin
  if p_disable then
    update users set disabled_at = now(), disabled_reason = reason where id = uid;
    insert into user_notices (user_id, kind, message) values (uid, 'disabled', reason);
    -- Also ban at the auth layer so they can't sign in or refresh a session.
    update auth.users set banned_until = now() + interval '100 years' where id = uid;
    delete from auth.sessions where user_id = uid;
  else
    update users set disabled_at = null, disabled_reason = null where id = uid;
    insert into user_notices (user_id, kind, message) values (uid, 'info', 'Your account was re-enabled.');
    update auth.users set banned_until = null where id = uid;
  end if;
end $$;

-- ───────────── permissions ─────────────
-- Nothing is callable by default; then open exactly the API surface.

revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

grant execute on function
  public.get_me(), public.list_markets(text, text, text), public.get_market(int),
  public.get_leaderboard(), public.get_about()
to anon, authenticated;

grant execute on function
  public.claim_username(text), public.acknowledge_notices(), public.get_my_profile(),
  public.create_question(text, text, text, timestamptz), public.cast_vote(int, boolean, int),
  public.report_question(int, text, text),
  public.admin_overview(), public.admin_remove(int, text), public.admin_verify(int, boolean),
  public.admin_dismiss_reports(int), public.admin_list_users(text), public.admin_get_user(uuid),
  public.admin_warn(uuid, text), public.admin_fine(uuid, int, text), public.admin_set_disabled(uuid, boolean, text)
to authenticated;

-- ───────────── link accounts created before Supabase Auth ─────────────
-- Same id and bcrypt hash, so existing users keep their passwords.

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change,
                        email_change_token_current, phone_change, phone_change_token, reauthentication_token,
                        is_sso_user, is_anonymous)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, u.password_hash, now(),
       '{"provider":"email","providers":["email"]}', '{}', u.created_at, now(),
       '', '', '', '', '', '', '', '', false, false
  from public.users u
 where u.password_hash is not null and not exists (select 1 from auth.users a where a.id = u.id);

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
       'email', now(), now(), now()
  from public.users u
 where exists (select 1 from auth.users a where a.id = u.id)
   and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email');

-- Disabled accounts are banned at the auth layer too.
update auth.users a set banned_until = now() + interval '100 years'
  from public.users u where u.id = a.id and u.disabled_at is not null and a.banned_until is null;

-- Passwords live in auth.users now; drop the duplicate hashes from profiles.
update public.users u set password_hash = null
 where u.password_hash is not null and exists (select 1 from auth.users a where a.id = u.id);
