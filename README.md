# CapaMarket

Credit-only prediction markets (Kalshi/Polymarket style). No money in or out.
Credits have no cash value.

Stack: Next.js 15 (App Router, server actions) · PostgreSQL (Supabase) · `pg` · bcrypt sessions.

## Run

Node lives in `~/.local/node` on this machine:

```bash
export PATH="$HOME/.local/node/bin:$PATH"
npm install
npm run db:migrate   # apply db/schema.sql (idempotent)
npm run db:seed      # admin + 4 test users + demo markets
npm run dev          # http://localhost:3000
```

`npm run db:clear-demo` deletes the seeded demo markets (refunding any stakes on them).

## Accounts

| Account | Where the credentials live |
|---|---|
| Admin (`admin@capamarket.local`) | `ADMIN_PASSWORD` in `.env.local` (generated, 28 chars) |
| Test users `alice`, `bob`, `carol`, `dave` | `TEST_USERS` in `scripts/seed.mjs` |

Change or delete the test users before going live.

## Google sign-in

1. Create an OAuth client (Web application) at https://console.cloud.google.com/apis/credentials
2. Authorized redirect URI: `http://localhost:3000/api/auth/google/callback` (plus your prod URL)
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env.local`, then restart.

New Google users pick a username on `/onboarding`. A Google login with an email that
already has an email/password account is linked to it.

## Rules

- New accounts start with **10 credits**. Posting a question: **+1 credit**.
- **1 free vote** per user per market. Each credit staked = 1 extra vote.
- On a user's **first vote in a market**: 1 in 5 chance of **+5 credits**.
- Admin **verifies** the outcome. All staked credits in that market go to stakers on the
  winning side, split by stake size. If nobody staked on the winning side, every stake is refunded.
  Free votes move the odds but don't pay out.
- Admin **removes** markets that break protocol. Stakes are refunded and the poster's +1 is taken back.
- About tab: events predicted = verified markets. A market counts as a hit when the crowd's final
  YES% was on the correct side of 50%. Accuracy = hits / events. Brier score is also shown.

## ELO

Everyone starts at 100. When a market is verified, each credit a user staked on the
verified side is +1 ELO and each credit on the other side is -1. Admin fines subtract ELO.
Leaderboard: `/leaderboard` (admins and disabled accounts are hidden).

## Moderation

- Posts are anonymous: only the admin sees who created a market or who traded in it
  (users see their own votes as "you").
- Any signed-in user can **⚑ Report post** once per market. The admin gets a red badge in the nav,
  a reports queue on `/admin`, and an email to `ADMIN_NOTIFY_EMAIL`.
- `/admin/users` → open a user to **warn** (banner they must acknowledge), **fine ELO**, or
  **disable** the account (signs them out everywhere and blocks login; reversible).

## Admin 2-step verification

**Currently off.** Set `ADMIN_2FA=on` (in `.env.local` / Vercel) to turn it back on.

When on, admin logins (email or Google) need a 6-digit code emailed to `ADMIN_NOTIFY_EMAIL`
(default `pittsburghtornadoes@gmail.com`). Codes expire in 10 minutes, with 5 attempts per code.
Only sessions created after the code is verified carry admin rights.

Email goes out over SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`).
For Gmail: turn on 2-Step Verification for the sending account, create an App Password at
https://myaccount.google.com/apppasswords, and use `smtp.gmail.com` / `465` / that password.
**With 2FA on and no SMTP, local dev prints the code in the dev server console; production refuses admin login.**

## Deploy (GitHub Actions → Vercel)

GitHub Pages only hosts static files, and this app needs a server (logins, votes, admin, email),
so `.github/workflows/deploy.yml` deploys to Vercel instead:

- every PR: type-check + build + preview deploy
- every push to `main`: type-check + build → `npm run db:migrate` → production deploy

One-time setup:

1. Push this folder to a GitHub repo (`.env.local` is git-ignored, so keep it that way).
2. Create a Vercel project from the repo, or run `npx vercel link` locally. Copy `orgId` and
   `projectId` from `.vercel/project.json`.
3. GitHub repo → Settings → Secrets and variables → Actions → add `VERCEL_TOKEN`
   (https://vercel.com/account/tokens), `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `DATABASE_URL`.
4. Vercel project → Settings → Environment Variables: everything in `.env.example`.
   Use the **transaction pooler (port 6543)** for `DATABASE_URL` there, set `APP_URL` to the
   production URL, and fill in the SMTP vars.
5. Add `<APP_URL>/api/auth/google/callback` to the Google OAuth client's redirect URIs.

`vercel.json` turns off Vercel's own Git auto-deploys so that the workflow is the only deployer
(migrations always run first).

## Database

`DATABASE_URL` uses Supabase's **IPv4 session pooler** (`aws-0-us-east-1.pooler.supabase.com`,
user `postgres.<project-ref>`), because `db.<ref>.supabase.co` is IPv6-only and this network can't reach it.
The password is URL-encoded in the URL (`#` → `%23`, `&` → `%26`).
