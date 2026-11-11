"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { AuthShell } from "@/components/staff/auth-shell";

/**
 * Landing page for links in Supabase's standard emails (staff invite, password reset).
 * Supabase sends the user here with either ?code=… or #access_token=…&refresh_token=….
 * The page hands those to /auth/session, which signs in on the server, then continues
 * to `next` (default: choose a password).
 */
const RESET_NEXT = "/login/forgot/new-pin";

export default function AuthCallbackPage() {
  const [failed, setFailed] = useState(false);
  const [forPin, setForPin] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const hash = new URLSearchParams(url.hash.slice(1));
    const next = url.searchParams.get("next") ?? "/staff/set-password";
    const safeNext = next.startsWith("/staff/") || next === RESET_NEXT ? next : "/staff/set-password";

    // Remove tokens from the address bar and browser history right away.
    window.history.replaceState(null, "", url.pathname);

    const code = url.searchParams.get("code");
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    const payload = code ? { code } : accessToken && refreshToken ? { accessToken, refreshToken } : null;

    const linkHasError = Boolean(url.searchParams.get("error") || hash.get("error"));

    async function finishSignIn(): Promise<boolean> {
      if (!payload || linkHasError) return false;
      try {
        const res = await fetch("/auth/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        return res.ok;
      } catch {
        return false;
      }
    }

    void finishSignIn().then((ok) => {
      // Full page load so the next page renders with the new session.
      if (ok) window.location.replace(safeNext);
      else {
        setForPin(next === RESET_NEXT);
        setFailed(true);
      }
    });
  }, []);

  return (
    <AuthShell title={failed ? "Link expired" : "Signing you in…"}>
      {failed && forPin ? (
        <p className="text-sm">
          This link has expired or was already used.{" "}
          <Link href="/login/forgot" className="font-medium text-brand-blue hover:underline">
            Send a new link
          </Link>
          .
        </p>
      ) : failed ? (
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
