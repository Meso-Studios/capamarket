"use server";

import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PoolClient } from "pg";
import { one, query, tx } from "@/lib/db";
import {
  createSession,
  destroySession,
  getCurrentUser,
  normalizeUsername,
  requireAdmin,
  requireUser,
  USERNAME_RE,
} from "@/lib/auth";
import { CATEGORIES, REPORT_REASONS, yesProb } from "@/lib/format";
import { ADMIN_EMAIL, sendMail } from "@/lib/mail";
import { ADMIN_2FA_ENABLED, checkAdminChallenge, pendingChallengeUser, startAdminChallenge } from "@/lib/twofactor";

export type FormState = { error?: string; ok?: string } | undefined;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BONUS_CHANCE = 5; // 1 in 5
const BONUS_CREDITS = 5;

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

async function usernameTaken(username: string, exceptUserId?: string) {
  const row = await one("select 1 from users where username = $1 and id is distinct from $2", [
    username,
    exceptUserId ?? null,
  ]);
  return !!row;
}

async function ledger(c: PoolClient, userId: string, delta: number, reason: string, questionId: number | null) {
  await c.query("update users set credits = greatest(credits + $1, 0) where id = $2", [delta, userId]);
  await c.query("insert into credit_ledger (user_id, delta, reason, question_id) values ($1, $2, $3, $4)", [
    userId,
    delta,
    reason,
    questionId,
  ]);
}

async function eloLedger(c: PoolClient, userId: string, delta: number, kind: "result" | "fine", reason: string, questionId: number | null) {
  if (delta === 0) return;
  await c.query("update users set elo = elo + $1 where id = $2", [delta, userId]);
  await c.query("insert into elo_ledger (user_id, delta, kind, reason, question_id) values ($1, $2, $3, $4, $5)", [
    userId,
    delta,
    kind,
    reason,
    questionId,
  ]);
}

/* ───────────── auth ───────────── */

export async function signUpWithEmail(_: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd, "email").toLowerCase();
  const password = String(fd.get("password") ?? "");
  const username = normalizeUsername(str(fd, "username"));

  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (!USERNAME_RE.test(username)) return { error: "Username: 3–20 chars, a–z, 0–9 or _." };
  if (await one("select 1 from users where email = $1", [email])) return { error: "That email is already registered." };
  if (await usernameTaken(username)) return { error: "That username is taken." };

  const hash = await bcrypt.hash(password, 12);
  const user = await one<{ id: string }>(
    "insert into users (email, username, password_hash) values ($1, $2, $3) returning id",
    [email, username, hash],
  );
  await query("insert into credit_ledger (user_id, delta, reason) values ($1, 10, 'starting balance')", [user!.id]);
  await createSession(user!.id);
  redirect("/");
}

export async function signInWithEmail(_: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd, "email").toLowerCase();
  const password = String(fd.get("password") ?? "");
  const user = await one<{ id: string; password_hash: string | null; is_admin: boolean; disabled_at: Date | null }>(
    "select id, password_hash, is_admin, disabled_at from users where email = $1",
    [email],
  );
  if (!user?.password_hash || !(await bcrypt.compare(password, user.password_hash))) {
    return { error: "Invalid email or password." };
  }
  if (user.disabled_at) return { error: "This account has been disabled by an admin." };
  if (user.is_admin && ADMIN_2FA_ENABLED) {
    try {
      await startAdminChallenge(user.id);
    } catch {
      return { error: "Couldn't send the admin verification email. Check SMTP settings." };
    }
    redirect("/login/verify");
  }
  await createSession(user.id, user.is_admin);
  redirect("/");
}

export async function verifyAdminCode(_: FormState, fd: FormData): Promise<FormState> {
  const result = await checkAdminChallenge(str(fd, "code"));
  if (!result.ok) return { error: result.error };
  await createSession(result.userId, true);
  redirect("/admin");
}

export async function resendAdminCode(_: FormState): Promise<FormState> {
  const pending = await pendingChallengeUser();
  if (!pending) return { error: "No pending login. Start again." };
  if (Date.now() - pending.created_at.getTime() < 30_000) return { error: "Wait 30 seconds before resending." };
  try {
    await startAdminChallenge(pending.user_id);
  } catch {
    return { error: "Couldn't send the email. Check SMTP settings." };
  }
  return { ok: "New code sent." };
}

