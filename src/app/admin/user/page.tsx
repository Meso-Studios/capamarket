"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AdminButton } from "@/components/AdminButton";
import { AdminNav } from "@/components/AdminNav";
import { FineForm, WarnForm } from "@/components/ModerationForms";
import { Loading, RequireUser } from "@/components/Session";
import { ago, shortDate } from "@/lib/format";
import { rpc } from "@/lib/supabase";
import { useRpc } from "@/lib/useRpc";

type Detail = {
  user: {
    id: string;
    username: string | null;
    email: string;
    credits: number;
    elo: number;
    is_admin: boolean;
    disabled_at: string | null;
    disabled_reason: string | null;
    created_at: string;
  };
  posts: { id: number; title: string; status: string; reports: number; created_at: string }[];
  notices: { kind: string; message: string; elo_delta: number; read_at: string | null; created_at: string }[];
  elo: { delta: number; kind: string; reason: string; question_id: number | null; created_at: string }[];
};

export default function AdminUserPage() {
  return (
    <RequireUser admin>
      <Suspense fallback={<Loading />}>
        <UserDetail />
      </Suspense>
    </RequireUser>
  );
}

function UserDetail() {
  const id = useSearchParams().get("id") ?? "";
  const { data, error, reload } = useRpc<Detail | null>(/^[0-9a-f-]{36}$/.test(id) ? "admin_get_user" : null, { p_id: id });
  const [reason, setReason] = useState("");

  if (error) return <div className="msg msg-err" style={{ marginTop: 28 }}>ERR: {error}</div>;
  if (!data) return <Loading />;
  const { user: u, posts, notices, elo } = data;
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
        {u.email} · joined {shortDate(u.created_at)}
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
                        <td><Link href={`/market/?id=${p.id}`}>{p.title}</Link><div className="dim" style={{ fontSize: 12 }}>{ago(p.created_at)}</div></td>
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
                        <td>{e.question_id ? <Link href={`/market/?id=${e.question_id}`}>{e.reason}</Link> : e.reason}</td>
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
              <div className="panel-body"><WarnForm userId={u.id} onDone={reload} /></div>
            </div>
            <div className="panel">
              <div className="panel-head" style={{ color: "var(--no)" }}><span>2 · Fine ELO</span></div>
              <div className="panel-body"><FineForm userId={u.id} onDone={reload} /></div>
            </div>
            <div className="panel" style={{ borderColor: "var(--no)" }}>
              <div className="panel-head" style={{ color: "var(--no)", borderColor: "var(--no)" }}><span>3 · {u.disabled_at ? "Re-enable" : "Disable"} account</span></div>
              <div className="panel-body">
                {u.disabled_at ? (
                  <AdminButton className="btn btn-block" run={() => rpc("admin_set_disabled", { p_user: u.id, p_disable: false, p_reason: null })} after={reload}>
                    Re-enable account
                  </AdminButton>
                ) : (
                  <>
                    <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" maxLength={500} style={{ marginBottom: 8 }} />
                    <AdminButton className="btn btn-no on btn-block" confirm={`Disable @${u.username}? They'll be signed out and blocked.`}
                      run={() => rpc("admin_set_disabled", { p_user: u.id, p_disable: true, p_reason: reason })} after={reload}>
                      Disable account
                    </AdminButton>
                    <p className="hint" style={{ marginBottom: 0 }}>Signs them out everywhere and blocks login. Their posts stay up.</p>
                  </>
                )}
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
