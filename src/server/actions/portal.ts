"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { type ActionState, friendlyDbError, validationFailed } from "@/lib/action-result";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  emailRequestSchema,
  notifyPrefsSchema,
  setPinSchema,
  signUpSchema,
  verifyCodeSchema,
} from "@/lib/validation/portal";
import { getMemberAccess } from "@/server/portal";
import { clientIp, withinLimit } from "@/server/rate-limit";

const HOUR = 3600;
const QUARTER_HOUR = 900;

/**
 * Step 1 of signing in: email a one-time code.
 * The answer is always the same, so it never reveals whether an email belongs to a member (§11).
 */
export async function requestLoginCodeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = emailRequestSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return validationFailed(parsed.error);
  const { email } = parsed.data;

  const ip = await clientIp();
  const allowed =
    (await withinLimit(`code:email:${email}`, 5, HOUR)) && (await withinLimit(`code:ip:${ip}`, 30, HOUR));
  if (!allowed) return { error: "Too many tries. Please wait a little while and try again." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) {
    return error.code === "over_email_send_rate_limit" || error.status === 429
      ? { error: "A code was just sent. Please wait a minute before asking for another." }
      : { error: "We couldn't send a code right now. Please try again in a few minutes." };
  }
  return { ok: true, message: "Code sent." };
}

/** Step 2: check the code. A wrong, used or expired code all get the same message. */
export async function verifyLoginCodeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = verifyCodeSchema.safeParse({ email: formData.get("email"), code: formData.get("code") });
  if (!parsed.success) return validationFailed(parsed.error);
  const { email, code } = parsed.data;

  const ip = await clientIp();
  const allowed =
    (await withinLimit(`verify:email:${email}`, 10, QUARTER_HOUR)) && (await withinLimit(`verify:ip:${ip}`, 40, QUARTER_HOUR));
  if (!allowed) return { error: "Too many tries. Please wait a few minutes and try again." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error || !data.session) {
    return { error: "That code didn't work. It may have expired — go back and ask for a new one." };
  }
  redirect("/my");
}

export async function memberSignOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/my/login");
}

/** Online sign-up (§5.2): only for a verified email that no member record uses. */
export async function memberSignUpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const access = await getMemberAccess();
  if (access.status === "signed_out") redirect("/my/login");
  if (access.status === "member") redirect("/my");
  if (access.status !== "needs_signup") redirect("/my/help");

  if (!(await withinLimit(`signup:ip:${await clientIp()}`, 20, HOUR))) {
    return { error: "Too many tries from this connection. Please wait a little while and try again." };
  }

  const parsed = signUpSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    mobile: formData.get("mobile"),
    homeLocationId: formData.get("homeLocationId"),
    age13: formData.get("age13") === "on",
  });
  if (!parsed.success) return validationFailed(parsed.error);
  const input = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("portal_sign_up", {
    p_first_name: input.firstName,
    p_last_name: input.lastName,
    p_mobile: input.mobile ?? "",
    p_home_location_id: input.homeLocationId,
    p_age_13: input.age13,
  });
  if (error) {
    if (error.message === "signup_not_allowed") redirect("/my/help");
    return { error: friendlyDbError(error) };
  }
  revalidatePath("/my", "layout");
  redirect("/my?welcome=1");
}

/** The member sets or changes their own PIN. Never logged; the database stores only a hash. */
export async function setPinAction(pin: string, confirmPin: string): Promise<ActionState> {
  const access = await getMemberAccess();
  if (access.status !== "member") return { error: "Please sign in again." };

  const parsed = setPinSchema.safeParse({ pin, confirmPin });
  if (!parsed.success) return validationFailed(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("portal_set_pin", { p_pin: parsed.data.pin });
  if (error) return { error: friendlyDbError(error) };
  revalidatePath("/my", "layout");
  return { ok: true, message: access.data.hasPin ? "Your PIN was changed." : "Your PIN is set." };
}

export async function setNotifyPrefsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const access = await getMemberAccess();
  if (access.status !== "member") redirect("/my/login");

  const parsed = notifyPrefsSchema.safeParse(formData.getAll("prefs").map(String));
  if (!parsed.success) return { error: "Choose from the options shown." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("portal_set_notify_prefs", { p_prefs: parsed.data });
  if (error) return { error: friendlyDbError(error) };
  revalidatePath("/my", "layout");
  return { ok: true, message: "Saved." };
}

/** What a member is told when an entry doesn't go through. Written to "you", never revealing other people. */
const RAFFLE_MESSAGES: Record<string, string> = {
  raffle_not_open: "This raffle isn't open for entries right now.",
  already_entered: "You're already entered in this raffle.",
  entered_other_raffle: "You've already entered another store's raffle for this release. You can only enter one.",
  entry_removed: "Please ask a team member in store about your entry.",
  customer_inactive: "Your membership is paused. Please visit a store.",
  not_active: "You don't have an entry in this raffle.",
  choices_required: "Pick at least one product.",
  choices_duplicate: "Each product can only be picked once.",
  choice_invalid: "One of those products is no longer offered. Refresh the page and try again.",
};

async function raffleCall(
  raffleId: unknown,
  rpc: "portal_enter_raffle" | "portal_withdraw_entry",
  done: string,
  choices: string[] = [],
): Promise<ActionState> {
  const access = await getMemberAccess();
  if (access.status !== "member") return { error: "Please sign in again." };
  const id = z.uuid().safeParse(raffleId);
  if (!id.success) return { error: "That raffle is no longer available." };
  if (!(await withinLimit(`raffle:${access.data.memberNumber}`, 30, 600))) {
    return { error: "Too many tries. Please wait a few minutes and try again." };
  }

  const supabase = await createSupabaseServerClient();
  const cleanChoices = choices.filter((c) => z.uuid().safeParse(c).success);
  const { error } =
    rpc === "portal_enter_raffle"
      ? await supabase.rpc(rpc, { p_raffle_id: id.data, p_choices: cleanChoices })
      : await supabase.rpc(rpc, { p_raffle_id: id.data });
  revalidatePath("/my/raffles");
  if (error) return { error: RAFFLE_MESSAGES[error.message] ?? "Something went wrong. Please try again." };
  return { ok: true, message: done };
}

export async function enterRaffleAction(raffleId: string, choices: string[] = []): Promise<ActionState> {
  return raffleCall(raffleId, "portal_enter_raffle", "You're in! Good luck.", Array.isArray(choices) ? choices.slice(0, 50) : []);
}

export async function withdrawRaffleAction(raffleId: string): Promise<ActionState> {
  return raffleCall(raffleId, "portal_withdraw_entry", "Your entry was withdrawn.");
}
