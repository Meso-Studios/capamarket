import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { ago, pct, shortDate, yesProb } from "@/lib/format";
import { TimelineChart } from "@/components/TimelineChart";
import { VotePanel } from "@/components/VotePanel";
import { CopyLink } from "@/components/CopyLink";
import { ReportButton } from "@/components/ReportButton";
import { dismissReports, removeQuestion, verifyQuestion } from "@/app/actions";

export const dynamic = "force-dynamic";

type Q = {
  id: number;
  title: string;
  description: string;
  category: string;
  status: "open" | "resolved" | "removed";
  outcome: boolean | null;
  yes_votes: number;
  no_votes: number;
  final_yes_prob: string | null;
  removed_reason: string | null;
  closes_at: Date | null;
  resolved_at: Date | null;
  created_at: Date;
  username: string;
};

export default async function QuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const user = await getCurrentUser();

  const q = await one<Q>(
    `select q.*, u.username from questions q join users u on u.id = q.creator_id where q.id = $1`,
    [id],
  );
  if (!q || (q.status === "removed" && !user?.is_admin)) notFound();

  const isAdmin = !!user?.is_admin;
  const [history, stakes, activity, mine, reports, reported] = await Promise.all([
    query<{ t: Date; p: string }>("select created_at t, yes_prob p from price_history where question_id = $1 order by created_at", [id]),
    one<{ yes: number; no: number; traders: number }>(
      `select coalesce(sum(credits) filter (where side), 0)::int yes,
              coalesce(sum(credits) filter (where not side), 0)::int no,
              count(distinct user_id)::int traders
         from votes where question_id = $1`,
      [id],
    ),
    query<{ user_id: string; username: string; side: boolean; weight: number; credits: number; bonus: number; payout: number | null; created_at: Date }>(
      `select v.user_id, u.username, v.side, v.weight, v.credits, v.bonus, v.payout, v.created_at
         from votes v join users u on u.id = v.user_id
        where v.question_id = $1 order by v.created_at desc limit 25`,
      [id],
    ),
    user
      ? one<{ n: number; free: number; yes: number; no: number; staked: number; payout: number }>(
          `select count(*)::int n, count(*) filter (where is_free)::int free,
                  coalesce(sum(weight) filter (where side), 0)::int yes,
                  coalesce(sum(weight) filter (where not side), 0)::int no,
                  coalesce(sum(credits), 0)::int staked, coalesce(sum(payout), 0)::int payout
             from votes where question_id = $1 and user_id = $2`,
          [id, user.id],
        )
      : null,
    isAdmin
      ? query<{ reason: string; details: string; username: string; created_at: Date }>(
          `select r.reason, r.details, u.username, r.created_at from reports r join users u on u.id = r.reporter_id
            where r.question_id = $1 and r.status = 'open' order by r.created_at`,
          [id],
        )
      : [],
    user ? one("select 1 from reports where question_id = $1 and reporter_id = $2", [id, user.id]) : null,
  ]);
  // Posts are anonymous: only admins see who created a market or who traded in it.
  const who = (userId: string, username: string) => (isAdmin ? `@${username}` : userId === user?.id ? "you" : "anon");

  const p = yesProb(q.yes_votes, q.no_votes);
  const open = q.status === "open" && !(q.closes_at && q.closes_at.getTime() < Date.now());
  const end = q.resolved_at?.getTime() ?? Date.now();
  const points = history.map((h) => ({ t: h.t.getTime(), p: Number(h.p) }));

  return (
    <div className="section">
      <div className="q-head">
        <div className="q-badge">{(q.category.includes(" ") ? q.category.split(" ").map((w) => w[0]).join("") : q.category.slice(0, 2)).toUpperCase()}</div>
        <div style={{ minWidth: 0 }}>
          <div className="q-crumbs">
            <Link href={`/?cat=${encodeURIComponent(q.category)}`}>{q.category}</Link> · {isAdmin ? <span style={{ color: "var(--warn)" }} title="Visible to admin only">@{q.username}</span> : "anonymous"} · posted {ago(q.created_at)}
          </div>
          <h1 className="q-title">{q.title}</h1>
        </div>
        <div className="q-actions">
          <CopyLink />
        </div>
      </div>

      {q.status === "resolved" && (
        <div className={`msg ${q.outcome ? "msg-ok" : "msg-err"}`} style={{ marginTop: 16 }}>
          VERIFIED: {q.outcome ? "YES" : "NO"} — {shortDate(q.resolved_at!)}. Crowd had YES at{" "}
          {pct(Number(q.final_yes_prob))}, which was{" "}
          {Number(q.final_yes_prob) > 0.5 === q.outcome && Number(q.final_yes_prob) !== 0.5 ? "CORRECT" : "INCORRECT"}.
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
        <div><div className="k">Credits staked</div><div className="v accent">{stakes!.yes + stakes!.no}</div></div>
        <div><div className="k">{q.closes_at ? "Closes" : "Traders"}</div><div className="v">{q.closes_at ? shortDate(q.closes_at) : stakes!.traders}</div></div>
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
              <span>{stakes!.traders} traders</span>
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
                        <td>{who(a.user_id, a.username)}{a.bonus > 0 && <span className="tag tag-warn" style={{ marginLeft: 8 }}>+{a.bonus} lucky</span>}</td>
                        <td className={a.side ? "yes" : "no"}>{a.side ? "YES" : "NO"}</td>
                        <td className="r">{a.weight}</td>
                        <td className="r">{a.credits}</td>
                        <td className="r dim">{q.status === "resolved" ? (a.payout ?? 0) + " CR" : ago(a.created_at)}</td>
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
            yesStake={stakes!.yes}
            noStake={stakes!.no}
            open={open}
            user={user?.username ? { credits: user.credits, hasFree: mine!.free === 0, hasVoted: mine!.n > 0 } : null}
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

          {user?.username && !isAdmin && q.status === "open" && <ReportButton questionId={q.id} alreadyReported={!!reported} />}

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
                <form action={dismissReports}>
                  <input type="hidden" name="question_id" value={q.id} />
                  <button className="btn btn-ghost btn-block">Dismiss reports</button>
                </form>
              </div>
            </div>
          )}

          {user?.is_admin && q.status === "open" && (
            <div className="panel" style={{ borderColor: "var(--warn)" }}>
              <div className="panel-head" style={{ color: "var(--warn)", borderColor: "var(--warn)" }}><span>Admin</span></div>
              <div className="panel-body">
                <div className="label">Verify outcome (pays out stakes)</div>
                <div className="sides">
                  <form action={verifyQuestion}>
                    <input type="hidden" name="question_id" value={q.id} />
                    <input type="hidden" name="outcome" value="yes" />
                    <button className="btn btn-yes btn-block">Verify YES</button>
                  </form>
                  <form action={verifyQuestion}>
                    <input type="hidden" name="question_id" value={q.id} />
                    <input type="hidden" name="outcome" value="no" />
                    <button className="btn btn-no btn-block">Verify NO</button>
                  </form>
                </div>
                <form action={removeQuestion}>
                  <input type="hidden" name="question_id" value={q.id} />
                  <label className="label" htmlFor="reason">Remove for protocol violation</label>
                  <input className="input" id="reason" name="reason" placeholder="Reason (e.g. not verifiable)" style={{ marginBottom: 8 }} />
                  <button className="btn btn-warn btn-block">Remove market</button>
                </form>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
