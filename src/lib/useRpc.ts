"use client";

import { useCallback, useEffect, useState } from "react";
import { rpc } from "./supabase";
import { useSession } from "@/components/Session";

/** Loads a db/api.sql function; reloads when args or the signed-in user change. */
export function useRpc<T>(fn: string | null, args?: Record<string, unknown>) {
  const { me } = useSession();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const key = JSON.stringify([fn, args, me?.id ?? null]);

  const load = useCallback(async () => {
    if (!fn) return;
    try {
      setData(await rpc<T>(fn, args));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (me === undefined) return; // wait until we know who is signed in
    setLoading(true);
    load();
  }, [load, me]);

  return { data, error, loading, reload: load };
}