export async function chooseUsername(_: FormState, fd: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const username = normalizeUsername(str(fd, "username"));
  if (!USERNAME_RE.test(username)) return { error: "Username: 3–20 chars, a–z, 0–9 or _." };
  if (await usernameTaken(username, user.id)) return { error: "That username is taken." };
  await query("update users set username = $1 where id = $2", [username, user.id]);
  redirect("/");
}

export async function signOut() {
  await destroySession();
  redirect("/");
}

/* ───────────── markets ───────────── */

export async function createQuestion(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const title = str(fd, "title");
  const description = str(fd, "description");
  const category = CATEGORIES.includes(str(fd, "category")) ? str(fd, "category") : "General";
  const closesRaw = str(fd, "closes_at");
  const closesAt = closesRaw ? new Date(closesRaw) : null;

  if (title.length < 10 || title.length > 200) return { error: "Question must be 10–200 characters." };
  if (!title.endsWith("?")) return { error: "Phrase it as a yes/no question ending in “?”." };
  if (description.length > 2000) return { error: "Resolution criteria must be under 2000 characters." };
  if (closesAt && (isNaN(closesAt.getTime()) || closesAt.getTime() < Date.now())) {
    return { error: "Close date must be in the future." };
  }

  const id = await tx(async (c) => {
    const { rows } = await c.query<{ id: number }>(
      `insert into questions (creator_id, title, description, category, closes_at)
       values ($1, $2, $3, $4, $5) returning id`,
      [user.id, title, description, category, closesAt],
    );
    const qid = rows[0].id;
    await c.query("insert into price_history (question_id, yes_prob) values ($1, 0.5)", [qid]);
    await ledger(c, user.id, 1, "posted a question", qid);
    return qid;
  });
  revalidatePath("/");
  redirect(`/q/${id}`);
}

