# CapaMarket

Credit-only prediction markets (Kalshi/Polymarket style). No money in or out.
Credits have no cash value.

**Live:** https://meso-studios.github.io/capamarket/

## How it works

A static Next.js site (`output: "export"`) hosted on **GitHub Pages**, talking straight to
**Supabase** from the browser:

- **Supabase Auth** handles email/password and Google sign-in.
- **Every table is locked** (row-level security on, no grants to the public API roles).
- **The browser can only call the functions in [`db/api.sql`](db/api.sql)**. They're
  `security definer` Postgres functions that check `auth.uid()` and enforce every rule: credits,
  free votes, the bonus roll, payouts, ELO, anonymity and admin-only actions.

So the Supabase URL and **publishable** key in `src/lib/supabase.ts` are safe to ship in a
public site. Never put the `service_role`/secret key or the database password in the code.

## Run locally

Node lives in `~/.local/node` on this machine:

```bash
export PATH="$HOME/.local/node/bin:$PATH"
npm install
npm run dev          # http://localhost:3000
```

Database scripts (need `DATABASE_URL` etc. in `.env.local`; see `.env.example`):

```bash
npm run db:migrate     # apply db/schema.sql + db/api.sql (idempotent)
npm run db:seed        # admin + 4 test users (+ demo markets if none exist)
npm run db:clear-demo  # delete seeded demo markets
```

## Accounts

| Account | Where the credentials live |
|---|---|
| Admin (`admin@capamarket.local`) | `ADMIN_PASSWORD` in `.env.local` |
| Test users `alice`, `bob`, `carol`, `dave` (`<name>@test.capamarket.local`) | `TEST_PASSWORD_<NAME>` in `.env.local` |

`.env.local` is git-ignored. The test passwords were rotated when the repo went public.

## Deploy (GitHub Actions → GitHub Pages)

`.github/workflows/deploy.yml`:

- **Every PR:** type-check and build.
- **Every push to `main`:** build with base path `/<repo>`, run `db:migrate` if the optional
  `DATABASE_URL` secret is set, then publish `out/` to Pages.

Market pages are `/market/?id=…` (a static site can't pre-render every id).

## Supabase dashboard settings (one-time)

1. **Authentication → URL Configuration**
   - **Site URL:** `https://meso-studios.github.io/capamarket/`
   - **Redirect URLs:** `https://meso-studios.github.io/capamarket/**` and `http://localhost:3000/**`
2. **Email sign-up needs no confirmation email.** The sign-up form calls `sign_up` in
   [`db/api.sql`](db/api.sql), which creates an already-confirmed account, then logs in. The
   **Confirm email** setting and SMTP don't matter for it.
3. **Google sign-in**
   - Create an OAuth client (Web application) at https://console.cloud.google.com/apis/credentials
     with the authorized redirect URI `https://zbioxcjilzvyyrangsze.supabase.co/auth/v1/callback`.
   - Then turn on **Authentication → Sign In / Providers → Google** and paste in the client ID and secret.
   - New Google users pick a username on `/onboarding/`.

## Rules

- New accounts start with **10 credits**. Posting a question: **+1 credit**.
- **1 free vote** per user per market. Each credit staked = 1 extra vote.
- On a user's **first vote in a market**: 1 in 5 chance of **+5 credits**.
- **Verifying a market (admin):** all staked credits go to stakers on the winning side, split by
  stake size. If nobody staked on the winning side, every stake is refunded. Free votes move the
  odds but don't pay out.
- **Removing a market (admin):** for markets that break protocol. Stakes are refunded and the
  poster's +1 is taken back.
- **About tab:** "events predicted" counts verified markets. A market is a hit when the crowd's
  final YES% was on the correct side of 50%. Accuracy = hits ÷ events, and a Brier score is shown too.

## ELO

Everyone starts at 100. When a market is verified, each credit a user staked on the verified
side is +1 ELO and each credit on the other side is −1. Admin fines subtract ELO.
The leaderboard is at `/leaderboard/` and hides admins and disabled accounts.

## Moderation

- **Anonymous posts:** only the admin sees who created a market or who traded in it. Users see
  their own votes as "you".
- **Reports:** any signed-in user can **⚑ Report post** once per market. The admin gets a red
  badge in the nav and a reports queue on `/admin/`.
- **`/admin/users/`:** open a user to **warn** them (a banner they must acknowledge),
  **fine ELO**, or **disable** the account. Disabling bans them in Supabase Auth and signs them
  out; it can be undone.
