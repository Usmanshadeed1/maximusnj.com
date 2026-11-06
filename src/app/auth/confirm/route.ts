import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ALLOWED_TYPES: EmailOtpType[] = ["invite", "recovery", "email", "magiclink", "signup"];

/**
 * Landing point for links in Supabase emails (invite, password reset).
 * The email templates link here with ?token_hash=…&type=…&next=… (see supabase/templates).
 * Verifying the token signs the user in, then we continue to `next`.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/staff/set-password";

  // Only allow redirects inside our own staff area.
  const safeNext = next.startsWith("/staff/") ? next : "/staff/set-password";

  if (tokenHash && type && ALLOWED_TYPES.includes(type)) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(safeNext, request.url));
  }

  return NextResponse.redirect(new URL("/staff/login?error=link_expired", request.url));
}
