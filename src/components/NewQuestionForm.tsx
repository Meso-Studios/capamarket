"use client";

import { useActionState } from "react";
import { createQuestion, type FormState } from "@/app/actions";
import { CATEGORIES } from "@/lib/format";

export function NewQuestionForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createQuestion, undefined);
  return (
    <form action={action} className="panel" style={{ maxWidth: 760 }}>
      <div className="panel-head">
        <span>$ market create</span>
        <span className="accent">+1 CR on post</span>
      </div>
      <div className="panel-body">
        {state?.error && <div className="msg msg-err">ERR: {state.error}</div>}
        <div className="field">
          <label className="label" htmlFor="title">Question</label>
          <input className="input" id="title" name="title" maxLength={200} placeholder="Will SpaceX land humans on Mars before 2030?" required />
          <div className="hint">A yes/no question about a future, verifiable event.</div>
        </div>
        <div className="field">
          <label className="label" htmlFor="description">Resolution criteria</label>
          <textarea className="textarea" id="description" name="description" maxLength={2000} placeholder="Resolves YES if… Source: …" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
          <div className="field">
            <label className="label" htmlFor="category">Category</label>
            <select className="select" id="category" name="category" defaultValue="General">
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="closes_at">Voting closes (optional)</label>
            <input className="input" id="closes_at" name="closes_at" type="datetime-local" />
          </div>
        </div>
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Posting…" : "Post market →"}
        </button>
      </div>
    </form>
  );
}
