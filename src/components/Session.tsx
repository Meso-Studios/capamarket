"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { rpc, supabase } from "@/lib/supabase";

export type Me = {
  id: string;
  email: string;
  username: string | null;
  credits: number;
  elo: number;
  is_admin: boolean;
  disabled: false;
  notices: { id: number; kind: string; message: string; elo_delta: number }[];
  open_reports: number;
};

type Ctx = {
  /** undefined while loading, null when signed out. */
  me: Me | null | undefined;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  disabledReason: string | null;
};

const SessionContext = createContext<Ctx>({ me: undefined, refresh: async () => {}, signOut: async () => {}, disabledReason: null });
export const useSession = () => useContext(SessionContext);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [disabledReason, setDisabledReason] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await rpc<(Me | { disabled: true; reason: string | null }) | null>("get_me");
      if (data?.disabled) {
        setDisabledReason(data.reason || "Repeated abuse");
        await supabase.auth.signOut();
        setMe(null);
        return;
      }
      setMe(data as Me | null);
    } catch {
      setMe(null);
    }
  }, []);

  useEffect(() => {
    refresh();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        // Defer: supabase-js warns against awaiting inside this callback.
        setTimeout(refresh, 0);
      }
    });
    return () => data.subscription.unsubscribe();
  }, [refresh]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setMe(null);
  }, []);

  return <SessionContext.Provider value={{ me, refresh, signOut, disabledReason }}>{children}</SessionContext.Provider>;
}

export function Shell({ children }: { children: React.ReactNode }) {
  const { me, refresh, signOut } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  // Google sign-ups (and email sign-ups that confirmed later) still need a username.
  useEffect(() => {
    if (me && !me.username && !pathname.startsWith("/onboarding")) router.replace("/onboarding");
  }, [me, pathname, router]);

  return (
    <>
      <header className="header">
        <div className="wrap">
          <Link href="/" className="logo">
            <span className="prompt">&gt;</span> CAPAMARKET<span className="cursor" />
          </Link>
          <nav className="nav">
            <Link href="/">Markets</Link>
            <Link href="/new">+ New</Link>
            <Link href="/leaderboard">Leaderboard</Link>
            <Link href="/about">About</Link>
            {me?.is_admin && (
              <>
                <Link href="/admin" className="admin">
                  Admin{me.open_reports ? <span className="badge">{me.open_reports}</span> : null}
                </Link>
                <Link href="/admin/users" className="admin">
                  Users
                </Link>
              </>
            )}
          </nav>
          <div className="userbox">
            {me === undefined ? null : me ? (
              <>
                <span className="credits num" title="Your credits">
                  {me.credits} CR
                </span>
                <Link href="/leaderboard" className="elo num" title="Your ELO">
                  {me.elo} ELO
                </Link>
                <Link href="/me" className="uname muted">
                  @{me.username ?? "…"}
                </Link>
                <button
                  className="btn btn-ghost"
                  style={{ padding: "4px 6px" }}
                  onClick={async () => {
                    await signOut();
                    router.push("/");
                  }}
                >
                  Exit
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className="btn btn-ghost">
                  Log in
                </Link>
                <Link href="/signup" className="btn btn-primary">
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      {me && me.notices.length > 0 && (
        <div className="notices">
          <div className="wrap">
            {me.notices.map((n) => (
              <div key={n.id} className="notice">
                <b>
                  {n.kind === "warning" && "⚠ ADMIN WARNING"}
                  {n.kind === "fine" && `⚠ FINED ${n.elo_delta} ELO`}
                  {n.kind === "info" && "ⓘ NOTICE"}
                  {n.kind === "disabled" && "⛔ ACCOUNT WAS DISABLED:"}
                </b>{" "}
                {n.message}
              </div>
            ))}
            <button
              className="btn btn-warn"
              style={{ padding: "4px 10px" }}
              onClick={async () => {
                await rpc("acknowledge_notices");
                await refresh();
              }}
            >
              Acknowledge
            </button>
          </div>
        </div>
      )}
      <main className="wrap">{children}</main>
      <footer className="footer">
        <div className="wrap">CAPAMARKET // credits only — no money in, no money out. Credits have no cash value.</div>
      </footer>
    </>
  );
}

/** Renders children only for signed-in users with a username (or admins, with admin). */
export function RequireUser({ admin = false, children }: { admin?: boolean; children: React.ReactNode }) {
  const { me } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (me === null) router.replace("/login");
    else if (me && admin && !me.is_admin) router.replace("/");
  }, [me, admin, router]);
  if (!me || !me.username || (admin && !me.is_admin)) return <Loading />;
  return <>{children}</>;
}

export function Loading({ label = "loading" }: { label?: string }) {
  return (
    <div className="empty" style={{ marginTop: 28 }}>
      <span className="dim">$ {label}</span>
      <span className="cursor" />
    </div>
  );
}
