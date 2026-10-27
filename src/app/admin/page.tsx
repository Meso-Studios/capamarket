import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { ago, pct, yesProb } from "@/lib/format";
import { dismissReports, removeQuestion, verifyQuestion } from "@/app/actions";
import { AdminNav } from "@/components/AdminNav";

export const dynamic = "force-dynamic";

type Row = {
  id: number;
  title: string;
  status: string;
  outcome: boolean | null;
  yes_votes: number;
  no_votes: number;
  staked: number;
  removed_reason: string | null;
  created_at: Date;
  username: string;
};

const BASE = `select q.id, q.title, q.status, q.outcome, q.yes_votes, q.no_votes, q.removed_reason, q.created_at, u.username,
                     (select coalesce(sum(credits), 0)::int from votes v where v.question_id = q.id) staked
                from questions q join users u on u.id = q.creator_id`;

export default async function AdminPage() {
  await requireAdmin();
  const [reports, open, closed] = await Promise.all([
    query<{ question_id: number; title: string; creator_id: string; creator: string; n: number; reasons: string[]; details: string[]; last: Date }>(
      `select r.question_id, q.title, q.creator_id, u.username creator, count(*)::int n,
              array_agg(distinct r.reason) reasons, array_remove(array_agg(r.details), '') details, max(r.created_at) last
         from reports r join questions q on q.id = r.question_id join users u on u.id = q.creator_id
        where r.status = 'open'
        group by r.question_id, q.title, q.creator_id, u.username
        order by count(*) desc, max(r.created_at) desc`,
    ),
    query<Row>(`${BASE} where q.status = 'open' order by q.created_at asc`),
    query<Row>(`${BASE} where q.status <> 'open' order by coalesce(q.resolved_at, q.created_at) desc limit 30`),
  ]);

  return (
    <div className="section">
      <AdminNav active="markets" />
      <h1 className="page-title" style={{ color: "var(--warn)" }}>Admin console</h1>
      <p className="page-sub">Verify outcomes to pay out stakes and update the accuracy tally. Remove markets that violate protocol (stakes are refunded).</p>

      <div className="panel" style={{ borderColor: reports.length ? "var(--no)" : undefined, marginBottom: 24 }}>
        <div className="panel-head" style={reports.length ? { color: "var(--no)", borderColor: "var(--no)" } : undefined}>
          <span>⚑ Reports</span>
          <span>{reports.length} open</span>
        </div>
        {reports.length === 0 ? (
          <div className="panel-body dim">No open reports.</div>
        ) : (
          <div className="table-scroll">
            <table className="table num">
              <thead>
                <tr><th>Market</th><th>Reasons</th><th className="r">Reports</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.question_id}>
                    <td style={{ minWidth: 240 }}>
                      <Link href={`/q/${r.question_id}`}>{r.title}</Link>
                      <div className="dim" style={{ fontSize: 12 }}>
                        by <Link href={`/admin/users/${r.creator_id}`} className="accent">@{r.creator}</Link> · last {ago(r.last)}
                      </div>
                      {r.details.slice(0, 2).map((d, i) => (
                        <div key={i} className="muted" style={{ fontSize: 12 }}>“{d}”</div>
                      ))}
                    </td>
                    <td>{r.reasons.map((x) => <span key={x} className="tag tag-no" style={{ marginRight: 4 }}>{x}</span>)}</td>
                    <td className="r no" style={{ fontWeight: 800 }}>{r.n}</td>
                    <td>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <form action={removeQuestion} style={{ display: "flex", gap: 6 }}>
                          <input type="hidden" name="question_id" value={r.question_id} />
                          <input type="hidden" name="reason" value={r.reasons.join(", ")} />
                          <button className="btn btn-warn" style={{ padding: "5px 8px" }}>Remove</button>
                        </form>
                        <form action={dismissReports}>
                          <input type="hidden" name="question_id" value={r.question_id} />
                          <button className="btn" style={{ padding: "5px 8px" }}>Dismiss</button>
                        </form>
                        <Link href={`/admin/users/${r.creator_id}`} className="btn" style={{ padding: "5px 8px" }}>Warn / fine poster</Link>
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
        <div className="panel-head"><span>Live queue</span><span>{open.length} markets</span></div>
        {open.length === 0 ? (
          <div className="panel-body dim">Nothing to review.</div>
        ) : (
          <div className="table-scroll">
            <table className="table num">
              <thead>
                <tr><th>#</th><th>Market</th><th className="r">YES</th><th className="r">Staked</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {open.map((q) => (
                  <tr key={q.id}>
                    <td className="dim">{q.id}</td>
                    <td style={{ minWidth: 260 }}>
                      <Link href={`/q/${q.id}`}>{q.title}</Link>
                      <div className="dim" style={{ fontSize: 12 }}>@{q.username} · {ago(q.created_at)}</div>
                    </td>
                    <td className="r yes">{pct(yesProb(q.yes_votes, q.no_votes))}</td>
                    <td className="r">{q.staked}</td>
                    <td>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <form action={verifyQuestion}>
                          <input type="hidden" name="question_id" value={q.id} />
                          <input type="hidden" name="outcome" value="yes" />
                          <button className="btn btn-yes" style={{ padding: "5px 8px" }}>✓ YES</button>
                        </form>
                        <form action={verifyQuestion}>
                          <input type="hidden" name="question_id" value={q.id} />
                          <input type="hidden" name="outcome" value="no" />
                          <button className="btn btn-no" style={{ padding: "5px 8px" }}>✓ NO</button>
                        </form>
                        <form action={removeQuestion} style={{ display: "flex", gap: 6 }}>
                          <input type="hidden" name="question_id" value={q.id} />
                          <input className="input" name="reason" placeholder="reason" style={{ padding: "5px 8px", width: 130 }} />
                          <button className="btn btn-warn" style={{ padding: "5px 8px" }}>Remove</button>
                        </form>
                      </div>
                    </td>
                  </tr>
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
              {closed.map((q) => (
                <tr key={q.id}>
                  <td className="dim">{q.id}</td>
                  <td><Link href={`/q/${q.id}`}>{q.title}</Link></td>
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

    </div>
  );
}
