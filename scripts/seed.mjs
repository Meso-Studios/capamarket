// Seeds the admin account, 4 test users, and demo markets with synthetic history.
// Idempotent for users (re-running resets nothing); demo markets are only added once.
// Usage: npm run db:seed            (users + demo markets)
//        npm run db:seed -- --no-demo  (users only)
import bcrypt from "bcryptjs";
import pg from "pg";

// Test accounts (email login). Passwords come from TEST_PASSWORD_<NAME> in .env.local.
const TEST_USERS = ["alice", "bob", "carol", "dave"].map((username) => ({
  username,
  email: `${username}@test.capamarket.local`,
  password: process.env[`TEST_PASSWORD_${username.toUpperCase()}`],
}));
for (const u of TEST_USERS) {
  if (!u.password || u.password.length < 12) throw new Error(`Set a 12+ char TEST_PASSWORD_${u.username.toUpperCase()} in .env.local`);
}

const DAY = 864e5;
const now = Date.now();

// [creator, title, category, description, monthsOld, startP, endP, resolved?: {outcome}]
const DEMO_MARKETS = [
  ["alice", "Will Democrats win control of the House in the 2026 midterms?", "General",
    "Resolves YES if the Democratic Party holds a majority of seats in the U.S. House of Representatives when the 120th Congress convenes, per official results.", 14, 0.69, 0.92],
  ["bob", "Will Bitcoin close above $150,000 on December 31, 2026?", "General",
    "Resolves YES if the BTC/USD daily close on Coinbase for Dec 31, 2026 (UTC) is above $150,000.", 9, 0.42, 0.18],
  ["carol", "Will a crewed Artemis mission orbit the Moon before July 2027?", "General",
    "Resolves YES if NASA confirms a crewed Artemis spacecraft has entered lunar orbit or completed a lunar flyby before July 1, 2027.", 7, 0.55, 0.71],
  ["dave", "Will the S&P 500 finish 2026 higher than it started?", "General",
    "Resolves YES if the S&P 500 closing value on the last trading day of 2026 is above its close on the last trading day of 2025.", 10, 0.6, 0.83],
  ["alice", "Will a fully driverless robotaxi service launch in London before 2028?", "General",
    "Resolves YES if a public, paid robotaxi service with no safety driver operates in Greater London before Jan 1, 2028.", 5, 0.35, 0.47],
  ["bob", "Will the Lakers make the 2027 NBA playoffs?", "General",
    "Resolves YES if the Los Angeles Lakers qualify for the first round of the 2027 NBA playoffs (play-in losses resolve NO).", 2, 0.5, 0.58],
  ["carol", "Will the CapaMarket beta launch before November 2026?", "General",
    "Demo market. Resolves YES if the beta is publicly reachable before Nov 1, 2026.", 6, 0.5, 0.81, { outcome: true }],
  ["dave", "Will the CapaMarket beta reach 100 signups in its first week?", "General",
    "Demo market. Resolves YES if 100+ accounts exist 7 days after launch.", 4, 0.55, 0.3, { outcome: false }],
  ["alice", "Will the admin verify at least 3 markets in October 2026?", "General",
    "Demo market. Resolves YES if 3+ markets are verified during October 2026.", 3, 0.5, 0.38, { outcome: true }],
];

// Deterministic PRNG so re-seeding a fresh DB gives the same charts.
let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

/** Stepped random walk from p0 to p1 that looks like a real market. */
function synthHistory(startT, endT, p0, p1) {
  const pts = [];
  const steps = 120 + Math.floor(rand() * 80);
  let drift = 0;
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const t = startT + f * (endT - startT) + (i && i < steps ? (rand() - 0.5) * ((endT - startT) / steps) : 0);
    drift = drift * 0.92 + (rand() - 0.5) * 0.05; // mean-reverting noise
    if (rand() < 0.03) drift += (rand() - 0.5) * 0.18; // occasional news shock
    const bridge = Math.sin(Math.PI * f); // noise vanishes at both ends
    const p = Math.min(0.97, Math.max(0.03, p0 + (p1 - p0) * f + drift * bridge));
    pts.push({ t: new Date(t), p });
  }
  pts[pts.length - 1].p = p1;
  return pts;
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

/**
 * Creates (or updates) a confirmed Supabase Auth email account. The on_auth_user_created
 * trigger in db/api.sql creates the matching profile row with the starting 10 credits.
 */
