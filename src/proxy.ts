import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";

/** Same name as KIOSK_COOKIE in src/server/kiosk-context.ts (that file is server-only). */
const KIOSK_COOKIE = "mx_kiosk";

/** Staff pages anyone may open without being signed in. */
const PUBLIC_STAFF_PATHS = ["/staff/login", "/staff/forgot-password"];

/**
 * Runs before /staff, /auth and /my (member portal) requests:
 *  1. refreshes the Supabase session cookies, and
 *  2. sends signed-out visitors to the login page (an optimistic check only —
 *     every page and action still verifies the user and role on the server).
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!isSupabaseConfigured()) return response;

  const env = publicEnv();
  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const { pathname } = request.nextUrl;

  const isPublicStaffPath = PUBLIC_STAFF_PATHS.some((p) => pathname.startsWith(p));
  if (pathname.startsWith("/staff") && !isPublicStaffPath && !signedIn) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // A device in kiosk mode stays on the kiosk. Leaving needs staff credentials (§6).
  const isKioskDevice = request.cookies.has(KIOSK_COOKIE);
  // The store tablet never shows the home page: it always opens the check-in kiosk.
  if (isKioskDevice && pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/staff/kiosk";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (isKioskDevice && pathname.startsWith("/staff") && !pathname.startsWith("/staff/kiosk") && !isPublicStaffPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/staff/kiosk";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/", "/staff/:path*", "/auth/:path*", "/my/:path*"],
};
