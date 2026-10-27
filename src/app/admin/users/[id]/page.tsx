import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { ago, shortDate } from "@/lib/format";
import { setUserDisabled } from "@/app/actions";
import { AdminNav } from "@/components/AdminNav";
import { FineForm, WarnForm } from "@/components/ModerationForms";

export const dynamic = "force-dynamic";

type U = {
  id: string;
  username: string | null;
  email: string;
  credits: number;
  elo: number;
  is_admin: boolean;
  google_id: string | null;
  disabled_at: Date | null;
  disabled_reason: string | null;
  created_at: Date;
};

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const u = await one<U>("select * from users where id = $1", [id]);
  if (!u) notFound();

  const [posts, notices, elo] = await Promise.all([
    query<{ id: number; title: string; status: string; reports: number; created_at: Date }>(
      `select q.id, q.title, q.status, q.created_at, (select count(*)::int from reports r where r.question_id = q.id) reports
         from questions q where q.creator_id = $1 order by q.created_at desc limit 50`,
      [id],
    ),
    query<{ kind: string; message: string; elo_delta: number; read_at: Date | null; created_at: Date }>(
      "select kind, message, elo_delta, read_at, created_at from user_notices where user_id = $1 order by created_at desc",
      [id],
    ),
    query<{ delta: number; kind: string; reason: string; question_id: number | null; created_at: Date }>(
      "select delta, kind, reason, question_id, created_at from elo_ledger where user_id = $1 order by created_at desc limit 30",
      [id],
    ),
  ]);
  const warnings = notices.filter((n) => n.kind === "warning").length;

  return (
    <div className="section">
      <AdminNav active="users" />
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h1 className="page-title">@{u.username ?? "—"}</h1>
        {u.disabled_at ? <span className="tag tag-no">disabled {ago(u.disabled_at)}</span> : <span className="tag tag-ok">active</span>}
        {u.is_admin && <span className="tag tag-warn">admin</span>}
      </div>
      <p className="page-sub">
        {u.email} · {u.google_id ? "Google" : "email"} login · joined {shortDate(u.created_at)}
        {u.disabled_reason && <> · <span className="no">disabled: {u.disabled_reason}</span></>}
      </p>

      <div className="stats num">
        <div><div className="k">ELO</div><div className="v">{u.elo}</div></div>
        <div><div className="k">Credits</div><div className="v accent">{u.credits}</div></div>
        <div><div className="k">Posts</div><div className="v">{posts.length}</div></div>
        <div><div className="k">Warnings</div><div className="v" style={{ color: warnings ? "var(--warn)" : undefined }}>{warnings}</div></div>
      </div>

      <div className="layout-2">
        <div style={{ display: "grid", gap: 24, minWidth: 0 }}>
          <div className="panel">
            <div className="panel-head"><span>Posts</span></div>
            {posts.length === 0 ? (
              <div className="panel-body dim">No posts.</div>
            ) : (
              <div className="table-scroll">
                <table className="table num">
                  <tbody>
                    {posts.map((p) => (
                      <tr key={p.id}>
                        <td><Link href={`/q/${p.id}`}>{p.title}</Link><div className="dim" style={{ fontSize: 12 }}>{ago(p.created_at)}</div></td>
                        <td><span className={`tag ${p.status === "removed" ? "tag-warn" : p.status === "resolved" ? "tag-ok" : ""}`}>{p.status}</span></td>
                        <td className={`r ${p.reports ? "no" : "dim"}`}>{p.reports} ⚑</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="panel">
            <div className="panel-head"><span>Moderation history</span></div>
            {notices.length === 0 ? (
              <div className="panel-body dim">Clean record.</div>
            ) : (
              <div className="table-scroll">
                <table className="table">
                  <tbody>
                    {notices.map((n, i) => (
                      <tr key={i}>
                        <td style={{ width: 110 }}>
                          <span className={`tag ${n.kind === "warning" ? "tag-warn" : n.kind === "info" ? "" : "tag-no"}`}>{n.kind}</span>
                        </td>
                        <td>
                          {n.message}
                          {n.elo_delta !== 0 && <span className="no"> ({n.elo_delta} ELO)</span>}
                          <div className="dim" style={{ fontSize: 12 }}>{ago(n.created_at)} · {n.read_at ? "acknowledged" : "unread"}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="panel">
            <div className="panel-head"><span>ELO history</span></div>
            {elo.length === 0 ? (
              <div className="panel-body dim">Still at the starting 100.</div>
            ) : (
              <div className="table-scroll">
                <table className="table num">
                  <tbody>
                    {elo.map((e, i) => (
                      <tr key={i}>
                        <td className={e.delta >= 0 ? "accent" : "no"} style={{ width: 70 }}>{e.delta >= 0 ? "+" : ""}{e.delta}</td>
                        <td>{e.question_id ? <Link href={`/q/${e.question_id}`}>{e.reason}</Link> : e.reason}</td>
                        <td className="r dim">{ago(e.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {u.is_admin ? (
          <aside className="panel"><div className="panel-body dim">Admin accounts can&apos;t be moderated here.</div></aside>
        ) : (
          <aside style={{ display: "grid", gap: 16 }}>
            <div className="panel">
              <div className="panel-head" style={{ color: "var(--warn)" }}><span>1 · Warn</span></div>
              <div className="panel-body"><WarnForm userId={u.id} /></div>
            </div>
            <div className="panel">
              <div className="panel-head" style={{ color: "var(--no)" }}><span>2 · Fine ELO</span></div>
              <div className="panel-body"><FineForm userId={u.id} /></div>
            </div>
            <div className="panel" style={{ borderColor: "var(--no)" }}>
              <div className="panel-head" style={{ color: "var(--no)", borderColor: "var(--no)" }}><span>3 · {u.disabled_at ? "Re-enable" : "Disable"} account</span></div>
              <form action={setUserDisabled} className="panel-body">
                <input type="hidden" name="user_id" value={u.id} />
                <input type="hidden" name="disable" value={u.disabled_at ? "false" : "true"} />
                {u.disabled_at ? (
                  <button className="btn btn-block">Re-enable account</button>
                ) : (
                  <>
                    <input className="input" name="reason" placeholder="Reason" maxLength={500} style={{ marginBottom: 8 }} />
                    <button className="btn btn-no on btn-block">Disable account</button>
                    <p className="hint" style={{ marginBottom: 0 }}>Signs them out everywhere and blocks login. Their posts stay up.</p>
                  </>
                )}
              </form>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
