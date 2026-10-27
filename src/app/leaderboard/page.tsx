import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { pct } from "@/lib/format";

export const dynamic = "force-dynamic";

type Row = { id: string; username: string; elo: number; hit: number; miss: number; markets: number; fines: number };

export default async function LeaderboardPage() {
  const me = await getCurrentUser();
  const rows = await query<Row>(
    `select u.id, u.username, u.elo,
            coalesce(sum(v.credits) filter (where q.status = 'resolved' and v.side = q.outcome), 0)::int hit,
            coalesce(sum(v.credits) filter (where q.status = 'resolved' and v.side <> q.outcome), 0)::int miss,
            count(distinct v.question_id) filter (where q.status = 'resolved' and v.credits > 0)::int markets,
            (select coalesce(-sum(delta), 0)::int from elo_ledger e where e.user_id = u.id and e.kind = 'fine') fines
       from users u
       left join votes v on v.user_id = u.id
       left join questions q on q.id = v.question_id
      where u.username is not null and not u.is_admin and u.disabled_at is null
      group by u.id
      order by u.elo desc, u.created_at asc
      limit 200`,
  );

  return (
    <div className="section">
      <h1 className="page-title">ELO leaderboard</h1>
      <p className="page-sub">
        Everyone starts at 100. When a market is verified, each credit you staked on the right side is +1 ELO and each
        credit on the wrong side is −1. Admin fines also come off ELO.
      </p>

      {rows.length === 0 ? (
        <div className="empty">No traders yet.</div>
      ) : (
        <div className="panel">
          <div className="table-scroll">
            <table className="table num">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Trader</th>
                  <th className="r">ELO</th>
                  <th className="r">Hit CR</th>
                  <th className="r">Miss CR</th>
                  <th className="r">Hit rate</th>
                  <th className="r">Verified mkts</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const mine = r.id === me?.id;
                  return (
                    <tr key={r.id} style={mine ? { background: "var(--panel-2)", outline: "1px solid var(--accent)" } : undefined}>
                      <td className={i < 3 ? "accent" : "dim"} style={{ fontWeight: 800 }}>{String(i + 1).padStart(2, "0")}</td>
                      <td>
                        @{r.username}
                        {mine && <span className="tag tag-ok" style={{ marginLeft: 8 }}>you</span>}
                        {r.fines > 0 && <span className="tag tag-warn" style={{ marginLeft: 8 }} title="ELO lost to admin fines">−{r.fines} fined</span>}
                      </td>
                      <td className="r" style={{ fontWeight: 800, fontSize: 16, color: r.elo >= 100 ? "var(--accent)" : "var(--no)" }}>{r.elo}</td>
                      <td className="r yes">{r.hit}</td>
                      <td className="r no">{r.miss}</td>
                      <td className="r">{r.hit + r.miss ? pct(r.hit / (r.hit + r.miss)) : "—"}</td>
                      <td className="r dim">{r.markets}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
