"use client";

import Link from "next/link";
import { useState } from "react";
import { AdminNav } from "@/components/AdminNav";
import { Loading, RequireUser } from "@/components/Session";
import { ago } from "@/lib/format";
import { useRpc } from "@/lib/useRpc";

type Row = {
  id: string;
  username: string | null;
  email: string;
  credits: number;
  elo: number;
  is_admin: boolean;
  disabled_at: string | null;
  created_at: string;
  posts: number;
  removed: number;
  reports: number;
  warnings: number;
  fines: number;
};

export default function AdminUsersPage() {
  return (
    <RequireUser admin>
      <Users />
    </RequireUser>
  );
}

function Users() {
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const { data: users, error } = useRpc<Row[]>("admin_list_users", { p_q: q });

  return (
    <div className="section">
      <AdminNav active="users" />
      <h1 className="page-title" style={{ color: "var(--warn)" }}>Users</h1>
      <p className="page-sub">Most-reported first. Open a user to warn them, fine ELO, or disable the account.</p>

      <form
        className="toolbar"
        style={{ marginTop: 0 }}
        onSubmit={(e) => {
          e.preventDefault();
          setQ(draft);
        }}
      >
        <input className="input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="search username or email" style={{ maxWidth: 320 }} />
        <button className="btn">Search</button>
      </form>

      {error && <div className="msg msg-err">ERR: {error}</div>}
      {!users ? (
        <Loading />
      ) : (
        <div className="panel">
          <div className="table-scroll">
            <table className="table num">
              <thead>
                <tr>
                  <th>User</th><th>Status</th><th className="r">ELO</th><th className="r">CR</th><th className="r">Posts</th>
                  <th className="r">Reported</th><th className="r">Warnings</th><th className="r">Fined</th><th className="r">Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <Link href={`/admin/user/?id=${u.id}`} className="accent">@{u.username ?? "—"}</Link>
                      {u.is_admin && <span className="tag tag-warn" style={{ marginLeft: 6 }}>admin</span>}
                      <div className="dim" style={{ fontSize: 12 }}>{u.email}</div>
                    </td>
                    <td>{u.disabled_at ? <span className="tag tag-no">disabled</span> : <span className="tag tag-ok">active</span>}</td>
                    <td className="r" style={{ fontWeight: 800 }}>{u.elo}</td>
                    <td className="r">{u.credits}</td>
                    <td className="r">{u.posts}{u.removed > 0 && <span className="dim"> ({u.removed} rm)</span>}</td>
                    <td className={`r ${u.reports ? "no" : "dim"}`}>{u.reports}</td>
                    <td className={`r ${u.warnings ? "" : "dim"}`} style={u.warnings ? { color: "var(--warn)" } : undefined}>{u.warnings}</td>
                    <td className={`r ${u.fines ? "no" : "dim"}`}>{u.fines ? `−${u.fines}` : 0}</td>
                    <td className="r dim">{ago(u.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
