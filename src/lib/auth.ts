import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "node:crypto";
import { one, query } from "./db";

export const SESSION_COOKIE = "cm_session";
const SESSION_DAYS = 30;

export type User = {
  id: string;
  email: string;
  username: string | null;
  credits: number;
  elo: number;
  is_admin: boolean;
};

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

/** mfaVerified must be true for an admin session to carry admin rights. */
export async function createSession(userId: string, mfaVerified = false) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  await query("insert into sessions (token_hash, user_id, expires_at, mfa_verified) values ($1, $2, $3, $4)", [
    sha256(token),
    userId,
    expires,
    mfaVerified,
  ]);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await query("delete from sessions where token_hash = $1", [sha256(token)]);
  jar.delete(SESSION_COOKIE);
}

export const getCurrentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return one<User>(
    `select u.id, u.email, u.username, u.credits, u.elo, (u.is_admin and s.mfa_verified) is_admin
       from sessions s join users u on u.id = s.user_id
      where s.token_hash = $1 and s.expires_at > now() and u.disabled_at is null`,
    [sha256(token)],
  );
});

/** Signed-in user with a username; otherwise redirects to login or onboarding. */
export async function requireUser(): Promise<User & { username: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.username) redirect("/onboarding");
  return user as User & { username: string };
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!user.is_admin) redirect("/");
  return user;
}

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
export const normalizeUsername = (s: string) => s.trim().toLowerCase();
