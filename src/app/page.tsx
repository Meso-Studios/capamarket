import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { ago, CATEGORIES, pct, shortDate, yesProb } from "@/lib/format";

export const dynamic = "force-dynamic";

type Row = {
  id: number;
  title: string;
  category: string;
  status: string;
  outcome: boolean | null;
  yes_votes: number;
  no_votes: number;
  closes_at: Date | null;
  created_at: Date;
  username: string | null;
  voters: number;
  is_demo: boolean;
};

const SORTS = { hot: "(q.yes_votes + q.no_votes) desc", new: "q.created_at desc", closing: "q.closes_at asc nulls last" };

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; sort?: string; cat?: string }>;
}) {
  const sp = await searchParams;
  const isAdmin = !!(await getCurrentUser())?.is_admin;
  const tab = sp.tab === "resolved" ? "resolved" : "open";
  const sort = (sp.sort && sp.sort in SORTS ? sp.sort : "hot") as keyof typeof SORTS;
  const cat = CATEGORIES.includes(sp.cat ?? "") ? sp.cat! : null;

  const rows = await query<Row>(
    `select q.id, q.title, q.category, q.status, q.outcome, q.yes_votes, q.no_votes, q.closes_at, q.created_at, q.is_demo,
            u.username, (select count(distinct user_id)::int from votes v where v.question_id = q.id) voters
       from questions q join users u on u.id = q.creator_id
      where q.status = $1 and ($2::text is null or q.category = $2)
      order by ${tab === "resolved" ? "q.resolved_at desc" : SORTS[sort]}
      limit 100`,
    [tab, cat],
  );

  const href = (p: Record<string, string | null>) => {
    const next = { tab, sort, cat, ...p };
    const qs = new URLSearchParams(Object.entries(next).filter(([, v]) => v) as [string, string][]);
    return `/?${qs}`;
  };

  return (
    <div className="section">
      <div className="toolbar">
        <div className="seg">
          <Link href={href({ tab: "open" })} className={tab === "open" ? "on" : ""}>Live</Link>
          <Link href={href({ tab: "resolved" })} className={tab === "resolved" ? "on" : ""}>Verified</Link>
        </div>
        {tab === "open" && (
          <div className="seg">
            {Object.keys(SORTS).map((s) => (
              <Link key={s} href={href({ sort: s })} className={sort === s ? "on" : ""}>{s}</Link>
            ))}
          </div>
        )}
        <div className="spacer" />
        <div className="seg" style={{ overflowX: "auto", maxWidth: "100%" }}>
          <Link href={href({ cat: null })} className={!cat ? "on" : ""}>All</Link>
          {CATEGORIES.map((c) => (
            <Link key={c} href={href({ cat: c })} className={cat === c ? "on" : ""}>{c}</Link>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty">
          {tab === "open" ? (
            <>
              No live markets here. <Link href="/new" className="accent">Post the first question →</Link>
            </>
          ) : (
            "No verified markets yet."
          )}
        </div>
      ) : (
        <div className="grid">
          {rows.map((q) => {
            const p = yesProb(q.yes_votes, q.no_votes);
            const votes = q.yes_votes + q.no_votes;
            return (
              <Link key={q.id} href={`/q/${q.id}`} className="card">
                <div className="card-meta">
                  <span>{q.category}{q.is_demo && <span className="tag" style={{ marginLeft: 8, fontSize: 10, padding: "0 4px" }}>demo</span>}</span>
                  <span title={isAdmin ? "Visible to admin only" : undefined}>{isAdmin ? `@${q.username}` : "anon"}</span>
                </div>
                <div className="card-title">{q.title}</div>
                <div className="card-odds">
                  <div>
                    <span className="big-pct yes num">{pct(p)}</span> <span className="dim">YES</span>
                  </div>
                  {q.status === "resolved" ? (
                    <span className={`tag ${q.outcome ? "tag-yes" : "tag-no"}`}>
                      Verified {q.outcome ? "YES" : "NO"}
                    </span>
                  ) : (
                    <span className="no num">{pct(1 - p)} NO</span>
                  )}
                </div>
                <div className="bar" aria-hidden>
                  <span style={{ width: `${p * 100}%` }} />
                  <span />
                </div>
                <div className="card-foot num">
                  <span>{votes} votes · {q.voters} traders</span>
                  <span>{q.closes_at ? `closes ${shortDate(q.closes_at)}` : ago(q.created_at)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
