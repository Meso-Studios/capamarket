import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createSession } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { ADMIN_2FA_ENABLED, startAdminChallenge } from "@/lib/twofactor";

export async function GET(req: NextRequest) {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const fail = (code: string) => NextResponse.redirect(`${appUrl}/login?error=${code}`);

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const jar = await cookies();
  const expected = jar.get("cm_oauth_state")?.value;
  jar.delete("cm_oauth_state");
  if (!code || !state || state !== expected) return fail("google_state");

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: `${appUrl}/api/auth/google/callback`,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) return fail("google_token");
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${access_token}` },
  });
  if (!infoRes.ok) return fail("google_profile");
  const info = (await infoRes.json()) as { sub: string; email: string; email_verified: boolean };
  if (!info.email_verified) return fail("google_unverified");
  const email = info.email.toLowerCase();

  // Match by Google id, then link an existing email account, else create a new user.
  type Row = { id: string; username: string | null; is_admin: boolean; disabled_at: Date | null };
  const cols = "id, username, is_admin, disabled_at";
  let user = await one<Row>(`select ${cols} from users where google_id = $1`, [info.sub]);
  if (!user) {
    user = await one<Row>(`update users set google_id = $1 where email = $2 returning ${cols}`, [info.sub, email]);
  }
  if (!user) {
    user = await one<Row>(`insert into users (email, google_id) values ($1, $2) returning ${cols}`, [email, info.sub]);
    await query("insert into credit_ledger (user_id, delta, reason) values ($1, 10, 'starting balance')", [user!.id]);
  }

  if (user!.disabled_at) return fail("disabled");
  if (user!.is_admin && ADMIN_2FA_ENABLED) {
    // Admins still need the emailed code, even through Google.
    try {
      await startAdminChallenge(user!.id);
    } catch {
      return fail("mail");
    }
    return NextResponse.redirect(`${appUrl}/login/verify`);
  }
  await createSession(user!.id, user!.is_admin);
  return NextResponse.redirect(`${appUrl}${user!.username ? "/" : "/onboarding"}`);
}
