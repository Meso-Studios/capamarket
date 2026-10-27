"use client";

import Link from "next/link";
import { useState } from "react";
import { AdminButton } from "@/components/AdminButton";
import { AdminNav } from "@/components/AdminNav";
import { Loading, RequireUser, useSession } from "@/components/Session";
import { ago, pct, yesProb } from "@/lib/format";
import { rpc } from "@/lib/supabase";
import { useRpc } from "@/lib/useRpc";

type Overview = {
  reports: { question_id: number; title: string; creator_id: string; creator: string; n: number; reasons: string[]; details: string[]; last: string }[];
  open: { id: number; title: string; yes_votes: number; no_votes: number; created_at: string; username: string; staked: number }[];
  closed: { id: number; title: string; status: string; outcome: boolean | null; removed_reason: string | null; staked: number }[];
};

export default function AdminPage() {
  return (
    <RequireUser admin>
      <Admin />
    </RequireUser>
  );
}

function Admin() {
  const { refresh } = useSession();
  const { data, error, reload } = useRpc<Overview>("admin_overview");
  const changed = async () => {
    await Promise.all([reload(), refresh()]);
  };

  return (
    <div className="section">
      <AdminNav active="markets" />
      <h1 className="page-title" style={{ color: "var(--warn)" }}>Admin console</h1>
      <p className="page-sub">Verify outcomes to pay out stakes and update the accuracy tally. Remove markets that violate protocol (stakes are refunded).</p>
      {error && <div className="msg msg-err">ERR: {error}</div>}
      {!data ? (
        <Loading />
      ) : (
        <>
          <div className="panel" style={{ borderColor: data.reports.length ? "var(--no)" : undefined, marginBottom: 24 }}>
            <div className="panel-head" style={data.reports.length ? { color: "var(--no)", borderColor: "var(--no)" } : undefined}>
              <span>⚑ Reports</span>
              <span>{data.reports.length} open</span>
            </div>
            {data.reports.length === 0 ? (
              <div className="panel-body dim">No open reports.</div>
            ) : (
              <div className="table-scroll">
                <table className="table num">
                  <thead>
                    <tr><th>Market</th><th>Reasons</th><th className="r">Reports</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {data.reports.map((r) => (
                      <tr key={r.question_id}>
                        <td style={{ minWidth: 240 }}>
                          <Link href={`/market/?id=${r.question_id}`}>{r.title}</Link>
                          <div className="dim" style={{ fontSize: 12 }}>
                            by <Link href={`/admin/user/?id=${r.creator_id}`} className="accent">@{r.creator}</Link> · last {ago(r.last)}
                          </div>
                          {r.details.slice(0, 2).map((d, i) => (
                            <div key={i} className="muted" style={{ fontSize: 12 }}>“{d}”</div>
                          ))}
                        </td>
                        <td>{r.reasons.map((x) => <span key={x} className="tag tag-no" style={{ marginRight: 4 }}>{x}</span>)}</td>
                        <td className="r no" style={{ fontWeight: 800 }}>{r.n}</td>
                        <td>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <AdminButton className="btn btn-warn" confirm="Remove this market and refund all stakes?"
                              run={() => rpc("admin_remove", { p_id: r.question_id, p_reason: r.reasons.join(", ") })} after={changed}>Remove</AdminButton>
                            <AdminButton className="btn" run={() => rpc("admin_dismiss_reports", { p_id: r.question_id })} after={changed}>Dismiss</AdminButton>
                            <Link href={`/admin/user/?id=${r.creator_id}`} className="btn">Warn / fine poster</Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="panel">
            <div className="panel-head"><span>Live queue</span><span>{data.open.length} markets</span></div>
            {data.open.length === 0 ? (
              <div className="panel-body dim">Nothing to review.</div>
            ) : (
              <div className="table-scroll">
                <table className="table num">
                  <thead>
                    <tr><th>#</th><th>Market</th><th className="r">YES</th><th className="r">Staked</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {data.open.map((q) => (
                      <OpenRow key={q.id} q={q} onChanged={changed} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="panel" style={{ marginTop: 24 }}>
            <div className="panel-head"><span>Recently closed</span></div>
            <div className="table-scroll">
              <table className="table num">
                <thead><tr><th>#</th><th>Market</th><th>Status</th><th className="r">Staked</th></tr></thead>
                <tbody>
                  {data.closed.map((q) => (
                    <tr key={q.id}>
                      <td className="dim">{q.id}</td>
                      <td><Link href={`/market/?id=${q.id}`}>{q.title}</Link></td>
                      <td>
                        {q.status === "removed" ? (
                          <span className="tag tag-warn" title={q.removed_reason ?? ""}>Removed</span>
                        ) : (
                          <span className={`tag ${q.outcome ? "tag-yes" : "tag-no"}`}>Verified {q.outcome ? "YES" : "NO"}</span>
                        )}
                      </td>
                      <td className="r">{q.staked}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function OpenRow({ q, onChanged }: { q: Overview["open"][number]; onChanged: () => Promise<void> }) {
  const [reason, setReason] = useState("");
  return (
    <tr>
      <td className="dim">{q.id}</td>
      <td style={{ minWidth: 260 }}>
        <Link href={`/market/?id=${q.id}`}>{q.title}</Link>
        <div className="dim" style={{ fontSize: 12 }}>@{q.username} · {ago(q.created_at)}</div>
      </td>
      <td className="r yes">{pct(yesProb(q.yes_votes, q.no_votes))}</td>
      <td className="r">{q.staked}</td>
      <td>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <AdminButton className="btn btn-yes" confirm={`Verify #${q.id} as YES?`} run={() => rpc("admin_verify", { p_id: q.id, p_outcome: true })} after={onChanged}>✓ YES</AdminButton>
          <AdminButton className="btn btn-no" confirm={`Verify #${q.id} as NO?`} run={() => rpc("admin_verify", { p_id: q.id, p_outcome: false })} after={onChanged}>✓ NO</AdminButton>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="reason" style={{ padding: "5px 8px", width: 130 }} />
          <AdminButton className="btn btn-warn" confirm={`Remove #${q.id} and refund stakes?`} run={() => rpc("admin_remove", { p_id: q.id, p_reason: reason })} after={onChanged}>Remove</AdminButton>
        </div>
      </td>
    </tr>
  );
}
