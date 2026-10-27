import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { ago, pct, yesProb } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const user = await requireUser();
  const [positions, ledger] = await Promise.all([
    query<{ id: number; title: string; status: string; outcome: boolean | null; yes_votes: number; no_votes: number; yes: number; no: number; staked: number; payout: number }>(
      `select q.id, q.title, q.status, q.outcome, q.yes_votes, q.no_votes,
              coalesce(sum(v.weight) filter (where v.side), 0)::int yes,
              coalesce(sum(v.weight) filter (where not v.side), 0)::int no,
              sum(v.credits)::int staked, coalesce(sum(v.payout), 0)::int payout
         from votes v join questions q on q.id = v.question_id
        where v.user_id = $1
        group by q.id order by max(v.created_at) desc`,
      [user.id],
    ),
    query<{ delta: number; reason: string; question_id: number | null; created_at: Date }>(
      "select delta, reason, question_id, created_at from credit_ledger where user_id = $1 order by created_at desc, id desc limit 50",
      [user.id],
    ),
  ]);

  return (
    <div className="section">
      <h1 className="page-title">@{user.username}</h1>
      <p className="page-sub">{user.email}</p>

      <div className="stats num">
        <div><div className="k">Credits</div><div className="v accent">{user.credits}</div></div>
        <div><div className="k">ELO</div><div className="v"><Link href="/leaderboard">{user.elo}</Link></div></div>
        <div><div className="k">Markets traded</div><div className="v">{positions.length}</div></div>
      </div>

      <div className="layout-2">
        <div className="panel">
          <div className="panel-head"><span>Positions</span></div>
          {positions.length === 0 ? (
            <div className="panel-body dim">No votes yet. <Link href="/" className="accent">Browse markets →</Link></div>
          ) : (
            <div className="table-scroll">
              <table className="table num">
                <thead><tr><th>Market</th><th className="r">YES/NO votes</th><th className="r">Staked</th><th className="r">Result</th></tr></thead>
                <tbody>
                  {positions.map((p) => (
                    <tr key={p.id}>
                      <td><Link href={`/q/${p.id}`}>{p.title}</Link></td>
                      <td className="r"><span className="yes">{p.yes}</span> / <span className="no">{p.no}</span></td>
                      <td className="r">{p.staked}</td>
                      <td className="r">
                        {p.status === "resolved" ? (
                          <span className="accent">+{p.payout} CR</span>
                        ) : p.status === "removed" ? (
                          <span className="dim">refunded</span>
                        ) : (
                          <span className="dim">{pct(yesProb(p.yes_votes, p.no_votes))} YES</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-head"><span>Credit ledger</span></div>
          <div className="table-scroll">
            <table className="table num">
              <tbody>
                {ledger.map((l, i) => (
                  <tr key={i}>
                    <td className={l.delta >= 0 ? "accent" : "no"} style={{ width: 60 }}>{l.delta >= 0 ? "+" : ""}{l.delta}</td>
                    <td>
                      {l.question_id ? <Link href={`/q/${l.question_id}`}>{l.reason}</Link> : l.reason}
                      <div className="dim" style={{ fontSize: 11 }}>{ago(l.created_at)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
