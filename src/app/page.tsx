"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Loading, useSession } from "@/components/Session";
import { ago, CATEGORIES, pct, shortDate, yesProb } from "@/lib/format";
import { useRpc } from "@/lib/useRpc";

type Row = {
  id: number;
  title: string;
  category: string;
  status: string;
  outcome: boolean | null;
  yes_votes: number;
  no_votes: number;
  closes_at: string | null;
  created_at: string;
  is_demo: boolean;
  username: string | null;
  voters: number;
};

const SORTS = ["hot", "new", "closing"];

export default function Home() {
  return (
    <Suspense fallback={<Loading />}>
      <Markets />
    </Suspense>
  );
}

function Markets() {
  const sp = useSearchParams();
  const { me } = useSession();
  const tab = sp.get("tab") === "resolved" ? "resolved" : "open";
  const sort = SORTS.includes(sp.get("sort") ?? "") ? sp.get("sort")! : "hot";
  const cat = CATEGORIES.includes(sp.get("cat") ?? "") ? sp.get("cat")! : null;
  const { data: rows, error, loading } = useRpc<Row[]>("list_markets", { p_tab: tab, p_sort: sort, p_cat: cat });

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
            {SORTS.map((s) => (
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

      {error ? (
        <div className="msg msg-err">ERR: {error}</div>
      ) : loading && !rows ? (
        <Loading />
      ) : !rows?.length ? (
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
              <Link key={q.id} href={`/market/?id=${q.id}`} className="card">
                <div className="card-meta">
                  <span>
                    {q.category}
                    {q.is_demo && <span className="tag" style={{ marginLeft: 8, fontSize: 10, padding: "0 4px" }}>demo</span>}
                  </span>
                  <span title={me?.is_admin ? "Visible to admin only" : undefined}>{q.username ? `@${q.username}` : "anon"}</span>
                </div>
                <div className="card-title">{q.title}</div>
                <div className="card-odds">
                  <div>
                    <span className="big-pct yes num">{pct(p)}</span> <span className="dim">YES</span>
                  </div>
                  {q.status === "resolved" ? (
                    <span className={`tag ${q.outcome ? "tag-yes" : "tag-no"}`}>Verified {q.outcome ? "YES" : "NO"}</span>
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