export async function castVote(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const questionId = Number(fd.get("question_id"));
  const side = str(fd, "side") === "yes";
  const credits = Math.floor(Number(fd.get("credits") ?? 0));
  if (!Number.isInteger(questionId) || !Number.isFinite(credits) || credits < 0) return { error: "Bad request." };

  try {
    const result = await tx(async (c) => {
      const u = (await c.query<{ credits: number }>("select credits from users where id = $1 for update", [user.id]))
        .rows[0];
      const q = (
        await c.query<{ status: string; closes_at: Date | null; yes_votes: number; no_votes: number }>(
          "select status, closes_at, yes_votes, no_votes from questions where id = $1 for update",
          [questionId],
        )
      ).rows[0];
      if (!q || q.status !== "open") throw new UserError("This market is not open.");
      if (q.closes_at && q.closes_at.getTime() < Date.now()) throw new UserError("Voting has closed.");

      const prior = (
        await c.query<{ n: number; free: number }>(
          "select count(*)::int n, count(*) filter (where is_free)::int free from votes where question_id = $1 and user_id = $2",
          [questionId, user.id],
        )
      ).rows[0];
      const useFree = prior.free === 0;
      if (!useFree && credits < 1) throw new UserError("Free vote used — add at least 1 credit.");
      if (credits > u.credits) throw new UserError(`You only have ${u.credits} credits.`);

      // Bonus roll: once per market, on a user's first vote in it.
      const bonus = prior.n === 0 && crypto.randomInt(BONUS_CHANCE) === 0 ? BONUS_CREDITS : 0;
      const weight = credits + (useFree ? 1 : 0);

      await c.query(
        `insert into votes (question_id, user_id, side, is_free, credits, weight, bonus)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [questionId, user.id, side, useFree, credits, weight, bonus],
      );
      if (credits > 0) await ledger(c, user.id, -credits, `staked ${side ? "YES" : "NO"}`, questionId);
      if (bonus) await ledger(c, user.id, bonus, "lucky vote bonus", questionId);

      const yes = q.yes_votes + (side ? weight : 0);
      const no = q.no_votes + (side ? 0 : weight);
      await c.query("update questions set yes_votes = $1, no_votes = $2 where id = $3", [yes, no, questionId]);
      await c.query("insert into price_history (question_id, yes_prob) values ($1, $2)", [questionId, yesProb(yes, no)]);
      return { weight, bonus };
    });

    revalidatePath(`/q/${questionId}`);
    revalidatePath("/");
    const msg = `+${result.weight} vote${result.weight > 1 ? "s" : ""} on ${side ? "YES" : "NO"}.`;
    return { ok: result.bonus ? `${msg} LUCKY ROLL: +${result.bonus} credits!` : msg };
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    throw e;
  }
}

class UserError extends Error {}

/* ───────────── admin ───────────── */

export async function removeQuestion(fd: FormData) {
  await requireAdmin();
  const id = Number(fd.get("question_id"));
  const reason = str(fd, "reason") || "Violates posting protocol";
  await tx(async (c) => {
    const q = (
      await c.query<{ status: string; creator_id: string }>(
        "select status, creator_id from questions where id = $1 for update",
        [id],
      )
    ).rows[0];
    if (!q || q.status !== "open") return;
    // Refund every stake, and take back the creator's posting credit.
    const stakes = await c.query<{ user_id: string; credits: number }>(
      "select user_id, sum(credits)::int credits from votes where question_id = $1 and credits > 0 group by user_id",
      [id],
    );
    for (const s of stakes.rows) await ledger(c, s.user_id, s.credits, "refund: market removed", id);
    await ledger(c, q.creator_id, -1, "posting credit revoked: market removed", id);
    await c.query("update questions set status = 'removed', removed_reason = $1 where id = $2", [reason, id]);
    await c.query("update reports set status = 'actioned' where question_id = $1 and status = 'open'", [id]);
  });
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath(`/q/${id}`);
}

/**
 * Verify the real-world outcome. The pool of staked credits is split among
 * stakers on the winning side in proportion to their stake (free votes pay
 * nothing). If nobody staked on the winning side, all stakes are refunded.
 */
export async function verifyQuestion(fd: FormData) {
  await requireAdmin();
  const id = Number(fd.get("question_id"));
  const outcome = str(fd, "outcome") === "yes";
  await tx(async (c) => {
    const q = (
      await c.query<{ status: string; yes_votes: number; no_votes: number }>(
        "select status, yes_votes, no_votes from questions where id = $1 for update",
        [id],
      )
    ).rows[0];
    if (!q || q.status !== "open") return;

    const votes = (
      await c.query<{ id: number; user_id: string; side: boolean; credits: number }>(
        "select id, user_id, side, credits from votes where question_id = $1 and credits > 0",
        [id],
      )
    ).rows;
    const pool = votes.reduce((s, v) => s + v.credits, 0);
    const winners = votes.filter((v) => v.side === outcome);
    const winStake = winners.reduce((s, v) => s + v.credits, 0);

    const pays = votes.map((v) => {
      if (winStake === 0) return v.credits;
      return v.side === outcome ? Math.floor((v.credits * pool) / winStake) : 0;
    });
    // Rounding dust goes to the largest winning stake so the whole pool is paid out.
    if (winStake > 0) {
      const top = votes.reduce((best, v, i) => (v.side === outcome && v.credits > votes[best].credits ? i : best), votes.indexOf(winners[0]));
      pays[top] += pool - pays.reduce((s, p) => s + p, 0);
    }
    const payouts = new Map<string, number>();
    for (const [i, v] of votes.entries()) {
      await c.query("update votes set payout = $1 where id = $2", [pays[i], v.id]);
      if (pays[i] > 0) payouts.set(v.user_id, (payouts.get(v.user_id) ?? 0) + pays[i]);
    }
    const reason = winStake === 0 ? "refund: no winning stakes" : `payout: verified ${outcome ? "YES" : "NO"}`;
    for (const [userId, pay] of payouts) await ledger(c, userId, pay, reason, id);

    // ELO: +1 per credit staked on the verified side, -1 per credit on the other.
    const elo = new Map<string, number>();
    for (const v of votes) elo.set(v.user_id, (elo.get(v.user_id) ?? 0) + (v.side === outcome ? v.credits : -v.credits));
    for (const [userId, delta] of elo) await eloLedger(c, userId, delta, "result", "market verified", id);
    await c.query("update reports set status = 'dismissed' where question_id = $1 and status = 'open'", [id]);

    await c.query(
      `update questions set status = 'resolved', outcome = $1, final_yes_prob = $2, resolved_at = now()
        where id = $3`,
      [outcome, yesProb(q.yes_votes, q.no_votes), id],
    );
  });
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/about");
  revalidatePath(`/q/${id}`);
}

/* ───────────── reports & moderation ───────────── */

export async function reportQuestion(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const questionId = Number(fd.get("question_id"));
  const reason = REPORT_REASONS.includes(str(fd, "reason")) ? str(fd, "reason") : "Other";
  const details = str(fd, "details").slice(0, 500);
  const q = await one<{ title: string }>("select title from questions where id = $1 and status = 'open'", [questionId]);
  if (!q) return { error: "This market can't be reported." };

  const row = await one(
    `insert into reports (question_id, reporter_id, reason, details) values ($1, $2, $3, $4)
     on conflict (question_id, reporter_id) do nothing returning id`,
    [questionId, user.id, reason, details],
  );
  if (!row) return { error: "You already reported this market." };

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  sendMail(
    ADMIN_EMAIL,
    `CapaMarket report: ${reason}`,
    `@${user.username} reported market #${questionId}: "${q.title}"\nReason: ${reason}\n${details ? `Details: ${details}\n` : ""}\nReview: ${appUrl}/admin`,
  ).catch((e) => console.error("report email failed", e));
  revalidatePath("/admin");
  return { ok: "Reported. An admin will review it." };
}

export async function dismissReports(fd: FormData) {
  await requireAdmin();
  await query("update reports set status = 'dismissed' where question_id = $1 and status = 'open'", [Number(fd.get("question_id"))]);
  revalidatePath("/admin");
}

async function targetUser(fd: FormData) {
  const admin = await requireAdmin();
  const userId = str(fd, "user_id");
  const target = await one<{ id: string; is_admin: boolean }>("select id, is_admin from users where id = $1", [userId]);
  if (!target || target.is_admin || target.id === admin.id) throw new Error("Invalid target user");
  return target.id;
}

export async function warnUser(_: FormState, fd: FormData): Promise<FormState> {
  const userId = await targetUser(fd);
  const message = str(fd, "message").slice(0, 1000);
  if (!message) return { error: "Write the warning message." };
  await query("insert into user_notices (user_id, kind, message) values ($1, 'warning', $2)", [userId, message]);
  revalidatePath(`/admin/users/${userId}`);
  return { ok: "Warning sent." };
}

export async function fineUser(_: FormState, fd: FormData): Promise<FormState> {
  const userId = await targetUser(fd);
  const amount = Math.floor(Number(fd.get("amount")));
  const reason = str(fd, "reason").slice(0, 500);
  if (!Number.isInteger(amount) || amount < 1 || amount > 1000) return { error: "Fine must be 1–1000 ELO." };
  if (!reason) return { error: "Give a reason for the fine." };
  await tx(async (c) => {
    await eloLedger(c, userId, -amount, "fine", `admin fine: ${reason}`, null);
    await c.query("insert into user_notices (user_id, kind, message, elo_delta) values ($1, 'fine', $2, $3)", [userId, reason, -amount]);
  });
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/leaderboard");
  return { ok: `Fined ${amount} ELO.` };
}

export async function setUserDisabled(fd: FormData) {
  const userId = await targetUser(fd);
  const disable = str(fd, "disable") === "true";
  const reason = str(fd, "reason").slice(0, 500) || "Repeated abuse";
  await tx(async (c) => {
    if (disable) {
      await c.query("update users set disabled_at = now(), disabled_reason = $1 where id = $2", [reason, userId]);
      await c.query("delete from sessions where user_id = $1", [userId]);
      await c.query("insert into user_notices (user_id, kind, message) values ($1, 'disabled', $2)", [userId, reason]);
    } else {
      await c.query("update users set disabled_at = null, disabled_reason = null where id = $1", [userId]);
      await c.query("insert into user_notices (user_id, kind, message) values ($1, 'info', 'Your account was re-enabled.')", [userId]);
    }
  });
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
  revalidatePath("/leaderboard");
}

export async function acknowledgeNotices() {
  const user = await getCurrentUser();
  if (!user) return;
  await query("update user_notices set read_at = now() where user_id = $1 and read_at is null", [user.id]);
  revalidatePath("/", "layout");
}
