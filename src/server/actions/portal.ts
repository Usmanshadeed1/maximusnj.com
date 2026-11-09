"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
