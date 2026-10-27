import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { one, query } from "./db";
import { ADMIN_EMAIL, sendMail } from "./mail";

/** Admin email 2-step verification. Off for now; set ADMIN_2FA=on to require it again. */
export const ADMIN_2FA_ENABLED = process.env.ADMIN_2FA === "on";

export const CHALLENGE_COOKIE = "cm_2fa";
const TTL_MIN = 10;
export const MAX_ATTEMPTS = 5;

const hashCode = (challengeId: string, code: string) =>
  crypto.createHash("sha256").update(`${challengeId}:${code}`).digest("hex");

/** Emails a 6-digit code for an admin login and remembers the challenge in a cookie. */
export async function startAdminChallenge(userId: string) {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const id = crypto.randomUUID();
  await query("delete from login_challenges where user_id = $1 and consumed_at is null", [userId]);
  await query(
    `insert into login_challenges (id, user_id, code_hash, expires_at)
     values ($1, $2, $3, now() + make_interval(mins => $4))`,
    [id, userId, hashCode(id, code), TTL_MIN],
  );
  await sendMail(
    ADMIN_EMAIL,
    `CapaMarket admin login code: ${code}`,
    `Your CapaMarket admin verification code is ${code}.\n\nIt expires in ${TTL_MIN} minutes. If you didn't try to log in, change the admin password now.`,
  );
  (await cookies()).set(CHALLENGE_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_MIN * 60,
  });
}

export type ChallengeResult = { ok: true; userId: string } | { ok: false; error: string };

export async function checkAdminChallenge(code: string): Promise<ChallengeResult> {
  const id = (await cookies()).get(CHALLENGE_COOKIE)?.value;
  if (!id) return { ok: false, error: "No pending login. Start again." };
  const ch = await one<{ user_id: string; code_hash: string; attempts: number; expired: boolean; consumed_at: Date | null }>(
    "select user_id, code_hash, attempts, expires_at < now() expired, consumed_at from login_challenges where id = $1",
    [id],
  );
  if (!ch || ch.consumed_at || ch.expired) return { ok: false, error: "Code expired. Start again." };
  if (ch.attempts >= MAX_ATTEMPTS) return { ok: false, error: "Too many attempts. Start again." };

  const given = Buffer.from(hashCode(id, code.replace(/\D/g, "")));
  const expected = Buffer.from(ch.code_hash);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    await query("update login_challenges set attempts = attempts + 1 where id = $1", [id]);
    const left = MAX_ATTEMPTS - ch.attempts - 1;
    return { ok: false, error: left > 0 ? `Wrong code. ${left} attempt${left === 1 ? "" : "s"} left.` : "Too many attempts. Start again." };
  }
  await query("update login_challenges set consumed_at = now() where id = $1", [id]);
  (await cookies()).delete(CHALLENGE_COOKIE);
  return { ok: true, userId: ch.user_id };
}

export async function pendingChallengeUser() {
  const id = (await cookies()).get(CHALLENGE_COOKIE)?.value;
  if (!id) return null;
  return one<{ user_id: string; created_at: Date }>(
    "select user_id, created_at from login_challenges where id = $1 and consumed_at is null and expires_at > now()",
    [id],
  );
}
