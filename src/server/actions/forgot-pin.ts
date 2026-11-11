"use server";

import { redirect } from "next/navigation";
import { type ActionState, friendlyDbError, validationFailed } from "@/lib/action-result";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { setPinSchema, verifyCodeSchema } from "@/lib/validation/portal";
import { clientIp, withinLimit } from "@/server/rate-limit";

const QUARTER_HOUR = 900;

export type ResetWho = "member" | "staff";

/**
 * Forgot PIN or card, step 2: check the emailed code. The person is now signed in by email.
 * Says whether they are staff or a member, so the next step saves the new PIN in the right place.
 */
export async function verifyResetCodeAction(email: string, code: string): Promise<ActionState & { who?: ResetWho }> {
  const parsed = verifyCodeSchema.safeParse({ email, code });
  if (!parsed.success) return validationFailed(parsed.error);

  const ip = await clientIp();
  const allowed =
    (await withinLimit(`verify:email:${parsed.data.email}`, 10, QUARTER_HOUR)) && (await withinLimit(`verify:ip:${ip}`, 40, QUARTER_HOUR));
  if (!allowed) return { error: "Too many tries. Please wait a few minutes and try again." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({ email: parsed.data.email, token: parsed.data.code, type: "email" });
  if (error || !data.user) return { error: "That code didn't work. It may have expired. Go back and ask for a new one." };

  const { data: employee } = await supabase.from("employees").select("id, is_active").eq("id", data.user.id).maybeSingle();
  if (employee?.is_active) return { ok: true, who: "staff" };

  const { data: link } = await supabase.rpc("portal_link_account");
  if (link?.state === "linked") return { ok: true, who: "member" };

  await supabase.auth.signOut({ scope: "local" });
  return { error: "We couldn't find a membership with this email. Please ask at the store." };
}

/** Forgot PIN or card, step 3: save the new PIN and go to the right place. */
export async function saveNewPinAction(who: ResetWho, pin: string): Promise<ActionState> {
  const parsed = setPinSchema.safeParse({ pin, confirmPin: pin });
  if (!parsed.success) return validationFailed(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc(who === "staff" ? "staff_set_my_pin" : "portal_set_pin", { p_pin: parsed.data.pin });
  if (error) {
    if (who === "staff" && /no_card|card/i.test(error.message ?? "")) {
      return { error: "You don't have a member card yet. Ask the Owner to give you one, then set your PIN." };
    }
    return { error: friendlyDbError(error) };
  }
  redirect(who === "staff" ? "/staff" : "/my");
}
