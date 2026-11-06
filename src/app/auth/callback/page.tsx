"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { AuthShell } from "@/components/staff/auth-shell";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Landing page for links in Supabase's standard emails (staff invite, password reset).
 * Supabase sends the user here either with ?code=… or with #access_token=… — we turn
 * either into a signed-in session, then continue to `next` (default: set password).
 */
export default function AuthCallbackPage() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const hash = new URLSearchParams(url.hash.slice(1));
    const next = url.searchParams.get("next") ?? "/staff/set-password";
    const safeNext = next.startsWith("/staff/") ? next : "/staff/set-password";

    async function finishSignIn() {
      if (url.searchParams.get("error") || hash.get("error")) return false;
      const supabase = createSupabaseBrowserClient();

      const code = url.searchParams.get("code");
      if (code) return !(await supabase.auth.exchangeCodeForSession(code)).error;

      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      if (accessToken && refreshToken) {
        return !(await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })).error;
      }
      return false;
    }

    finishSignIn().then((ok) => {
      // Full page load so the server sees the new session cookies.
      if (ok) window.location.replace(safeNext);
      else setFailed(true);
    });
  }, []);

  return (
    <AuthShell title={failed ? "Link expired" : "Signing you in…"}>
      {failed ? (
        <p className="text-sm">
          This link has expired or was already used. Ask the Owner or your Manager for a new invite, or{" "}
          <Link href="/staff/forgot-password" className="font-medium text-brand-blue hover:underline">
            reset your password
          </Link>
          .
        </p>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 aria-hidden className="size-4 animate-spin" /> One moment…
        </p>
      )}
    </AuthShell>
  );
}
