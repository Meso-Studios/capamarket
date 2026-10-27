"use client";

import Link from "next/link";
import { pct, shortDate } from "@/lib/format";
import { useRpc } from "@/lib/useRpc";

type About = {
  n: number;
  correct: number;
  brier: number | null;
  recent: { id: number; title: string; outcome: boolean; final_yes_prob: number; resolved_at: string }[];
};

export default function AboutPage() {
  // A market counts as "correct" when the crowd's final YES probability was on the
  // verified side of 50%. Brier score is the mean squared error of those forecasts.
  const { data } = useRpc<About>("get_about");
  const n = data?.n ?? 0;
  const accuracy = n ? data!.correct / n : null;

  return (
    <div className="section">
      <h1 className="page-title">About</h1>
      <p className="page-sub">How well does the crowd see the future? Every verified market is added to this running tally.</p>

      <div className="tally num">
        <div>
          <div className="v">{data ? n : "…"}</div>
          <div className="k">events predicted</div>
        </div>
        <div>
          <div className="v">{accuracy === null ? "—" : pct(accuracy)}</div>
          <div className="k">accuracy{data?.brier != null ? ` · Brier ${Number(data.brier).toFixed(3)}` : ""}</div>
        </div>
      </div>

      {!!data?.recent.length && (
        <div className="panel" style={{ marginBottom: 32 }}>
          <div className="panel-head"><span>Verified events</span><span>crowd call vs. outcome</span></div>
          <div className="table-scroll">
            <table className="table num">
              <thead><tr><th>Market</th><th className="r">Final YES</th><th className="r">Outcome</th><th className="r">Call</th><th className="r">Verified</th></tr></thead>
              <tbody>
                {data.recent.map((r) => {
                  const p = Number(r.final_yes_prob);
                  const right = p !== 0.5 && p > 0.5 === r.outcome;
                  return (
                    <tr key={r.id}>
                      <td><Link href={`/market/?id=${r.id}`}>{r.title}</Link></td>
                      <td className="r yes">{pct(p)}</td>
                      <td className={`r ${r.outcome ? "yes" : "no"}`}>{r.outcome ? "YES" : "NO"}</td>
                      <td className="r"><span className={`tag ${right ? "tag-ok" : "tag-no"}`}>{right ? "HIT" : "MISS"}</span></td>
                      <td className="r dim">{shortDate(r.resolved_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="prose">
        <h2>// What this is</h2>
        <p>
          CapaMarket is a prediction market that runs on credits, not money. Nothing can be bought, sold, deposited or
          withdrawn, and credits have no cash value. It exists to measure how good a crowd is at forecasting.
        </p>
        <h2>// Credits</h2>
        <ul>
          <li>Every account starts with <code>10</code> credits.</li>
          <li>Post a question → earn <code>+1</code> credit.</li>
          <li>Every user gets <code>1</code> free vote per market.</li>
          <li>Each extra credit you put in = <code>1</code> more vote on your side.</li>
          <li>The first time you vote on a market there is a <code>1 in 5</code> chance you get <code>+5</code> bonus credits.</li>
        </ul>
        <h2>// Verification &amp; payouts</h2>
        <ul>
          <li>An admin verifies the real-world outcome (YES or NO).</li>
          <li>All credits staked in that market form a pool, split among stakers on the winning side in proportion to their stake.</li>
          <li>If nobody staked on the winning side, every stake is refunded. Free votes count toward the odds but don&apos;t pay out.</li>
          <li>Markets that break protocol (not verifiable, abusive, duplicate) are removed and all stakes are refunded.</li>
        </ul>
        <h2>// ELO</h2>
        <ul>
          <li>Everyone starts at <code>100</code> ELO.</li>
          <li>When a market is verified: <code>+1</code> ELO per credit you staked on the correct side, <code>-1</code> per credit on the wrong side.</li>
          <li>Admins can fine ELO for abuse. See the <Link href="/leaderboard" className="accent">leaderboard</Link>.</li>
        </ul>
        <h2>// Anonymity &amp; moderation</h2>
        <ul>
          <li>Posts are anonymous: only the admin can see who created a market or who traded in it.</li>
          <li>Use <code>⚑ Report post</code> on a market to flag it for the admin.</li>
          <li>Abuse earns warnings, then ELO fines, and eventually a disabled account.</li>
        </ul>
        <h2>// Accuracy</h2>
        <p>
          When a market is verified, the crowd&apos;s final YES probability is recorded. The call counts as a hit when it was
          above 50% and the event happened, or below 50% and it didn&apos;t. Accuracy is hits ÷ events predicted. The Brier score
          (lower is better, 0 = perfect) also rewards confidence.
        </p>
      </div>
    </div>
  );
}
