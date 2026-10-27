"use client";

import { Loading, useSession } from "@/components/Session";
import { pct } from "@/lib/format";
import { useRpc } from "@/lib/useRpc";

type Row = { id: string; username: string; elo: number; hit: number; miss: number; markets: number; fines: number };

export default function LeaderboardPage() {
  const { me } = useSession();
  const { data: rows, error, loading } = useRpc<Row[]>("get_leaderboard");

  return (
    <div className="section">
      <h1 className="page-title">ELO leaderboard</h1>
      <p className="page-sub">
        Everyone starts at 100. When a market is verified, each credit you staked on the right side is +1 ELO and each
        credit on the wrong side is −1. Admin fines also come off ELO.
      </p>

      {error ? (
        <div className="msg msg-err">ERR: {error}</div>
      ) : loading && !rows ? (
        <Loading />
      ) : !rows?.length ? (
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
