"use server";

import { redirect } from "next/navigation";
import { type ActionState, friendlyDbError, validationFailed } from "@/lib/action-result";
import { serverEnv } from "@/lib/env.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { emailRequestSchema, setPinSchema } from "@/lib/validation/portal";
import { clientIp, withinLimit } from "@/server/rate-limit";

const HOUR = 3600;

export type ResetWho = "member" | "staff";

/**
 * Forgot PIN or card, step 1: email a sign-in link. Tapping it opens "choose a new PIN".
 * The answer is always the same, so it never reveals whether an email is on an account.
 */
export async function requestResetLinkAction(email: string): Promise<ActionState> {
  const parsed = emailRequestSchema.safeParse({ email });
  if (!parsed.success) return validationFailed(parsed.error);

  const ip = await clientIp();
  const allowed =
    (await withinLimit(`code:email:${parsed.data.email}`, 5, HOUR)) && (await withinLimit(`code:ip:${ip}`, 30, HOUR));
  if (!allowed) return { error: "Too many tries. Please wait a little while and try again." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${serverEnv().NEXT_PUBLIC_SITE_URL}/auth/callback?next=/login/forgot/new-pin`,
    },
  });
  if (error) {
    return error.code === "over_email_send_rate_limit" || error.status === 429
      ? { error: "An email was just sent. Please wait a minute before asking for another." }
      : { error: "We couldn't send the email right now. Please try again in a few minutes." };
  }
  return { ok: true };
}

/** Who the person who tapped the email link is: staff, a member, or nobody we know. */
export async function resetWho(): Promise<ResetWho | "signed_out" | "unknown"> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return "signed_out";

  const { data: employee } = await supabase.from("employees").select("id, is_active").eq("id", data.user.id).maybeSingle();
  if (employee?.is_active) return "staff";

  const { data: link } = await supabase.rpc("portal_link_account");
  return link?.state === "linked" ? "member" : "unknown";
}

/** Forgot PIN or card, step 2: save the new PIN and go to the right place. */
export async function saveNewPinAction(pin: string, confirmPin: string): Promise<ActionState> {
  const parsed = setPinSchema.safeParse({ pin, confirmPin });
  if (!parsed.success) return validationFailed(parsed.error);

  const who = await resetWho();
  if (who === "signed_out") return { error: "The link has expired. Please ask for a new one." };
  if (who === "unknown") return { error: "We couldn't find a membership with this email. Please ask at the store." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc(who === "staff" ? "staff_set_my_pin" : "portal_set_pin", { p_pin: parsed.data.pin });
  if (error) {
    if (who === "staff" && /card/i.test(error.message ?? "")) {
      return { error: "You don't have a member card yet. Ask the Owner to give you one, then set your PIN." };
    }
    return { error: friendlyDbError(error) };
  }
  redirect(who === "staff" ? "/staff" : "/my");
}
