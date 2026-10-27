"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { attempt, BASE_PATH, rpc, supabase, type FormState } from "@/lib/supabase";
import { useSession } from "@/components/Session";

const PENDING_USERNAME = "cm_pending_username";

function GoogleButton() {
  const [state, action, pending] = useActionState<FormState>(
    () =>
      attempt(async () => {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: `${window.location.origin}${BASE_PATH}/` },
        });
        if (error) throw new Error(error.message.includes("not enabled") ? "Google sign-in isn't enabled in Supabase yet." : error.message);
      }),
    undefined,
  );
  return (
    <form action={action}>
      {state?.error && <div className="msg msg-err">ERR: {state.error}</div>}
      <button className="btn btn-block gbtn" disabled={pending}>
        <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
          <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.5 5.8c4.4-4.1 6.8-10.1 6.8-17.1z" />
          <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z" />
          <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
        </svg>
        Continue with Google
      </button>
    </form>
  );
}

/** Sends signed-in users away from the login/signup pages. */
function useLeaveWhenSignedIn() {
  const { me } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (me) router.replace(me.username ? "/" : "/onboarding");
  }, [me, router]);
}

export function LoginForm() {
  useLeaveWhenSignedIn();
  const { disabledReason } = useSession();
  const [state, action, pending] = useActionState<FormState, FormData>(
    (_, fd) =>
      attempt(async () => {
        const { error } = await supabase.auth.signInWithPassword({
          email: String(fd.get("email")).trim().toLowerCase(),
          password: String(fd.get("password")),
        });
        if (error) {
          if (/banned/i.test(error.message)) throw new Error("This account has been disabled by an admin.");
          if (/not confirmed/i.test(error.message)) throw new Error("Confirm your email first — check your inbox.");
          throw new Error("Invalid email or password.");
        }
      }),
    undefined,
  );
  const err = state?.error ?? (disabledReason ? `This account has been disabled by an admin (${disabledReason}).` : undefined);
  return (
    <div className="auth panel">
      <div className="panel-head">
        <span>$ login</span>
        <span>session://new</span>
      </div>
      <div className="panel-body">
        {err && <div className="msg msg-err">ERR: {err}</div>}
        <GoogleButton />
        <div className="divider">or email</div>
        <form action={action}>
          <div className="field">
            <label className="label" htmlFor="email">Email</label>
            <input className="input" id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="field">
            <label className="label" htmlFor="password">Password</label>
            <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          <button className="btn btn-primary btn-block" disabled={pending}>
            {pending ? "Authenticating…" : "Log in →"}
          </button>
        </form>
        <p className="hint" style={{ marginTop: 16 }}>
          No account? <Link href="/signup" className="accent">Sign up</Link> and get 10 free credits.
        </p>
      </div>
    </div>
  );
}

export function SignupForm() {
  useLeaveWhenSignedIn();
  const [state, action, pending] = useActionState<FormState, FormData>(
    (_, fd) =>
      attempt(async () => {
        const email = String(fd.get("email")).trim().toLowerCase();
        const password = String(fd.get("password"));
        const username = String(fd.get("username")).trim().toLowerCase();
        if (!/^[a-z0-9_]{3,20}$/.test(username)) throw new Error("Username: 3–20 chars, a–z, 0–9 or _.");
        if (password.length < 8) throw new Error("Password must be at least 8 characters.");
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}${BASE_PATH}/onboarding/` },
        });
        if (error) throw new Error(/registered/i.test(error.message) ? "That email is already registered." : error.message);
        if (!data.session) {
          // Email confirmation is on: claim the username after they confirm and log in.
          try {
            localStorage.setItem(PENDING_USERNAME, username);
          } catch {}
          return `Check ${email} for a confirmation link, then log in.`;
        }
        try {
          await rpc("claim_username", { p_username: username });
        } catch (e) {
          try {
            localStorage.setItem(PENDING_USERNAME, username);
          } catch {}
          throw e;
        }
      }),
    undefined,
  );
  return (
    <div className="auth panel">
      <div className="panel-head">
        <span>$ register</span>
        <span>+10 CR on signup</span>
      </div>
      <div className="panel-body">
        {state?.error && <div className="msg msg-err">ERR: {state.error}</div>}
        {state?.ok && <div className="msg msg-ok">{state.ok}</div>}
        <GoogleButton />
        <div className="divider">or email</div>
        <form action={action}>
          <div className="field">
            <label className="label" htmlFor="username">Username</label>
            <input className="input" id="username" name="username" placeholder="satoshi_42" autoComplete="username" required />
            <div className="hint">3–20 chars · a–z 0–9 _</div>
          </div>
          <div className="field">
            <label className="label" htmlFor="email">Email</label>
            <input className="input" id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="field">
            <label className="label" htmlFor="password">Password</label>
            <input className="input" id="password" name="password" type="password" minLength={8} autoComplete="new-password" required />
            <div className="hint">8+ characters</div>
          </div>
          <button className="btn btn-primary btn-block" disabled={pending}>
            {pending ? "Creating…" : "Create account →"}
          </button>
        </form>
        <p className="hint" style={{ marginTop: 16 }}>
          Have an account? <Link href="/login" className="accent">Log in</Link>
        </p>
      </div>
    </div>
  );
}

export function UsernameForm() {
  const { me, refresh } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (me === null) router.replace("/login");
    else if (me?.username) router.replace("/");
  }, [me, router]);

  let suggested = "";
  try {
    suggested = localStorage.getItem(PENDING_USERNAME) ?? "";
  } catch {}

  const [state, action, pending] = useActionState<FormState, FormData>(
    (_, fd) =>
      attempt(async () => {
        await rpc("claim_username", { p_username: String(fd.get("username")) });
        try {
          localStorage.removeItem(PENDING_USERNAME);
        } catch {}
        await refresh();
      }),
    undefined,
  );
  if (!me) return null;
  return (
    <div className="auth panel">
      <div className="panel-head">
        <span>$ set-username</span>
        <span>1 / 1</span>
      </div>
      <div className="panel-body">
        <p className="muted" style={{ marginTop: 0 }}>
          Signed in as <span className="accent">{me.email}</span>. Pick the handle other traders will see.
        </p>
        {state?.error && <div className="msg msg-err">ERR: {state.error}</div>}
        <form action={action}>
          <div className="field">
            <label className="label" htmlFor="username">Username</label>
            <input className="input" id="username" name="username" defaultValue={suggested} placeholder="satoshi_42" required autoFocus />
            <div className="hint">3–20 chars · a–z 0–9 _</div>
          </div>
          <button className="btn btn-primary btn-block" disabled={pending}>
            {pending ? "Saving…" : "Claim username →"}
          </button>
        </form>
      </div>
    </div>
  );
}