async function upsertUser({ username, email, password, isAdmin = false }) {
  const hash = await bcrypt.hash(password, 12);
  const existing = await client.query("select id from auth.users where email = $1", [email]);
  let id = existing.rows[0]?.id;
  if (id) {
    await client.query("update auth.users set encrypted_password = $1, updated_at = now() where id = $2", [hash, id]);
  } else {
    ({ rows: [{ id }] } = await client.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                               raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                               confirmation_token, recovery_token, email_change_token_new, email_change,
                               email_change_token_current, phone_change, phone_change_token, reauthentication_token)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', $1, $2, now(),
               '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', '')
       returning id`,
      [email, hash],
    ));
    await client.query(
      `insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
       values ($1::text, $1::uuid, jsonb_build_object('sub', $1::text, 'email', $2::text, 'email_verified', true), 'email', now(), now(), now())`,
      [id, email],
    );
  }
  await client.query("update users set username = $1, is_admin = $2, password_hash = null where id = $3", [username, isAdmin, id]);
  return { id };
}

async function ledger(userId, delta, reason, questionId) {
  await client.query("update users set credits = greatest(credits + $1, 0) where id = $2", [delta, userId]);
  await client.query("insert into credit_ledger (user_id, delta, reason, question_id) values ($1, $2, $3, $4)", [
    userId, delta, reason, questionId,
  ]);
}

const { ADMIN_EMAIL, ADMIN_USERNAME, ADMIN_PASSWORD } = process.env;
if (!ADMIN_EMAIL || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 16) {
  throw new Error("Set ADMIN_EMAIL and a 16+ char ADMIN_PASSWORD in .env.local");
}
await upsertUser({ username: ADMIN_USERNAME || "admin", email: ADMIN_EMAIL, password: ADMIN_PASSWORD, isAdmin: true });
console.log(`admin: ${ADMIN_EMAIL} (password in .env.local)`);

const ids = {};
for (const u of TEST_USERS) {
  ids[u.username] = (await upsertUser(u)).id;
  console.log(`test user: @${u.username} <${u.email}>`);
}

const haveDemo = (await client.query("select 1 from questions where is_demo limit 1")).rows.length > 0;
if (process.argv.includes("--no-demo") || haveDemo) {
  console.log(haveDemo ? "demo markets already present, skipped" : "demo markets skipped");
  await client.end();
  process.exit(0);
}

await client.query("begin");
for (const [creator, title, category, description, monthsOld, p0, p1, resolved] of DEMO_MARKETS) {
  const createdAt = new Date(now - monthsOld * 30 * DAY);
  const endT = resolved ? now - (2 + Math.floor(rand() * 10)) * DAY : now - 3 * DAY;
  const hist = synthHistory(createdAt.getTime(), endT, p0, p1);
  const total = 120 + Math.floor(rand() * 500); // crowd volume behind the synthetic history
  let yes = Math.round(total * p1);
  let no = total - yes;

  const { rows } = await client.query(
    `insert into questions (creator_id, title, description, category, created_at, is_demo, yes_votes, no_votes)
     values ($1, $2, $3, $4, $5, true, 0, 0) returning id`,
    [ids[creator], title, description, category, createdAt],
  );
  const qid = rows[0].id;
  await ledger(ids[creator], 1, "posted a question", qid);
  for (const h of hist) {
    await client.query("insert into price_history (question_id, yes_prob, created_at) values ($1, $2, $3)", [qid, h.p.toFixed(5), h.t]);
  }

  if (!resolved) {
    // Recent real votes from test users: a free vote each, some with stakes.
    let t = endT;
    for (const name of Object.keys(ids)) {
      if (rand() < 0.25) continue;
      t += (rand() * 2 + 0.2) * 36e5;
      const side = rand() < p1 + 0.1;
      const credits = rand() < 0.5 ? 1 + Math.floor(rand() * 3) : 0;
      const weight = 1 + credits;
      await client.query(
        `insert into votes (question_id, user_id, side, is_free, credits, weight, created_at)
         values ($1, $2, $3, true, $4, $5, $6)`,
        [qid, ids[name], side, credits, weight, new Date(t)],
      );
      if (credits) await ledger(ids[name], -credits, `staked ${side ? "YES" : "NO"}`, qid);
      if (side) yes += weight;
      else no += weight;
      await client.query("insert into price_history (question_id, yes_prob, created_at) values ($1, $2, $3)", [
        qid, (yes / (yes + no)).toFixed(5), new Date(t),
      ]);
    }
  }

  await client.query(
    `update questions set yes_votes = $1, no_votes = $2,
       status = $3, outcome = $4, final_yes_prob = $5, resolved_at = $6 where id = $7`,
    [
      yes, no,
      resolved ? "resolved" : "open",
      resolved ? resolved.outcome : null,
      resolved ? (yes / (yes + no)).toFixed(5) : null,
      resolved ? new Date(endT + DAY) : null,
      qid,
    ],
  );
  console.log(`demo market #${qid}: ${title}${resolved ? ` [verified ${resolved.outcome ? "YES" : "NO"}]` : ""}`);
}
await client.query("commit");
await client.end();
