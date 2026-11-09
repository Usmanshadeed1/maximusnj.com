import "server-only";
import { headers } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** The visitor's address as seen by the host (Vercel sets x-forwarded-for). Only used to throttle abuse. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || h.get("x-real-ip") || "unknown").slice(0, 64);
}

/**
 * Counts one attempt and says whether it is still within the limit.
 * If the limiter itself can't be reached it answers "no" (fail closed): a short outage is
 * better than letting someone hammer the login.
 */
export async function withinLimit(key: string, max: number, windowSeconds: number): Promise<boolean> {
  try {
    const { data, error } = await createSupabaseAdminClient().rpc("rate_limit_hit", {
      p_key: key,
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}
