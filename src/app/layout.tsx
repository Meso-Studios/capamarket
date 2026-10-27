import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { query, one } from "@/lib/db";
import { acknowledgeNotices, signOut } from "./actions";
import "./globals.css";

const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "700", "800"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "CapaMarket",
  description: "Credit-based prediction markets. No money, just foresight.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const [notices, openReports] = await Promise.all([
    user
      ? query<{ id: number; kind: string; message: string; elo_delta: number }>(
          "select id, kind, message, elo_delta from user_notices where user_id = $1 and read_at is null order by created_at",
          [user.id],
        )
      : [],
    user?.is_admin ? one<{ n: number }>("select count(distinct question_id)::int n from reports where status = 'open'") : null,
  ]);
  return (
    <html lang="en" className={mono.variable}>
      <body>
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
              {user?.is_admin && (
                <>
                  <Link href="/admin" className="admin">
                    Admin{openReports?.n ? <span className="badge">{openReports.n}</span> : null}
                  </Link>
                  <Link href="/admin/users" className="admin">
                    Users
                  </Link>
                </>
              )}
            </nav>
            <div className="userbox">
              {user ? (
                <>
                  <span className="credits num" title="Your credits">
                    {user.credits} CR
                  </span>
                  <Link href="/leaderboard" className="elo num" title="Your ELO">
                    {user.elo} ELO
                  </Link>
                  <Link href="/me" className="uname muted">
                    @{user.username ?? "…"}
                  </Link>
                  <form action={signOut}>
                    <button className="btn btn-ghost" style={{ padding: "4px 6px" }}>
                      Exit
                    </button>
                  </form>
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
        {notices.length > 0 && (
          <div className="notices">
            <div className="wrap">
              {notices.map((n) => (
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
              <form action={acknowledgeNotices}>
                <button className="btn btn-warn" style={{ padding: "4px 10px" }}>Acknowledge</button>
              </form>
            </div>
          </div>
        )}
        <main className="wrap">{children}</main>
        <footer className="footer">
          <div className="wrap">
            CAPAMARKET // credits only — no money in, no money out. Credits have no cash value.
          </div>
        </footer>
      </body>
    </html>
  );
}
