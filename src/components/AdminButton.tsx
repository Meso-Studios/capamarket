"use client";

import { useState } from "react";

/** A button that runs one admin RPC, then reloads. */
export function AdminButton({
  run,
  after,
  className,
  confirm: confirmText,
  children,
}: {
  run: () => Promise<unknown>;
  after: () => Promise<void> | void;
  className: string;
  confirm?: string;
  children: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      {err && <div className="msg msg-err">ERR: {err}</div>}
      <button
        type="button"
        className={className}
        disabled={busy}
        onClick={async () => {
          if (confirmText && !window.confirm(confirmText)) return;
          setBusy(true);
          setErr(null);
          try {
            await run();
            await after();
          } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "…" : children}
      </button>
    </>
  );
}
