"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { attempt, rpc, type FormState } from "@/lib/supabase";

type Props = {
  questionId: number;
  yesVotes: number;
  noVotes: number;
  yesStake: number;
  noStake: number;
  open: boolean;
  user: { credits: number; hasFree: boolean; hasVoted: boolean } | null;
  /** Called after a successful vote so the page and header can reload. */
  onVoted: () => void;
};

const pct = (p: number) => `${Math.round(p * 100)}%`;

export function VotePanel({ questionId, yesVotes, noVotes, yesStake, noStake, open, user, onVoted }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    (_, fd) =>
      attempt(async () => {
        const side = fd.get("side") === "yes";
        const r = await rpc<{ weight: number; bonus: number }>("cast_vote", {
          p_question_id: questionId,
          p_side: side,
          p_credits: Number(fd.get("credits") ?? 0),
        });
        onVoted();
        const msg = `+${r.weight} vote${r.weight > 1 ? "s" : ""} on ${side ? "YES" : "NO"}.`;
        return r.bonus ? `${msg} LUCKY ROLL: +${r.bonus} credits!` : msg;
      }),
    undefined,
  );
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [credits, setCredits] = useState(0);

  useEffect(() => {
    if (state?.ok) setCredits(0);
  }, [state]);

  const total = yesVotes + noVotes;
  const p = total ? yesVotes / total : 0.5;

  if (!open) {
    return (
      <div className="panel">
        <div className="panel-head"><span>Trade</span></div>
        <div className="panel-body muted">This market is closed to new votes.</div>
      </div>
    );
  }
  if (!user) {
    return (
      <div className="panel">
        <div className="panel-head"><span>Trade</span></div>
        <div className="panel-body">
          <p className="muted" style={{ marginTop: 0 }}>Log in to cast your free vote. New accounts start with 10 credits.</p>
          <Link href="/login" className="btn btn-primary btn-block">Log in to vote</Link>
        </div>
      </div>
    );
  }

  const max = user.credits;
  const c = Math.min(Math.max(0, credits), max);
  const weight = c + (user.hasFree ? 1 : 0);
  const newP = (yesVotes + (side === "yes" ? weight : 0)) / (total + weight || 1);

  // Estimated payout if this side is verified, given current stakes.
  const sideStake = (side === "yes" ? yesStake : noStake) + c;
  const poolAfter = yesStake + noStake + c;
  const estPayout = c > 0 ? Math.floor((c * poolAfter) / sideStake) : 0;
  const canSubmit = weight > 0 && !pending;

  return (
    <div className="panel">
      <div className="panel-head">
        <span>Trade</span>
        <span className="accent num">{user.credits} CR available</span>
      </div>
      <form action={action} className="panel-body">
        <input type="hidden" name="question_id" value={questionId} />
        <input type="hidden" name="side" value={side} />
        <input type="hidden" name="credits" value={c} />
        {state?.error && <div className="msg msg-err">ERR: {state.error}</div>}
        {state?.ok && <div className="msg msg-ok">{state.ok}</div>}

        <div className="sides">
          <button type="button" className={`btn btn-yes ${side === "yes" ? "on" : ""}`} onClick={() => setSide("yes")}>
            YES <small className="num">{pct(p)}</small>
          </button>
          <button type="button" className={`btn btn-no ${side === "no" ? "on" : ""}`} onClick={() => setSide("no")}>
            NO <small className="num">{pct(1 - p)}</small>
          </button>
        </div>

        <label className="label">Credits to stake {user.hasFree ? "(optional)" : ""}</label>
        <div className="stepper">
          <button type="button" onClick={() => setCredits(Math.max(0, c - 1))} aria-label="Less">−</button>
          <input
            className="input num"
            inputMode="numeric"
            value={c}
            onChange={(e) => setCredits(Number(e.target.value.replace(/\D/g, "")) || 0)}
            aria-label="Credits"
          />
          <button type="button" onClick={() => setCredits(Math.min(max, c + 1))} aria-label="More">+</button>
        </div>
        <div className="chips">
          {[1, 5, 10].map((n) => (
            <button type="button" key={n} onClick={() => setCredits(Math.min(max, c + n))}>+{n}</button>
          ))}
          <button type="button" onClick={() => setCredits(max)}>MAX</button>
          <button type="button" onClick={() => setCredits(0)}>CLR</button>
        </div>

        <div className="summary num">
          <div className="row"><span className="muted">Free vote</span><span>{user.hasFree ? "+1 (unused)" : "used"}</span></div>
          <div className="row"><span className="muted">Credit votes</span><span>+{c}</span></div>
          <div className="row"><span className="muted">Total weight</span><span>{weight}</span></div>
          <div className="row"><span className="muted">YES after vote</span><span className="yes">{pct(newP)}</span></div>
          <div className="row"><span className="muted">Est. payout if {side.toUpperCase()}</span><span className="accent">{estPayout} CR</span></div>
          {!user.hasVoted && (
            <div className="row"><span className="muted">Lucky roll</span><span className="warn" style={{ color: "var(--warn)" }}>1 in 5 → +5 CR</span></div>
          )}
        </div>

        <button className={`btn btn-block ${side === "yes" ? "btn-yes on" : "btn-no on"}`} style={{ marginTop: 14 }} disabled={!canSubmit}>
          {pending ? "Submitting…" : weight === 0 ? "Add credits to vote again" : `Vote ${side.toUpperCase()} ×${weight}`}
        </button>
        <p className="hint" style={{ marginBottom: 0 }}>
          1 free vote per market. Each credit = 1 extra vote. Only staked credits earn payouts when the outcome is verified.
        </p>
      </form>
    </div>
  );
}
