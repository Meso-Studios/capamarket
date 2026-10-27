import { createClient } from "@supabase/supabase-js";

// Public by design: the publishable key only reaches the functions in db/api.sql.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://zbioxcjilzvyyrangsze.supabase.co";
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_KEY || "sb_publishable_pAX31d13ancIYjbyEdkatA__Wqwsa5z";

/** "/capamarket" on GitHub Pages, "" locally. */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/** Calls a db/api.sql function; throws with the function's own error message. */
export async function rpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export type FormState = { error?: string; ok?: string } | undefined;

/** Wraps an async step for useActionState: returns { ok } or { error }. */
export async function attempt(fn: () => Promise<string | void>): Promise<FormState> {
  try {
    const ok = await fn();
    return ok ? { ok } : {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
