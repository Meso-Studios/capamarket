"use client";

import { useActionState } from "react";
import { fineUser, warnUser, type FormState } from "@/app/actions";

export function WarnForm({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(warnUser, undefined);
  return (
    <form action={action} key={state?.ok}>
      <input type="hidden" name="user_id" value={userId} />
      {state?.error && <div className="msg msg-err">ERR: {state.error}</div>}
      {state?.ok && <div className="msg msg-ok">{state.ok}</div>}
      <label className="label" htmlFor="message">Warning message</label>
      <textarea className="textarea" id="message" name="message" maxLength={1000} style={{ minHeight: 70 }} placeholder="Your post broke the rules because…" required />
      <button className="btn btn-warn btn-block" style={{ marginTop: 8 }} disabled={pending}>
        {pending ? "Sending…" : "Send warning"}
      </button>
    </form>
  );
}

export function FineForm({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(fineUser, undefined);
  return (
    <form action={action} key={state?.ok}>
      <input type="hidden" name="user_id" value={userId} />
      {state?.error && <div className="msg msg-err">ERR: {state.error}</div>}
      {state?.ok && <div className="msg msg-ok">{state.ok}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 8 }}>
        <div>
          <label className="label" htmlFor="amount">ELO</label>
          <input className="input num" id="amount" name="amount" type="number" min={1} max={1000} defaultValue={10} required />
        </div>
        <div>
          <label className="label" htmlFor="reason">Reason</label>
          <input className="input" id="reason" name="reason" maxLength={500} placeholder="Abuse of reporting" required />
        </div>
      </div>
      <button className="btn btn-no btn-block" style={{ marginTop: 8 }} disabled={pending}>
        {pending ? "Applying…" : "Fine ELO"}
      </button>
    </form>
  );
}
