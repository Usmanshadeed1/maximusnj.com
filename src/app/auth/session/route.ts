import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const bodySchema = z.union([
  z.object({ accessToken: z.string().min(20), refreshToken: z.string().min(10) }),
  z.object({ code: z.string().min(10) }),
]);

/**
 * Finishes sign-in from an email link ON THE SERVER and writes the session cookies.
 * Called by /auth/callback. Replaces any session already in the browser (e.g. when an
 * Owner opens a new employee's invite on the same computer).
 */
export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { error } =
    "code" in parsed.data
      ? await supabase.auth.exchangeCodeForSession(parsed.data.code)
      : await supabase.auth.setSession({
          access_token: parsed.data.accessToken,
          refresh_token: parsed.data.refreshToken,
        });

  return NextResponse.json({ ok: !error }, { status: error ? 401 : 200 });
}
