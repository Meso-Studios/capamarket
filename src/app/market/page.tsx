"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AdminButton } from "@/components/AdminButton";
import { CopyLink } from "@/components/CopyLink";
import { ReportButton } from "@/components/ReportButton";
import { Loading, useSession } from "@/components/Session";
import { TimelineChart } from "@/components/TimelineChart";
import { VotePanel } from "@/components/VotePanel";
import { ago, pct, shortDate, yesProb } from "@/lib/format";
import { rpc } from "@/lib/supabase";
import { useRpc } from "@/lib/useRpc";

type Market = {
  question: {
    id: number;
    title: string;
    description: string;
    category: string;
    status: "open" | "resolved" | "removed";
    outcome: boolean | null;
    yes_votes: number;
    no_votes: number;
    final_yes_prob: number | null;
    removed_reason: string | null;
    closes_at: string | null;
    resolved_at: string | null;
    created_at: string;
    username: string | null;
  };
  history: [number, number][];
  stakes: { yes: number; no: number; traders: number };
  activity: { who: string; side: boolean; weight: number; credits: number; bonus: number; payout: number | null; created_at: string }[];
  mine: { n: number; free: number; yes: number; no: number; staked: number; payout: number } | null;
  reports: { reason: string; details: string; username: string; created_at: string }[];
  reported: boolean;
};

export default function MarketPage() {
  return (
    <Suspense fallback={<Loading />}>
      <MarketView />
    </Suspense>
  );
}

