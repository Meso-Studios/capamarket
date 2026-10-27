import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { ago } from "@/lib/format";
import { AdminNav } from "@/components/AdminNav";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  username: string | null;
  email: string;
  credits: number;
  elo: number;
  is_admin: boolean;
  disabled_at: Date | null;
  created_at: Date;
  posts: number;
  removed: number;
  reports: number;
  warnings: number;
  fines: number;
};

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdmin();
  const q = ((await searchParams).q ?? "").trim().toLowerCase();
  const users = await query<Row>(
    `select u.id, u.username, u.email, u.credits, u.elo, u.is_admin, u.disabled_at, u.created_at,
            (select count(*)::int from questions x where x.creator_id = u.id) posts,
            (select count(*)::int from questions x where x.creator_id = u.id and x.status = 'removed') removed,
            (select count(*)::int from reports r join questions x on x.id = r.question_id where x.creator_id = u.id) reports,
            (select count(*)::int from user_notices n where n.user_id = u.id and n.kind = 'warning') warnings,
            (select coalesce(-sum(delta), 0)::int from elo_ledger e where e.user_id = u.id and e.kind = 'fine') fines
       from users u
      where $1 = '' or u.username like '%' || $1 || '%' or u.email like '%' || $1 || '%'
      order by u.disabled_at is not null, (select count(*) from reports r join questions x on x.id = r.question_id where x.creator_id = u.id) desc, u.created_at desc`,
    [q],
  );

  return (
    <div className="section">
      <AdminNav active="users" />
      <h1 className="page-title" style={{ color: "var(--warn)" }}>Users</h1>
      <p className="page-sub">Most-reported first. Open a user to warn them, fine ELO, or disable the account.</p>

      <form className="toolbar" style={{ marginTop: 0 }}>
        <input className="input" name="q" defaultValue={q} placeholder="search username or email" style={{ maxWidth: 320 }} />
        <button className="btn">Search</button>
      </form>

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
                    <Link href={`/admin/users/${u.id}`} className="accent">@{u.username ?? "—"}</Link>
                    {u.is_admin && <span className="tag tag-warn" style={{ marginLeft: 6 }}>admin</span>}
                    <div className="dim" style={{ fontSize: 12 }}>{u.email}</div>
                  </td>
                  <td>
                    {u.disabled_at ? <span className="tag tag-no">disabled</span> : <span className="tag tag-ok">active</span>}
                  </td>
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
    </div>
  );
}
