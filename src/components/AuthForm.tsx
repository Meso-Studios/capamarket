"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signInWithEmail, signUpWithEmail, chooseUsername, verifyAdminCode, resendAdminCode, type FormState } from "@/app/actions";

const GOOGLE_ERRORS: Record<string, string> = {
  google_not_configured: "Google sign-in isn't configured yet (GOOGLE_CLIENT_ID missing).",
  google_state: "Google sign-in expired. Try again.",
  google_token: "Google rejected the sign-in. Try again.",
  google_profile: "Couldn't read your Google profile.",
  google_unverified: "Your Google email isn't verified.",
  disabled: "This account has been disabled by an admin.",
  mail: "Couldn't send the admin verification email. Check SMTP settings.",
};

function GoogleButton() {
  return (
    <a href="/api/auth/google" className="btn btn-block gbtn">
      <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
        <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.5 5.8c4.4-4.1 6.8-10.1 6.8-17.1z" />
        <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z" />
        <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
      </svg>
      Continue with Google
    </a>
  );
}

export function LoginForm({ error }: { error?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(signInWithEmail, undefined);
  const err = state?.error ?? (error ? GOOGLE_ERRORS[error] ?? "Sign-in failed." : undefined);
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
  const [state, action, pending] = useActionState<FormState, FormData>(signUpWithEmail, undefined);
  return (
    <div className="auth panel">
      <div className="panel-head">
        <span>$ register</span>
        <span>+10 CR on signup</span>
      </div>
      <div className="panel-body">
        {state?.error && <div className="msg msg-err">ERR: {state.error}</div>}
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

export function UsernameForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(chooseUsername, undefined);
  return (
    <div className="auth panel">
      <div className="panel-head">
        <span>$ set-username</span>
        <span>1 / 1</span>
      </div>
      <div className="panel-body">
        <p className="muted" style={{ marginTop: 0 }}>
          Signed in as <span className="accent">{email}</span>. Pick the handle other traders will see.
        </p>
        {state?.error && <div className="msg msg-err">ERR: {state.error}</div>}
        <form action={action}>
          <div className="field">
            <label className="label" htmlFor="username">Username</label>
            <input className="input" id="username" name="username" placeholder="satoshi_42" required autoFocus />
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

export function AdminCodeForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(verifyAdminCode, undefined);
  const [resent, resend, resending] = useActionState<FormState>(resendAdminCode, undefined);
  const msg = state?.error ?? resent?.error;
  return (
    <div className="auth panel" style={{ borderColor: "var(--warn)" }}>
      <div className="panel-head" style={{ color: "var(--warn)", borderColor: "var(--warn)" }}>
        <span>$ admin 2fa</span>
        <span>step 2 / 2</span>
      </div>
      <div className="panel-body">
        <p className="muted" style={{ marginTop: 0 }}>
          A 6-digit code was emailed to <span className="accent">{email}</span>. It expires in 10 minutes.
        </p>
        {msg && <div className="msg msg-err">ERR: {msg}</div>}
        {resent?.ok && !state?.error && <div className="msg msg-ok">{resent.ok}</div>}
        <form action={action}>
          <div className="field">
            <label className="label" htmlFor="code">Verification code</label>
            <input
              className="input num"
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{6,7}"
              maxLength={7}
              placeholder="000000"
              style={{ fontSize: 24, letterSpacing: "0.4em", textAlign: "center" }}
              required
              autoFocus
            />
          </div>
          <button className="btn btn-primary btn-block" disabled={pending}>
            {pending ? "Verifying…" : "Verify →"}
          </button>
        </form>
        <form action={resend} style={{ marginTop: 10 }}>
          <button className="btn btn-ghost btn-block" disabled={resending}>
            {resending ? "Sending…" : "Resend code"}
          </button>
        </form>
        <p className="hint">
          Wrong account? <Link href="/login" className="accent">Start over</Link>
        </p>
      </div>
    </div>
  );
}