function MarketView() {
  const id = Number(useSearchParams().get("id"));
  const { me, refresh } = useSession();
  const { data, error, loading, reload } = useRpc<Market | null>(Number.isInteger(id) && id > 0 ? "get_market" : null, { p_id: id });

  if (error) return <div className="msg msg-err" style={{ marginTop: 28 }}>ERR: {error}</div>;
  if (loading && !data) return <Loading />;
  if (!data) {
    return (
      <div className="empty" style={{ marginTop: 28 }}>
        Market not found. <Link href="/" className="accent">Back to markets →</Link>
      </div>
    );
  }

  const { question: q, stakes, activity, mine, reports } = data;
  const isAdmin = !!me?.is_admin;
  const p = yesProb(q.yes_votes, q.no_votes);
  const open = q.status === "open" && !(q.closes_at && new Date(q.closes_at).getTime() < Date.now());
  const end = q.resolved_at ? new Date(q.resolved_at).getTime() : Date.now();
  const points = data.history.map(([t, v]) => ({ t, p: Number(v) }));
  const finalP = Number(q.final_yes_prob);
  const changed = async () => {
    await Promise.all([reload(), refresh()]);
  };

  return (
    <div className="section">
      <div className="q-head">
        <div className="q-badge">{(q.category.includes(" ") ? q.category.split(" ").map((w) => w[0]).join("") : q.category.slice(0, 2)).toUpperCase()}</div>
        <div style={{ minWidth: 0 }}>
          <div className="q-crumbs">
            <Link href={`/?cat=${encodeURIComponent(q.category)}`}>{q.category}</Link> ·{" "}
            {q.username ? <span style={{ color: "var(--warn)" }} title="Visible to admin only">@{q.username}</span> : "anonymous"} · posted{" "}
            {ago(q.created_at)}
          </div>
          <h1 className="q-title">{q.title}</h1>
        </div>
        <div className="q-actions">
          <CopyLink />
        </div>
      </div>

      {q.status === "resolved" && (
        <div className={`msg ${q.outcome ? "msg-ok" : "msg-err"}`} style={{ marginTop: 16 }}>
          VERIFIED: {q.outcome ? "YES" : "NO"} — {shortDate(q.resolved_at!)}. Crowd had YES at {pct(finalP)}, which was{" "}
          {finalP !== 0.5 && finalP > 0.5 === q.outcome ? "CORRECT" : "INCORRECT"}.
        </div>
      )}
      {q.status === "removed" && (
        <div className="msg msg-warn" style={{ marginTop: 16 }}>
          REMOVED by admin: {q.removed_reason}. Stakes were refunded. (Only admins can see this page.)
        </div>
      )}

      <div className="stats num">
        <div><div className="k">YES</div><div className="v yes">{pct(p)}</div></div>
        <div><div className="k">Total votes</div><div className="v">{q.yes_votes + q.no_votes}</div></div>
        <div><div className="k">Credits staked</div><div className="v accent">{stakes.yes + stakes.no}</div></div>
        <div><div className="k">{q.closes_at ? "Closes" : "Traders"}</div><div className="v">{q.closes_at ? shortDate(q.closes_at) : stakes.traders}</div></div>
      </div>

      <div className="layout-2">
        <div style={{ minWidth: 0 }}>
          <TimelineChart points={points} end={end} />

          <div className="panel" style={{ marginTop: 24 }}>
            <div className="panel-head"><span>Resolution criteria</span></div>
            <div className="panel-body desc">{q.description || "No criteria provided. Admin verifies based on public reporting."}</div>
          </div>

          <div className="panel" style={{ marginTop: 24 }}>
            <div className="panel-head">
              <span>Activity</span>
              <span>{stakes.traders} traders</span>
            </div>
            {activity.length === 0 ? (
              <div className="panel-body dim">No votes yet. Be first.</div>
            ) : (
              <div className="table-scroll">
                <table className="table num">
                  <thead>
                    <tr><th>Trader</th><th>Side</th><th className="r">Votes</th><th className="r">Staked</th><th className="r">{q.status === "resolved" ? "Payout" : "When"}</th></tr>
                  </thead>
                  <tbody>
                    {activity.map((a, i) => (
                      <tr key={i}>
                        <td>{a.who}{a.bonus > 0 && <span className="tag tag-warn" style={{ marginLeft: 8 }}>+{a.bonus} lucky</span>}</td>
                        <td className={a.side ? "yes" : "no"}>{a.side ? "YES" : "NO"}</td>
                        <td className="r">{a.weight}</td>
                        <td className="r">{a.credits}</td>
                        <td className="r dim">{q.status === "resolved" ? `${a.payout ?? 0} CR` : ago(a.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <aside style={{ display: "grid", gap: 16 }}>
          <VotePanel
            questionId={q.id}
            yesVotes={q.yes_votes}
            noVotes={q.no_votes}
            yesStake={stakes.yes}
            noStake={stakes.no}
            open={open}
            user={me?.username && mine ? { credits: me.credits, hasFree: mine.free === 0, hasVoted: mine.n > 0 } : null}
            onVoted={changed}
          />

          {mine && mine.n > 0 && (
            <div className="panel">
              <div className="panel-head"><span>Your position</span></div>
              <div className="panel-body summary num" style={{ marginTop: 0, borderTop: "none", paddingTop: 14 }}>
                <div className="row"><span className="muted">YES votes</span><span className="yes">{mine.yes}</span></div>
                <div className="row"><span className="muted">NO votes</span><span className="no">{mine.no}</span></div>
                <div className="row"><span className="muted">Credits staked</span><span>{mine.staked}</span></div>
                {q.status === "resolved" && <div className="row"><span className="muted">Paid out</span><span className="accent">{mine.payout} CR</span></div>}
              </div>
            </div>
          )}

          {me?.username && !isAdmin && q.status === "open" && <ReportButton questionId={q.id} alreadyReported={data.reported} />}

          {isAdmin && reports.length > 0 && (
            <div className="panel" style={{ borderColor: "var(--no)" }}>
              <div className="panel-head" style={{ color: "var(--no)", borderColor: "var(--no)" }}>
                <span>Open reports</span>
                <span>{reports.length}</span>
              </div>
              <div className="panel-body" style={{ display: "grid", gap: 10 }}>
                {reports.map((r, i) => (
                  <div key={i} style={{ fontSize: 13 }}>
                    <span className="tag tag-no">{r.reason}</span> <span className="dim">@{r.username} · {ago(r.created_at)}</span>
                    {r.details && <div className="muted" style={{ marginTop: 4 }}>{r.details}</div>}
                  </div>
                ))}
                <AdminButton className="btn btn-ghost btn-block" run={() => rpc("admin_dismiss_reports", { p_id: q.id })} after={changed}>
                  Dismiss reports
                </AdminButton>
              </div>
            </div>
          )}

          {isAdmin && q.status === "open" && <AdminPanel id={q.id} onChanged={changed} />}
        </aside>
      </div>
    </div>
  );
}

function AdminPanel({ id, onChanged }: { id: number; onChanged: () => Promise<void> }) {
  const [reason, setReason] = useState("");
  return (
    <div className="panel" style={{ borderColor: "var(--warn)" }}>
      <div className="panel-head" style={{ color: "var(--warn)", borderColor: "var(--warn)" }}><span>Admin</span></div>
      <div className="panel-body">
        <div className="label">Verify outcome (pays out stakes)</div>
        <div className="sides">
          <AdminButton className="btn btn-yes btn-block" confirm="Verify this market as YES? This pays out and can't be undone."
            run={() => rpc("admin_verify", { p_id: id, p_outcome: true })} after={onChanged}>Verify YES</AdminButton>
          <AdminButton className="btn btn-no btn-block" confirm="Verify this market as NO? This pays out and can't be undone."
            run={() => rpc("admin_verify", { p_id: id, p_outcome: false })} after={onChanged}>Verify NO</AdminButton>
        </div>
        <label className="label" htmlFor="reason">Remove for protocol violation</label>
        <input className="input" id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (e.g. not verifiable)" style={{ marginBottom: 8 }} />
        <AdminButton className="btn btn-warn btn-block" confirm="Remove this market and refund all stakes?"
          run={() => rpc("admin_remove", { p_id: id, p_reason: reason })} after={onChanged}>Remove market</AdminButton>
      </div>
    </div>
  );
}
