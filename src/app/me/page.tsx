"use client";

import Link from "next/link";
import { Loading, RequireUser, useSession } from "@/components/Session";
import { ago, pct, yesProb } from "@/lib/format";
import { useRpc } from "@/lib/useRpc";

type Profile = {
  positions: { id: number; title: string; status: string; outcome: boolean | null; yes_votes: number; no_votes: number; yes: number; no: number; staked: number; payout: number }[];
  ledger: { delta: number; reason: string; question_id: number | null; created_at: string }[];
};

export default function MePage() {
  return (
    <RequireUser>
      <Me />
    </RequireUser>
  );
}

function Me() {
  const { me } = useSession();
  const { data, error } = useRpc<Profile>("get_my_profile");
  if (!me) return null;

  return (
    <div className="section">
      <h1 className="page-title">@{me.username}</h1>
      <p className="page-sub">{me.email}</p>

      <div className="stats num">
        <div><div className="k">Credits</div><div className="v accent">{me.credits}</div></div>
        <div><div className="k">ELO</div><div className="v"><Link href="/leaderboard">{me.elo}</Link></div></div>
        <div><div className="k">Markets traded</div><div className="v">{data?.positions.length ?? "…"}</div></div>
        <div><div className="k">Credits staked</div><div className="v">{data ? data.positions.reduce((s, p) => s + p.staked, 0) : "…"}</div></div>
      </div>

      {error && <div className="msg msg-err">ERR: {error}</div>}
      {!data ? (
        <Loading />
      ) : (
        <div className="layout-2">
          <div className="panel">
            <div className="panel-head"><span>Positions</span></div>
            {data.positions.length === 0 ? (
              <div className="panel-body dim">No votes yet. <Link href="/" className="accent">Browse markets →</Link></div>
            ) : (
              <div className="table-scroll">
                <table className="table num">
                  <thead><tr><th>Market</th><th className="r">YES/NO votes</th><th className="r">Staked</th><th className="r">Result</th></tr></thead>
                  <tbody>
                    {data.positions.map((p) => (
                      <tr key={p.id}>
                        <td>{p.status === "removed" ? p.title : <Link href={`/market/?id=${p.id}`}>{p.title}</Link>}</td>
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
                  {data.ledger.map((l, i) => (
                    <tr key={i}>
                      <td className={l.delta >= 0 ? "accent" : "no"} style={{ width: 60 }}>{l.delta >= 0 ? "+" : ""}{l.delta}</td>
                      <td>
                        {l.question_id ? <Link href={`/market/?id=${l.question_id}`}>{l.reason}</Link> : l.reason}
                        <div className="dim" style={{ fontSize: 11 }}>{ago(l.created_at)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
