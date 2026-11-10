"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** What the home page shows after a PIN that did not sign anyone in. */
export type HomePinOutcome = { error: string };

const MESSAGES = {
  inactive: "This membership isn't active. Please ask at the store.",
  no_email: "Your profile has no email yet. Please ask at the store to add one.",
  contact_store: "We couldn't sign you in. Please ask at the store.",
  error: "Something went wrong. Please try again.",
} as const;

/** The visitor's network address, used only to count wrong PINs. */
async function clientKey(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim().slice(0, 64);
}

/**
 * Home page: the PIN alone signs the person in (client decision). A customer goes to their
 * member page, an employee to the staff dashboard. Never records a visit.
 */
export async function homePinSignInAction(pin: string): Promise<HomePinOutcome> {
  if (!/^[0-9]{6,12}$/.test(String(pin))) return { error: "A PIN is 6 to 12 numbers." };

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("web_pin_sign_in", { p_pin: pin, p_client_key: await clientKey() });
  if (error || !data) return { error: MESSAGES.error };

  switch (data.result) {
    case "pin_not_found":
      return {
        error:
          data.attempts_left > 0
            ? `We don't recognise that PIN. ${data.attempts_left} ${data.attempts_left === 1 ? "try" : "tries"} left.`
            : "We don't recognise that PIN.",
      };
    case "locked":
    case "pin_locked":
      return { error: `Too many wrong PINs. Please try again in ${data.minutes_left} ${data.minutes_left === 1 ? "minute" : "minutes"}.` };
    case "inactive":
    case "no_email":
    case "contact_store":
      return { error: MESSAGES[data.result] };
  }

  // A one-time sign-in made by the server; it never reaches the browser as a link.
  let link = await admin.auth.admin.generateLink({ type: "magiclink", email: data.email });
  if (link.error && data.kind === "member") {
    // First time online: make their login, then sign in.
    const created = await admin.auth.admin.createUser({ email: data.email, email_confirm: true });
    if (created.error) return { error: MESSAGES.error };
    link = await admin.auth.admin.generateLink({ type: "magiclink", email: data.email });
  }
  const otp = link.data?.properties?.email_otp;
  if (link.error || !otp) return { error: MESSAGES.error };

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: "local" });
  const fresh = await createSupabaseServerClient();
  const { error: verifyError } = await fresh.auth.verifyOtp({ email: data.email, token: otp, type: "email" });
  if (verifyError) return { error: MESSAGES.error };

  if (data.kind === "staff") redirect("/staff");

  if (link.data.user?.id) {
    await admin.rpc("web_pin_link", { p_customer_id: data.customer_id, p_user_id: link.data.user.id });
  }
  redirect("/my");
}
