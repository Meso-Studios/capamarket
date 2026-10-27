"use client";

import { useActionState, useState } from "react";
import { reportQuestion, type FormState } from "@/app/actions";
import { REPORT_REASONS } from "@/lib/format";

export function ReportButton({ questionId, alreadyReported }: { questionId: number; alreadyReported: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(reportQuestion, undefined);

  if (alreadyReported || state?.ok) {
    return <div className="hint" style={{ textAlign: "center" }}>⚑ {state?.ok ?? "You reported this market. An admin will review it."}</div>;
  }
  if (!open) {
    return (
      <button type="button" className="btn btn-ghost btn-block" onClick={() => setOpen(true)}>
        ⚑ Report post
      </button>
    );
  }
  return (
    <form action={action} className="panel">
      <div className="panel-head">
        <span>Report post</span>
        <button type="button" className="btn btn-ghost" style={{ padding: 0 }} onClick={() => setOpen(false)}>✕</button>
      </div>
      <div className="panel-body">
        <input type="hidden" name="question_id" value={questionId} />
        {state?.error && <div className="msg msg-err">ERR: {state.error}</div>}
        <div className="field">
          <label className="label" htmlFor="reason">Reason</label>
          <select className="select" id="reason" name="reason" defaultValue={REPORT_REASONS[0]}>
            {REPORT_REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="details">Details (optional)</label>
          <textarea className="textarea" id="details" name="details" maxLength={500} style={{ minHeight: 70 }} />
        </div>
        <button className="btn btn-no on btn-block" disabled={pending}>
          {pending ? "Sending…" : "Send report to admin"}
        </button>
      </div>
    </form>
  );
}
